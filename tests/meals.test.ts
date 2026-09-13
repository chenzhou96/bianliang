import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestedMeal,
  reservedFood,
  newGame,
  dispatch,
  quantity,
  actionPreview,
  readSave,
} from '../lib/game/engine.ts';
import { MEALS } from '../lib/game/config.ts';
import { publicState } from '../lib/game/webmcp.ts';
import { act } from './helpers.ts';
import type { Meal } from '../lib/game/types.ts';

for (const meal of Object.keys(MEALS) as Exclude<Meal, 'none'>[]) {
  await test(`${meal}: 主餐扣除完整配方、记入生活账并兑现预览`, () => {
    let s = newGame(910);
    s = act(s, { type: 'trade', good: 'egg', side: 'buy', quantity: 1 });
    s = act(s, { type: 'trade', good: 'saltedEgg', side: 'buy', quantity: 1 });
    s.health = 70;
    const preview = actionPreview(s, { type: 'eat', meal });
    const after = act(s, { type: 'eat', meal });
    assert.equal(after.health - s.health, MEALS[meal].health);
    assert.equal(s.cash - after.cash, MEALS[meal].cash);
    assert.equal(after.clock.minute - s.clock.minute, 30);
    for (const good of ['grain', 'bread', 'egg', 'saltedEgg'] as const)
      assert.equal(
        quantity(s, good) - quantity(after, good),
        MEALS[meal].ingredients[good] ?? 0,
      );
    assert.equal(preview.healthChange, after.health - s.health);
    assert.equal(preview.cashChange, after.cash - s.cash);
    const inventoryBefore = s.batches.reduce(
      (total, batch) => total + batch.cost,
      0,
    );
    const inventoryAfter = after.batches.reduce(
      (total, batch) => total + batch.cost,
      0,
    );
    assert.equal(
      after.ledger.living - s.ledger.living,
      inventoryBefore - inventoryAfter + MEALS[meal].cash,
    );
    assert.deepEqual(readSave(JSON.stringify(after)), after);
  });
}

await test('蛋类不能单独充当主餐；缺少配菜时不扣除米粮或推进时间', () => {
  for (const meal of ['egg', 'saltedEgg'] as const) {
    const s = newGame(911);
    const before = structuredClone(s);
    const result = dispatch(s, { type: 'eat', meal });
    assert(result.error);
    assert.deepEqual(s, before);
    assert.equal(quantity(result.state, 'grain'), quantity(s, 'grain'));
    assert.equal(result.state.clock.minute, s.clock.minute);
  }
});

await test('重复用餐不刷健康；食肆明码实价且资金不足不扣款', () => {
  const s = newGame(912);
  s.health = 70;
  const first = act(s, { type: 'eat', meal: 'diner' });
  const second = act(first, { type: 'eat', meal: 'diner' });
  assert.equal(second.health, first.health);
  assert.equal(s.cash - second.cash, 120);
  s.cash = 59;
  const failed = dispatch(s, { type: 'eat', meal: 'diner' });
  assert(failed.error);
  assert.equal(failed.state.cash, 59);
  assert.deepEqual(publicState(s).meals, MEALS);
});

await test('只有蛋没有米不能用餐；收工组合沿用完整配饭规则', () => {
  let s = newGame(913);
  s = act(s, { type: 'trade', good: 'egg', side: 'buy', quantity: 1 });
  s.batches = s.batches.filter((b) => b.good !== 'grain');
  const failed = dispatch(s, { type: 'eat', meal: 'egg' });
  assert.match(failed.error!, /粟米/);
  assert.equal(quantity(failed.state, 'egg'), 1);
  s = act(s, { type: 'trade', good: 'grain', side: 'buy', quantity: 1 });
  const beforeGrain = quantity(s, 'grain');
  const after = act(s, { type: 'closeDay', meal: 'egg', bed: 'inn' });
  assert.equal(quantity(after, 'grain'), beforeGrain - 1);
  assert.equal(quantity(after, 'egg'), 0);
  assert.equal(after.clock.minute % 1440, 480);
});

await test('未用主餐时为粟米饭预留口粮，快捷饭食优先自备主食', () => {
  const s = newGame(914);
  assert.equal(suggestedMeal(s), 'bread');
  s.batches = s.batches.filter((b) => b.good !== 'bread');
  assert.equal(suggestedMeal(s), 'grain');
  assert.equal(reservedFood(s, 'grain'), 1);
  const after = act(s, { type: 'eat', meal: 'grain' });
  assert.equal(reservedFood(after, 'grain'), 0);
});

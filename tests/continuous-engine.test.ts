import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch, readSave, quantity } from '../lib/game/engine.ts';
import type { Action, GameState } from '../lib/game/types.ts';

function act(s: GameState, a: Action) {
  const result = dispatch(s, a);
  assert.equal(result.error, undefined, result.error);
  return result.state;
}

await test('实际行动推进时钟，浏览与失败不改变时钟或随机状态', () => {
  let s = newGame(7);
  assert.equal(s.clock.minute, 480);
  s = act(s, { type: 'eat', meal: 'bread' });
  assert.equal(s.clock.minute, 510);
  assert.equal(quantity(s, 'bread'), 1);
  s = act(s, { type: 'market' });
  assert.equal(s.clock.minute, 510);
  const before = structuredClone(s);
  const bad = dispatch(s, {
    type: 'trade',
    side: 'buy',
    good: 'silk',
    quantity: 100,
  });
  assert.ok(bad.error);
  assert.deepEqual(bad.state, before);
  assert.deepEqual(s, before);
});

await test('无需夜间界面即可跨午夜睡醒，06点房费每周期只扣一次', () => {
  let s = newGame(7);
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s = act(s, { type: 'eat', meal: 'bread' });
  s = act(s, { type: 'wait', minutes: 810 });
  assert.equal(s.clock.minute, 1320);
  const cash = s.cash;
  s = act(s, { type: 'sleep', minutes: 480, bed: 'room' });
  assert.equal(s.clock.minute, 1800);
  assert.equal(s.day, 2);
  assert.equal(s.cash, cash - 12);
  assert.equal(s.clock.fatigueMinutes, 0);
  assert.equal(s.phase, 'day');
  s = act(s, { type: 'wait', minutes: 1 });
  assert.equal(s.cash, cash - 12);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

await test('新版拒绝旧夜间行动和旧存档，不修改原始状态', () => {
  const s = newGame(10);
  assert.ok(dispatch(s, { type: 'endDay' } as unknown as Action).error);
  assert.equal(s.clock.minute, 480);
  assert.throws(() =>
    readSave(JSON.stringify({ ...s, version: 2, saveRevision: 2 })),
  );
});

await test('主动喂养不重复消耗，自动喂养与06点产蛋同一周期联动', () => {
  let s = newGame(3);
  s.hens = [{ id: 9000, hunger: 0, cost: 100 }];
  s = act(s, { type: 'feed', count: 1 });
  const grain = quantity(s, 'grain');
  assert.ok(dispatch(s, { type: 'feed', count: 1 }).error);
  s = act(s, { type: 'autoFeed', enabled: true });
  s = act(s, { type: 'wait', minutes: 1800 - s.clock.minute });
  assert.equal(quantity(s, 'grain'), grain);
  assert.deepEqual(s.life.fed, []);
  assert.equal(s.hens[0].hunger, 0);
});

await test('休息可重复但占用时间，不清除睡眠不足', () => {
  let s = newGame(3);
  s.stamina = 10;
  s = act(s, { type: 'rest' });
  assert.equal(s.stamina, 30);
  const debt = s.clock.sleepDebt;
  s = act(s, { type: 'rest' });
  assert.equal(s.stamina, 50);
  assert.equal(s.clock.sleepDebt, debt);
  assert.equal(s.clock.fatigueMinutes, 120);
  assert.equal(s.clock.minute, 600);
});

await test('低体力交易不重复触发旧版健康惩罚', () => {
  let s = newGame(17);
  s.health = 80;
  s.stamina = 10;
  s = act(s, { type: 'trade', side: 'buy', good: 'grain', quantity: 1 });
  assert.ok(s.stamina < 10);
  assert.equal(s.health, 80);
  assert.equal(s.buffs.tired, undefined);
});

await test('卧房只改善在住所的睡眠，外宿不获得家中设施加成', () => {
  const base = newGame(19);
  base.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  base.stamina = 0;
  const furnished = structuredClone(base);
  furnished.home.facilities = [{ kind: 'bedroom', installed: true }];
  for (const bed of ['inn', 'temple', 'street'] as const) {
    const ordinary = act(base, { type: 'sleep', minutes: 60, bed });
    const upgraded = act(furnished, { type: 'sleep', minutes: 60, bed });
    assert.equal(upgraded.stamina, ordinary.stamina, bed);
  }
  const ordinary = act(base, { type: 'sleep', minutes: 60, bed: 'room' });
  const upgraded = act(furnished, { type: 'sleep', minutes: 60, bed: 'room' });
  assert.ok(Math.abs(upgraded.stamina - ordinary.stamina * 1.15) < 1e-8);
});

await test('睡眠中自动喂养不足会报告未喂数量，且不会擅自买饲料', () => {
  let s = newGame(49);
  s.hens = [1, 2, 3].map((n) => ({ id: 9000 + n, hunger: 0, cost: 100 }));
  s.batches = s.batches.filter((b) => b.good === 'grain');
  s.batches[0].units = 2;
  s.batches[0].cost = 4;
  s = act(s, { type: 'autoFeed', enabled: true });
  s = act(s, { type: 'wait', minutes: 1320 - s.clock.minute });
  const cash = s.cash;
  s = act(s, { type: 'sleep', bed: 'inn', minutes: 480 });
  assert.equal(s.cash, cash - 30);
  assert.equal(quantity(s, 'grain'), 0);
  assert.equal(s.hens.filter((h) => h.hunger === 0).length, 1);
  assert.equal(s.hens.filter((h) => h.hunger === 1).length, 2);
  assert.ok(s.logs.some((l) => l.text.includes('仍有2只母鸡未喂')));
  assert.ok(
    s.life.wakeSummary?.lines.some((l) => l.includes('仍有2只母鸡未喂')),
  );
});

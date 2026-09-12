import { EVENTS } from '../lib/game/content.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readSave,
  newGame,
  dispatch,
  capacity,
  inventoryCost,
} from '../lib/game/engine.ts';
import { actionTiming } from '../lib/game/action-time.ts';
import type { Action, GameState } from '../lib/game/types.ts';

function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined, r.error);
  return r.state;
}
function resident() {
  const s = newGame(17);
  s.cash = 10000;
  s.housing = { id: 'yard', paidThrough: null, maintenanceSuspended: false };
  return s;
}

await test('推车需要购买，降低真实成交时间和体力，脚夫费用进入批次成本', () => {
  let s = resident();
  const a = { type: 'trade', good: 'tea', quantity: 5, side: 'buy' } as const;
  assert.ok(dispatch(s, { ...a, transport: 'cart' }).error);
  s = act(s, { type: 'buyCart' });
  const self = dispatch(s, a);
  const cart = dispatch(s, { ...a, transport: 'cart' });
  const porter = dispatch(s, { ...a, transport: 'porter' });
  assert.equal(self.error, undefined);
  assert.equal(cart.error, undefined);
  assert.equal(porter.error, undefined);
  assert.ok(cart.state.clock.minute < self.state.clock.minute);
  assert.ok(cart.state.stamina > self.state.stamina);
  assert.equal(s.cash - porter.state.cash, s.prices.tea.buy * 5 + 10);
  assert.equal(inventoryCost(porter.state, 'tea'), s.prices.tea.buy * 5 + 10);
});

await test('货房增仓并减少搬运时间，设施占用功能位且出售保留货物', () => {
  let s = resident();
  s.housing.id = 'room';
  s = act(s, { type: 'installFacility', facility: 'warehouse' });
  s = act(s, { type: 'installFacility', facility: 'bedroom' });
  assert.equal(capacity(s), 1400);
  assert.ok(
    dispatch(s, { type: 'installFacility', facility: 'coldStorage' }).error,
  );
  assert.equal(
    actionTiming(s, { type: 'trade', good: 'tea', quantity: 10, side: 'buy' })
      .minutes,
    26,
  );
  const goods = s.batches.map((b) => [b.id, b.units, b.cost]);
  s = act(s, { type: 'sellFacility', facility: 'warehouse' });
  assert.equal(capacity(s), 1000);
  assert.deepEqual(
    s.batches.map((b) => [b.id, b.units, b.cost]),
    goods,
  );
});

await test('凉储保护上限20单位，拆卸不刷新保鲜时间且库存成本守恒', () => {
  let s = resident();
  s = act(s, { type: 'installFacility', facility: 'coldStorage' });
  s.batches = [
    {
      id: s.nextId++,
      good: 'bread',
      units: 300,
      cost: 900,
      origin: 'buy',

      remainingMinutes: 1000,
    },
  ];
  s = act(s, { type: 'wait', minutes: 60 });
  assert.equal(
    s.batches.reduce((n, b) => n + b.units, 0),
    300,
  );
  assert.equal(
    s.batches.reduce((n, b) => n + b.cost, 0),
    900,
  );
  // 20 of 30 units age at half speed; redistribution never creates shelf life.
  const weighted = s.batches.reduce(
    (n, b) => n + b.units * b.remainingMinutes!,
    0,
  );
  assert.ok(Math.abs(weighted - (300 * 1000 - 200 * 30 - 100 * 60)) < 1e-8);
  s = act(s, { type: 'removeFacility', facility: 'coldStorage' });
  const before = s.batches.map((b) => b.remainingMinutes!);
  s = act(s, { type: 'wait', minutes: 30 });
  assert.deepEqual(
    s.batches.map((b) => b.remainingMinutes),
    before.map((n) => n - 30),
  );
});

await test('卧房增加睡眠恢复而不加速消除睡眠不足', () => {
  const plain = resident();
  plain.clock.minute = 1320;
  plain.clock.sleepDebt = 8;
  plain.stamina = 0;
  const bedroom = structuredClone(plain);
  bedroom.home.facilities.push({ kind: 'bedroom', installed: true });
  const a = { type: 'sleep', minutes: 240, bed: 'yard' } as const;
  const p = act(plain, a);
  const b = act(bedroom, a);
  assert.ok(b.stamina > p.stamina);
  assert.ok(Math.abs(b.stamina / p.stamina - 1.15) < 1e-8);
  assert.equal(b.clock.sleepDebt, p.clock.sleepDebt);
});

await test('脚夫收工前必须搬完，失败不消耗资金与时间', () => {
  const s = resident();
  s.clock.minute = 1079;
  const r = dispatch(s, {
    type: 'trade',
    good: 'tea',
    quantity: 1,
    side: 'buy',
    transport: 'porter',
  });
  assert.ok(r.error);
  assert.deepEqual(r.state, s);
});

await test('熟客待客包含主餐且只推进新故事，重复邀请不能刷关系', () => {
  let s = resident();
  s.clock.minute = 1080;
  s.home.facilities = [{ kind: 'reception', installed: true }];
  s.commerce.customers.merchant = { met: true, visited: 1, lastOutcome: null };
  const cash = s.cash;
  const relation = s.commerce.relations.merchant;
  s = act(s, { type: 'host', customer: 'merchant' });
  assert.equal(s.cash, cash - 20);
  assert.equal(s.ledger.social, 20);
  assert.equal(s.life.ateCycle, 0);
  assert.equal(s.home.visits.merchant?.count, 1);
  assert.equal(s.commerce.relations.merchant, relation + 1);
  const duplicate = dispatch(s, { type: 'host', customer: 'merchant' });
  assert.ok(duplicate.error);
  assert.deepEqual(duplicate.state, s);
  s.clock.minute += 4320;
  s = act(s, { type: 'host', customer: 'merchant' });
  assert.equal(s.home.visits.merchant?.count, 2);
  s.clock.minute += 4320;
  assert.ok(dispatch(s, { type: 'host', customer: 'merchant' }).error);
});

await test('脚夫销售费用与买入成本分别记账且不重复计入利润', () => {
  let s = resident();
  s = act(s, {
    type: 'trade',
    good: 'tea',
    quantity: 4,
    side: 'buy',
    transport: 'porter',
  });
  const basis = inventoryCost(s, 'tea');
  const before = s.cash;
  const sale = s.prices.tea.sell * 4;
  s = act(s, {
    type: 'trade',
    good: 'tea',
    quantity: 4,
    side: 'sell',
    transport: 'porter',
  });
  assert.equal(s.cash - before, sale - 10);
  assert.equal(s.ledger.tradeCost, basis + 10);
  assert.equal(s.ledger.tradeRevenue, sale);
  assert.equal(s.stats.profit, sale - basis - 10);
});

await test('最大成交数量遵循所选搬运方式而非固定自搬上限', async () => {
  const { maximumTrade } = await import('../lib/game/engine.ts');
  const s = resident();
  s.stamina = 10;
  s.home.cart = true;
  const self = maximumTrade(s, 'tea', 'buy', 'self');
  const cart = maximumTrade(s, 'tea', 'buy', 'cart');
  const porter = maximumTrade(s, 'tea', 'buy', 'porter');
  assert.ok(cart > self);
  assert.ok(porter > cart);
  assert.equal(
    dispatch(s, {
      type: 'trade',
      side: 'buy',
      good: 'tea',
      quantity: porter,
      transport: 'porter',
    }).error,
    undefined,
  );
});

await test('首次设备设施购置须在闭店前完成，已拥有资产可夜间拆装', () => {
  const actions = [
    { type: 'installFacility', facility: 'bedroom' },
    { type: 'install', equipment: 'stove' },
  ] as const;
  for (const action of actions) {
    const s = resident();
    s.clock.minute = 17 * 60;
    const purchased = act(s, action);
    assert.equal(purchased.clock.minute, 18 * 60);
    const late = structuredClone(s);
    late.clock.minute++;
    const rejected = dispatch(late, action);
    assert.ok(rejected.error);
    assert.deepEqual(rejected.state, late);
    purchased.clock.minute = 22 * 60;
    const removed = act(
      purchased,
      action.type === 'install'
        ? { type: 'uninstall', equipmentId: purchased.equipment[0].id }
        : { type: 'removeFacility', facility: action.facility },
    );
    const cash = removed.cash;
    const reinstalled = act(removed, action);
    assert.equal(reinstalled.clock.minute, 24 * 60);
    assert.equal(reinstalled.cash, cash);
  }
});

await test('遭遇劳动按完整工时结算且遵守营业，拒绝仍是15分钟', () => {
  const family = EVENTS.find((f) => f.id === 'work')!;
  for (const v of family.variants) {
    const s = resident();
    s.event = {
      id: s.nextId++,
      family: family.id,
      variant: v.id,
      person: v.person,
      title: family.title,
      text: v.texts[0],
      clue: v.clue,
      hiddenFact: v.fact,
      inspection: v.inspection,
      inspected: false,
      choices: structuredClone(v.choices),
    };
    const duration = v.id === 'rain' ? 240 : 120;
    const a = { type: 'choice', eventId: s.event.id, id: 'accept' } as const;
    s.clock.minute = 1080 - duration;
    const done = act(s, a);
    assert.equal(done.clock.minute, 1080);
    assert.equal(done.event, null);
    s.clock.minute++;
    const failed = dispatch(s, a);
    assert.ok(failed.error);
    assert.deepEqual(failed.state, s);
    assert.equal(actionTiming(s, { ...a, id: 'decline' }).minutes, 15);
    assert.ok(v.choices.every((c) => !/行动点|\d行动/.test(c.hint)));
  }
});

await test('关系满级的客户仍能读新家宴故事，但关系不超过10且存档可恢复', () => {
  const s = resident();
  s.clock.minute = 1080;
  s.home.facilities = [{ kind: 'reception', installed: true }];
  s.commerce.customers.merchant = { met: true, visited: 3, lastOutcome: null };
  s.commerce.relations.merchant = 10;
  const next = act(s, { type: 'host', customer: 'merchant' });
  assert.equal(next.commerce.relations.merchant, 10);
  assert.equal(next.home.visits.merchant?.count, 1);
  assert.deepEqual(readSave(JSON.stringify(next)), next);
});

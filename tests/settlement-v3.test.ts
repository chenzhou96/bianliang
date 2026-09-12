import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch, readSave } from '../lib/game/engine.ts';
import type { Action, GameState } from '../lib/game/types.ts';
function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined, r.error);
  return r.state;
}

await test('新存档拒绝设施重复、伪造货源、缺失保鲜时间与日期不一致', () => {
  const base = newGame(40);
  const changes: ((s: GameState) => void)[] = [
    (s) => {
      s.day++;
    },
    (s) => {
      s.home.facilities = [
        { kind: 'bedroom', installed: true },
        { kind: 'bedroom', installed: true },
      ];
    },
    (s) => {
      delete (s.batches[0] as { remainingMinutes?: number | null })
        .remainingMinutes;
    },
    (s) => {
      s.batches[0].remainingMinutes = Infinity;
    },
    (s) => {
      s.marketOffers.requests[0].remaining = 999;
    },
    (s) => {
      s.marketOffers.lots[0].price = -1;
    },
    (s) => {
      s.life.fed = [99999];
    },
    (s) => {
      s.home.visits.merchant = { count: 3, at: s.clock.minute };
    },
  ];
  for (const change of changes) {
    const s = structuredClone(base);
    change(s);
    assert.throws(() => readSave(JSON.stringify(s)));
  }
  assert.deepEqual(readSave(JSON.stringify(base)), base);
});

await test('街头睡眠按实际时长损害健康，拆成短睡不会抹除健康成本', () => {
  const s = newGame(40);
  s.clock.minute = 1320;
  s.life.ateCycle = 0;
  const full = act(s, { type: 'sleep', minutes: 480, bed: 'street' });
  let split = s;
  for (let i = 0; i < 8; i++)
    split = act(split, { type: 'sleep', minutes: 60, bed: 'street' });
  assert.ok(Math.abs(full.health - 97) < 1e-8);
  assert.ok(Math.abs(full.health - split.health) < 1e-8);
  assert.equal(full.cash, split.cash);
});

await test('已喂母鸡出售后不会留下悬空喂养记录，存档可读取', () => {
  let s = newGame(40);
  s.hens.push({ id: s.nextId++, cost: 100, hunger: 0 });
  s = act(s, { type: 'feed', count: 1 });
  s = act(s, { type: 'trade', good: 'hen', side: 'sell', quantity: 1 });
  assert.deepEqual(s.life.fed, []);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

await test('06点欠租先暂停设备，同刻应完工的生产不会越过停用规则', () => {
  let s = newGame(40);
  s.cash = 10000;
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.skills.food = 1;
  s = act(s, { type: 'trade', good: 'egg', quantity: 2, side: 'buy' });
  s = act(s, { type: 'install', equipment: 'pickleVat' });
  s = act(s, { type: 'produce', recipeId: 'saltedEgg', quantity: 1 });
  s.clock.minute = 1799;
  s.day = 2;
  s.life.ateCycle = 0;
  s.cash = 0;
  s.jobs[0].remainingMinutes = 1;
  s = act(s, { type: 'wait', minutes: 1 });
  assert.equal(s.housing.id, 'street');
  assert.equal(s.jobs[0].status, 'queued');
  assert.equal(s.jobs[0].remainingMinutes, 1);
});

await test('搬运途中死亡释放货款和交货库存，不提前获得成交收入或购入货物', () => {
  const s = newGame(40);
  s.health = 0.01;
  s.clock.fatigueMinutes = 1500;
  const bought = act(s, {
    type: 'trade',
    good: 'tea',
    quantity: 1,
    side: 'buy',
  });
  assert.equal(bought.phase, 'ended');
  assert.equal(bought.cash, s.cash);
  assert.equal(
    bought.batches.some((b) => b.good === 'tea'),
    false,
  );
  assert.equal(bought.pendingTrade, undefined);
  assert.deepEqual(readSave(JSON.stringify(bought)), bought);
  const sold = act(s, {
    type: 'trade',
    good: 'wheat',
    quantity: 1,
    side: 'sell',
  });
  assert.equal(sold.cash, s.cash);
  assert.equal(
    sold.batches
      .filter((b) => b.good === 'wheat')
      .reduce((n, b) => n + b.units, 0),
    20,
  );
  assert.equal(sold.ledger.tradeRevenue, 0);
  assert.equal(sold.pendingTrade, undefined);
});

await test('凉储不能保护已经搬出的交货，途中到期的行动整体拒绝', () => {
  const s = newGame(40);
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.home.facilities = [{ kind: 'coldStorage', installed: true }];
  s.batches = s.batches.filter((b) => b.good !== 'bread');
  s.batches.push({
    id: s.nextId++,
    good: 'bread',
    units: 10,
    cost: 20,

    remainingMinutes: 10,
    origin: 'buy',
  });
  const before = structuredClone(s);
  const r = dispatch(s, {
    type: 'trade',
    good: 'bread',
    quantity: 1,
    side: 'sell',
  });
  assert.ok(r.error);
  assert.deepEqual(r.state, before);
});

await test('存档不能携带未完成的同步交易预留', () => {
  const s = newGame(40);
  s.pendingTrade = { cash: 20, batches: [], hens: [], units: 10 };
  assert.throws(() => readSave(JSON.stringify(s)));
});

await test('06点未用餐致死先于同刻房费、腐坏和产蛋，不产生身后收支', () => {
  const s = newGame(17);
  s.clock.minute = 1799;
  s.day = 2;
  s.health = 7;
  s.cash = 100;
  s.life.ateCycle = -1;
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.batches = [
    {
      id: s.nextId++,
      good: 'bread',
      units: 10,
      cost: 3,
      origin: 'buy',
      remainingMinutes: 1,
    },
  ];
  s.hens = [{ id: s.nextId++, hunger: 0, cost: 10 }];
  s.life.fed = s.hens.map((h) => h.id);
  const result = dispatch(s, { type: 'wait', minutes: 1 });
  assert.equal(result.error, undefined);
  assert.equal(result.state.clock.minute, 1800);
  assert.equal(result.state.phase, 'ended');
  assert.equal(result.state.health, 0);
  assert.equal(result.state.cash, s.cash);
  assert.equal(result.state.ledger.housing, s.ledger.housing);
  assert.equal(result.state.ledger.losses, s.ledger.losses);
  assert.equal(result.state.stats.eggs, s.stats.eggs);
  assert.deepEqual(result.state.batches, s.batches);
  assert.deepEqual(readSave(JSON.stringify(result.state)), result.state);
});

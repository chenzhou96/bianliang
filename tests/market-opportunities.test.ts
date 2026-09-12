import { closeDay } from './helpers.ts';
import { GOODS } from '../lib/game/config.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  readSave,
  actionPreview,
} from '../lib/game/engine.ts';
import {
  generateOpportunities,
  publicOpportunities,
  knownDemandForecasts,
  lotWeight,
} from '../lib/game/market-opportunities.ts';
import type { Action, GameState, Good } from '../lib/game/types.ts';

function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined, r.error);
  return r.state;
}

await test('每日货源确定、限量且读档和浏览不刷新，未开夜市不公开货盘', () => {
  const s = newGame(5);
  const before = structuredClone(s);
  assert.equal(s.marketOffers.requests.length, 2);
  assert.ok(publicOpportunities(s).lots.every((l) => l.opensAt === 480));
  generateOpportunities(s);
  assert.deepEqual(s, before);
  assert.deepEqual(readSave(JSON.stringify(s)), before);
  assert.deepEqual(newGame(5).marketOffers, s.marketOffers);
});

await test('货盘生成遵守折扣、夜市总价和公开即刻转售边界', () => {
  for (let seed = 0; seed < 60; seed++) {
    const s = newGame(seed);
    for (const lot of s.marketOffers.lots) {
      const retail = Object.entries(lot.goods).reduce(
        (n, [g, q]) => n + s.prices[g as Good].buy * q!,
        0,
      );
      const resale = Object.entries(lot.goods).reduce(
        (n, [g, q]) => n + s.prices[g as Good].sell * q!,
        0,
      );
      assert.ok(lot.price >= retail * 0.85 && lot.price <= retail * 0.95);
      assert.ok(lot.price > resale);
      if (lot.opensAt === 1080) assert.ok(lot.price <= 240);
      assert.ok(
        Object.keys(lot.goods).every(
          (g) => !s.marketOffers.requests.some((r) => r.good === g),
        ),
      );
    }
  }
});

await test('整批采购只成交一次，价款和采购运费全部进入库存', () => {
  let s = newGame(5);
  s.cash = 10000;
  const lot = s.marketOffers.lots.find((l) => l.opensAt === 480)!;
  assert.ok(lot);
  const costBefore = s.batches.reduce((n, b) => n + b.cost, 0);
  s = act(s, { type: 'buyLot', lotId: lot.id, transport: 'porter' });
  const freight = Math.max(10, Math.ceil(lotWeight(lot)));
  assert.equal(s.cash, 10000 - lot.price - freight);
  assert.equal(
    s.batches.reduce((n, b) => n + b.cost, 0) - costBefore,
    lot.price + freight,
  );
  assert.ok(s.marketOffers.milestones.cargo);
  assert.ok(dispatch(s, { type: 'buyLot', lotId: lot.id }).error);
});

await test('收购可分批交货，超额失败无副作用', () => {
  let s = newGame(2);
  const req = s.marketOffers.requests[0];
  s.batches.push({
    id: s.nextId++,
    good: req.good,
    units: req.quantity * 10,
    cost: 10,
    origin: 'buy',

    remainingMinutes: null,
  });
  s = act(s, { type: 'supplyRequest', requestId: req.id, quantity: 1 });
  assert.equal(s.marketOffers.requests[0].remaining, req.quantity - 1);
  const bad = dispatch(s, {
    type: 'supplyRequest',
    requestId: req.id,
    quantity: req.quantity,
  });
  assert.ok(bad.error);
  assert.deepEqual(bad.state, s);
  s = act(s, {
    type: 'supplyRequest',
    requestId: req.id,
    quantity: req.quantity - 1,
  });
  assert.equal(s.marketOffers.requests[0].remaining, 0);
});

await test('熟客预告只公开已结识且关系足够的需求，预留跨黎明保留', () => {
  let s = newGame(4);
  assert.deepEqual(knownDemandForecasts(s), []);
  for (const id of Object.keys(
    s.commerce.relations,
  ) as (keyof typeof s.commerce.relations)[]) {
    s.commerce.relations[id] = 6;
    s.commerce.customers[id] = { met: true, visited: 1, lastOutcome: null };
  }
  assert.equal(knownDemandForecasts(s).length, 2);
  const req = s.marketOffers.requests[0];
  s = act(s, { type: 'reserveRequest', requestId: req.id });
  assert.equal(s.marketOffers.requests[0].reservedUntil, 2160);
  assert.ok(
    dispatch(s, {
      type: 'reserveRequest',
      requestId: s.marketOffers.requests[1].id,
    }).error,
  );
  s = act(s, { type: 'wait', minutes: 1800 - s.clock.minute });
  assert.ok(s.marketOffers.requests.some((r) => r.id === req.id));
  assert.equal(s.marketOffers.requests.length, 3);
});

await test('非法数量的预览返回错误，不使市场界面崩溃', () => {
  const s = newGame(2);
  const a = {
    type: 'supplyRequest',
    requestId: s.marketOffers.requests[0].id,
    quantity: -1,
  } as const;
  const before = structuredClone(s);
  assert.ok(actionPreview(s, a).error);
  assert.deepEqual(s, before);
});

await test('收购按货值设置规模，报价区间有盈利与不划算的选择且总量有限', () => {
  let profitable = 0,
    unattractive = 0,
    bulk = 0;
  for (let seed = 0; seed < 120; seed++) {
    const s = newGame(seed);
    assert.equal(s.marketOffers.requests.length, 2);
    for (const r of s.marketOffers.requests) {
      const buy = s.prices[r.good].buy;
      assert.ok(r.price >= Math.floor(buy * 0.95));
      assert.ok(
        r.price <= Math.floor(buy * (GOODS[r.good].base >= 100 ? 1.25 : 1.35)),
      );
      assert.ok(r.quantity >= 4 && r.quantity <= 80);
      assert.equal(r.remaining, r.quantity);
      if (r.price > buy) profitable++;
      else unattractive++;
      if (r.good === 'grain' || r.good === 'wheat') {
        assert.ok(r.quantity >= 40);
        bulk++;
      }
    }
  }
  assert.ok(profitable && unattractive && bulk);
});

await test('商人纪念物在首次达成时授予，读档后不重复提示，公开回看保留故事', () => {
  let s = newGame(5);
  s.cash = 10000;
  assert.deepEqual(publicOpportunities(s).milestones, []);
  const lot = s.marketOffers.lots.find((l) => l.opensAt === 480)!;
  const bought = dispatch(s, {
    type: 'buyLot',
    lotId: lot.id,
    transport: 'porter',
  });
  assert.equal(bought.error, undefined);
  assert.deepEqual(bought.result?.tradeMilestones, ['cargo']);
  s = readSave(JSON.stringify(bought.state))!;
  const reward = publicOpportunities(s).milestones.find(
    (m) => m.id === 'cargo',
  )!;
  assert.equal(reward.reward.name, '首批货签');
  assert.match(reward.reward.story, /整批货/);
  const waited = dispatch(s, { type: 'wait', minutes: 30 });
  assert.deepEqual(waited.result?.tradeMilestones, []);
  assert.deepEqual(publicOpportunities(waited.state).milestones, [reward]);
  const corrupt = structuredClone(s);
  corrupt.operationHistory.at(-1)!.tradeMilestones = ['not-a-reward'];
  assert.throws(() => readSave(JSON.stringify(corrupt)), /存档损坏/);
});

await test('商人连续盈利按清晨结算，平账中断，满五日才授予且不重复', () => {
  let s = newGame(31);
  s.cash = 10000;
  s.housing = { id: 'yard', paidThrough: null, maintenanceSuspended: false };
  for (const earned of [true, true, false, true, true, true, true, true]) {
    const prior = s.marketOffers.profitStreak;
    if (earned) s.ledger.tradeRevenue += 1;
    s = closeDay(s, 'yard');
    assert.equal(s.marketOffers.profitStreak, earned ? prior + 1 : 0);
    if (s.marketOffers.profitStreak < 5)
      assert.equal(s.marketOffers.milestones.streak, undefined);
  }
  const at = s.marketOffers.milestones.streak;
  assert.ok(at);
  assert.equal(
    publicOpportunities(s).milestones.find((m) => m.id === 'streak')?.reward
      .name,
    '五日红账笺',
  );
  s.ledger.tradeRevenue++;
  s = closeDay(s, 'yard');
  assert.equal(s.marketOffers.milestones.streak, at);
});

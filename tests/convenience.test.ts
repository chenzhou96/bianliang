import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  recipeQuote,
  maximumTrade,
  maximumProduction,
  quantity,
  availableSurplus,
  readSave,
} from '../lib/game/engine.ts';

void test('multi-material refill is atomic and uses the same quote, FIFO costs and carrying', () => {
  const initial = newGame(61);
  initial.phase = 'day';
  initial.batches = [];
  const quote = recipeQuote(initial, 'saltedEgg', 3);
  const result = dispatch(initial, {
    type: 'refill',
    recipeId: 'saltedEgg',
    quantity: 3,
  });
  assert.equal(result.error, undefined);
  assert.equal(initial.cash - result.state.cash, quote.refillCost);
  assert.equal(initial.stamina - result.state.stamina, quote.carrying);
  assert.equal(quantity(result.state, 'egg'), 6);
  assert.equal(quantity(result.state, 'salt'), 3);
  assert.equal(result.state.revision, initial.revision + 1);
  assert.equal(result.state.operationHistory.length, 1);
  for (const broken of [
    { cash: 100 },
    { stamina: 2 },
    { clock: { ...initial.clock, minute: 1080 } },
  ]) {
    const s = { ...initial, ...broken };
    const fail = dispatch(s, {
      type: 'refill',
      recipeId: 'saltedEgg',
      quantity: 3,
    });
    assert(fail.error);
    assert.equal(fail.state, s);
    assert.equal(fail.state.rng, initial.rng);
  }
  const full = structuredClone(initial);
  full.batches = [
    {
      id: 999,
      good: 'herb',
      remainingMinutes: null,
      units: 5980,
      cost: 0,

      origin: 'gift',
    },
  ];
  assert.equal(
    dispatch(full, { type: 'refill', recipeId: 'saltedEgg', quantity: 3 })
      .state,
    full,
  );
});

void test('maximum quantities respect capacity, stamina, fractional grain and daily carrying', () => {
  const s = newGame(62);
  s.phase = 'day';
  s.stamina = 1;
  s.daily.tradeUnits = 0.2;
  assert.equal(maximumTrade(s, 'grain', 'buy'), 1);
  assert.equal(maximumTrade({ ...s, cash: 0 }, 'grain', 'buy'), 0);
  assert.equal(maximumTrade({ ...s, stamina: 0 }, 'wheat', 'sell'), 0);
  const max = maximumTrade(s, 'grain', 'buy');
  assert.equal(
    dispatch(s, { type: 'trade', good: 'grain', quantity: max, side: 'buy' })
      .error,
    undefined,
  );
  assert(
    dispatch(s, {
      type: 'trade',
      good: 'grain',
      quantity: max + 0.1,
      side: 'buy',
    }).error,
  );
  s.phase = 'day';
  s.stamina = 100;
  s.skills.food = 1;
  s.housing.id = 'room';
  s.equipment = [{ id: 999, kind: 'mill', installed: true, jobId: null }];
  assert.equal(maximumProduction(s, 'flour'), 1);
});

void test('surplus stops reserving consumed meals and already-fed hens, with immutable failure', () => {
  let s = newGame(63);
  s.hens = [{ id: s.nextId++, hunger: 0, cost: 100 }];
  assert.equal(availableSurplus(s, 'grain'), 1.8);
  const bad = dispatch(s, { type: 'feed', count: 2 });
  assert.equal(bad.state, s);
  s = dispatch(s, { type: 'feed', count: 1 }).state;
  assert.equal(availableSurplus(s, 'grain'), 1.8);
  assert.equal(availableSurplus(s, 'bread'), 1);
  s = dispatch(s, { type: 'eat', meal: 'bread' }).state;
  assert.equal(availableSurplus(s, 'bread'), 1);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

void test('recipe margin distinguishes owned cost, missing inputs and replacement cost', () => {
  const s = newGame(64);
  s.batches = [
    {
      id: 999,
      good: 'flour',
      remainingMinutes: null,
      units: 10,
      cost: 10,
      origin: 'buy',
    },
  ];
  const quote = recipeQuote(s, 'bread', 1);
  assert.equal(quote.stockProfit, null);
  assert.equal(quote.refillProfit, quote.revenue - 10 - 44);
  assert.equal(quote.replacementProfit, quote.revenue - 88);
  assert.throws(() => recipeQuote(s, 'bread', 0));
});

void test('daytime trade and refill work directly; legacy phases are rejected on load', () => {
  const s = newGame(77);
  const buy = dispatch(s, {
    type: 'trade',
    side: 'buy',
    good: 'grain',
    quantity: 1,
  });
  assert.equal(buy.error, undefined);
  assert.equal(buy.state.phase, 'day');
  assert.equal(quantity(buy.state, 'grain'), quantity(s, 'grain') + 1);
  assert(buy.state.stamina < s.stamina);
  const refill = dispatch(s, {
    type: 'refill',
    recipeId: 'bread',
    quantity: 1,
  });
  assert.equal(refill.error, undefined);
  assert.equal(refill.state.phase, 'day');
  const legacy = { ...s, phase: 'market' };
  assert.throws(() => readSave(JSON.stringify(legacy)));
  for (const type of ['market', 'leave'] as const) {
    const nav = dispatch(s, { type });
    assert.equal(nav.error, undefined);
    assert.equal(nav.state.phase, 'day');
    assert.equal(nav.state.rng, s.rng);
    assert.equal(nav.state.stamina, s.stamina);
    assert.equal(nav.state.event, null);
  }
});

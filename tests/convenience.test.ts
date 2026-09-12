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
  initial.phase = 'market';
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
    { phase: 'night' as const },
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
      units: 5980,
      cost: 0,
      expires: null,
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
  s.phase = 'market';
  s.stamina = 1;
  s.daily.tradeUnits = 0.2;
  assert.equal(maximumTrade(s, 'grain', 'buy'), 1.8);
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

void test('surplus reserves shared meal and all-hen feed and preferences only settle on success', () => {
  const s = newGame(63);
  s.nightPreference = { meal: 'grain', bed: 'inn', feedMode: 'all', feed: 1 };
  s.hens = [{ id: 901, hunger: 0, cost: 100 }];
  assert.equal(availableSurplus(s, 'grain'), 0.8);
  const night = dispatch(s, { type: 'endDay' }).state;
  const back = dispatch(night, { type: 'returnDay' }).state;
  assert.equal(back.day, s.day);
  assert.equal(back.cash, s.cash);
  assert.equal(back.rng, s.rng);
  const bad = dispatch(night, {
    type: 'night',
    meal: 'bread',
    bed: 'inn',
    feed: 0,
    feedAll: true,
  });
  assert.equal(bad.state, night);
  const good = dispatch(night, {
    type: 'night',
    meal: 'bread',
    bed: 'inn',
    feed: 1,
    feedAll: true,
  });
  assert.equal(good.error, undefined);
  assert.equal(good.state.nightPreference?.meal, 'bread');
  assert.equal(good.state.nightPreference?.feedMode, 'all');
  assert.deepEqual(
    readSave(JSON.stringify(good.state)).nightPreference,
    good.state.nightPreference,
  );
});

void test('recipe margin distinguishes owned cost, missing inputs and replacement cost', () => {
  const s = newGame(64);
  s.batches = [
    {
      id: 999,
      good: 'flour',
      units: 10,
      cost: 10,
      origin: 'buy',
      expires: null,
    },
  ];
  const quote = recipeQuote(s, 'bread', 1);
  assert.equal(quote.stockProfit, null);
  assert.equal(quote.refillProfit, quote.revenue - 10 - 44);
  assert.equal(quote.replacementProfit, quote.revenue - 88);
  assert.throws(() => recipeQuote(s, 'bread', 0));
});

void test('daytime trade and refill work directly and old market saves resume in day', () => {
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
  const resumed = readSave(JSON.stringify(legacy))!;
  assert.equal(resumed.phase, 'day');
  assert.deepEqual(resumed.batches, s.batches);
  assert.equal(resumed.cash, s.cash);
  for (const type of ['market', 'leave'] as const) {
    const nav = dispatch(s, { type });
    assert.equal(nav.error, undefined);
    assert.equal(nav.state.phase, 'day');
    assert.equal(nav.state.rng, s.rng);
    assert.equal(nav.state.stamina, s.stamina);
    assert.equal(nav.state.event, null);
  }
});

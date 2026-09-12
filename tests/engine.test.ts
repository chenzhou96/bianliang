import { closeDay, setDay } from './helpers.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatch,
  actionPreview,
  newGame,
  occupied,
  quantity,
  readSave,
  staminaMax,
} from '../lib/game/engine.ts';
import { GOOD_IDS, GOODS, RECIPES, SKILL_IDS } from '../lib/game/config.ts';
import {
  EVENTS,
  INFO_TEMPLATES,
  INFO_TEMPLATES as CONTENT_INFO,
} from '../lib/game/content.ts';
import type { Action, GameState, Good } from '../lib/game/types.ts';

function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined, r.error);
  return r.state;
}
function night(s: GameState) {
  return closeDay(s);
}

void test('v3 content and rules expose the planned long-game surface', () => {
  assert.equal(GOOD_IDS.length, 17);
  assert.equal(CONTENT_INFO.length, 120);
  assert.equal(INFO_TEMPLATES.length, 120);
  assert.equal(RECIPES.length, 7);
  assert.deepEqual(SKILL_IDS, ['husbandry', 'food', 'textile', 'brewing']);
  const low = newGame(1, 3000),
    high = newGame(1, 30000);
  assert.equal(low.target, 3000);
  assert.equal(high.target, 30000);
  assert.equal('ap' in low, false);
  assert.equal(low.day, 1);
});

void test('market is free to enter and carrying goods consumes cumulative stamina atomically', () => {
  let s = act(newGame(2), { type: 'market' });
  const before = structuredClone(s);
  const bad = dispatch(s, {
    type: 'trade',
    side: 'buy',
    good: 'wheat',
    quantity: 100,
  });
  assert(bad.error);
  assert.deepEqual(bad.state, s);
  s = act(s, { type: 'trade', side: 'buy', good: 'wheat', quantity: 1 });
  assert.equal(s.stamina, before.stamina - 1);
  assert.equal(quantity(s, 'wheat'), 3);
  s = act(s, { type: 'trade', side: 'sell', good: 'wheat', quantity: 1 });
  assert.equal(s.stamina, before.stamina - 2);
  s = act(s, { type: 'leave' });
  assert.equal(s.phase, 'day');
});

void test('food production chain works from learning through installation and sale', () => {
  let s = newGame(3);
  s = act(s, { type: 'rentHousing', housing: 'room' });
  s = act(s, { type: 'install', equipment: 'mill' });
  s = act(s, { type: 'install', equipment: 'stove' });
  s = act(s, { type: 'learn', skill: 'food' });
  s = act(s, { type: 'produce', recipeId: 'flour', quantity: 1 });
  assert.equal(quantity(s, 'flour'), 2);
  assert.equal(s.stats.productionRuns, 1);
  s = act(s, { type: 'produce', recipeId: 'bread', quantity: 1 });
  assert.equal(quantity(s, 'bread'), 7);
  assert(s.stamina >= 0);
  s = act(s, { type: 'market' });
  s = act(s, { type: 'trade', side: 'sell', good: 'bread', quantity: 3 });
  assert(s.ledger.tradeRevenue > 0);
  assert(s.ledger.productionRevenue > 0);
});

void test('timed production reserves output space and completes after actual processing minutes', () => {
  let s = newGame(4);
  s = act(s, { type: 'rentHousing', housing: 'room' });
  s = act(s, { type: 'install', equipment: 'pickleVat' });
  s = act(s, { type: 'learn', skill: 'food' });
  s.batches.push({
    id: s.nextId++,
    good: 'egg',
    units: 20,
    cost: 12,
    remainingMinutes: 7200,

    origin: 'buy',
  });
  s = act(s, { type: 'produce', recipeId: 'saltedEgg', quantity: 1 });
  assert.equal(quantity(s, 'saltedEgg'), 0);
  assert.equal(s.jobs[0].remainingMinutes, 2 * 1440);
  assert.equal(reserved(s), occupied(s) + 30);
  s = night(s);
  assert.equal(s.day, 2);
  assert.equal(quantity(s, 'saltedEgg'), 0);
  s = night(s);
  assert.equal(s.day, 3);
  s = act(s, { type: 'wait', minutes: s.jobs[0].remainingMinutes! });
  assert.equal(quantity(s, 'saltedEgg'), 3);
  assert.equal(s.equipment.find((e) => e.kind === 'pickleVat')?.jobId, null);
});

void test('time limits work and rest while lessons and treatment keep cycle limits', () => {
  let s = newGame(5);
  s = act(s, { type: 'short' });
  s = act(s, { type: 'short' });
  assert.equal(s.daily.work, 2);
  s = act(s, { type: 'short' });
  assert.equal(s.daily.work, 3);
  s.stamina = 100;
  s = act(s, { type: 'learn', skill: 'food' });
  assert(dispatch(s, { type: 'learn', skill: 'textile' }).error);
  s.health = 35;
  s.stamina = 80;
  assert(staminaMax(s) < 60 && staminaMax(s) >= 30);
  assert(dispatch(s, { type: 'heavy' }).error);
  setDay(s, 2);
  s = act(s, { type: 'treat', mode: 'slow' });
  assert.equal(s.daily.treatment, 1);
  assert(dispatch(s, { type: 'treat', mode: 'slow' }).error);
  s = act(s, { type: 'rest' });
  s = act(s, { type: 'rest' });
  assert(s.clock.sleepDebt > 0);
});

void test('housing downgrade never destroys assets and ownership sale is fixed-price', () => {
  let s = newGame(6);
  s.cash = 10000;
  s = act(s, { type: 'buyHousing', housing: 'yard' });
  s = act(s, { type: 'install', equipment: 'mill' });
  assert(
    dispatch(s, { type: 'rentHousing', housing: 'room' }).error,
    'owned property must be sold explicitly',
  );
  s = act(s, { type: 'uninstall', equipmentId: s.equipment[0].id });
  const before = s.cash;
  s = act(s, { type: 'sellHousing' });
  assert.equal(s.cash - before, 4320);
  s = act(s, { type: 'rentHousing', housing: 'courtyard' });
  s = act(s, { type: 'install', equipment: 'mill' });
  s = act(s, { type: 'rentHousing', housing: 'room' });
  assert.equal(s.equipment[0].installed, true);
  s = act(s, { type: 'endLease' });
  assert.equal(s.equipment[0].installed, false);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

void test('meal and feed share inventory, free sleep remains available and saves resume', () => {
  let s = newGame(7);
  s.cash = 0;
  s.batches = s.batches.filter((b) => b.good === 'grain');
  s.batches[0].units = 10;
  s.hens = [{ id: s.nextId++, hunger: 0, cost: 100 }];
  s = act(s, { type: 'eat', meal: 'grain' });
  assert(dispatch(s, { type: 'feed', count: 1 }).error);
  s = act(s, { type: 'wait', minutes: 1320 - s.clock.minute });
  s = act(s, { type: 'sleep', minutes: 480, bed: 'street' });
  assert.equal(s.day, 2);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  assert.throws(() => readSave(JSON.stringify({ ...s, version: 99 })));
});

void test('event save does not reveal hidden facts through public state and every old event still has a decline', () => {
  assert(
    EVENTS.every((f) =>
      f.variants.every((v) => v.choices.some((c) => c.id === 'decline')),
    ),
  );
  const s = newGame(8);
  setDay(s, 2, 540);
  s.phase = 'day';
  s.encounterDay = 0;
  const r = dispatch(s, { type: 'tea' });
  assert.equal(r.error, undefined);
  const activeState = r.state;
  const resumed = readSave(JSON.stringify(activeState));
  assert.deepEqual(resumed, activeState);
  assert.equal(typeof activeState.rng, 'number');
});

function reserved(s: GameState) {
  return (
    occupied(s) +
    s.jobs
      .filter((j) => j.status === 'queued')
      .reduce((a, j) => a + j.outputUnits, 0)
  );
}

void test('reselling purchased goods counts cost once and keeps production separate', () => {
  let s = act(newGame(42), { type: 'market' });
  s = act(s, { type: 'trade', side: 'buy', good: 'herb', quantity: 1 });
  s = act(s, { type: 'trade', side: 'sell', good: 'herb', quantity: 1 });
  assert.equal(s.cash, 784);
  assert.equal(s.ledger.purchases, 113);
  assert.equal(s.ledger.tradeCost, 113);
  assert.equal(s.ledger.tradeRevenue - s.ledger.tradeCost, -16);
  s.batches.push({
    id: s.nextId++,
    good: 'herb',
    units: 10,
    cost: 25,
    origin: 'production',
    remainingMinutes: null,
  });
  s = act(s, { type: 'trade', side: 'sell', good: 'herb', quantity: 1 });
  assert.equal(s.ledger.tradeRevenue, 97);
  assert.equal(s.ledger.productionRevenue, 97);
  assert.equal(s.ledger.productionCost, 25);
});
void test('fractional trades charge accumulated carrying, not per-order rounding', () => {
  const initial = act(newGame(9), { type: 'market' });
  let split = initial;
  for (let i = 0; i < 10; i++)
    split = act(split, {
      type: 'trade',
      side: 'buy',
      good: 'grain',
      quantity: 0.1,
    });
  const bulk = act(initial, {
    type: 'trade',
    side: 'buy',
    good: 'grain',
    quantity: 1,
  });
  assert.ok(Math.abs(split.stamina - bulk.stamina) < 1e-8);
  assert(split.clock.minute > bulk.clock.minute);
  const repeat = dispatch(
    split,
    { type: 'trade', side: 'buy', good: 'grain', quantity: 1 },
    initial.revision,
  );
  assert(repeat.error);
  assert.deepEqual(repeat.state, split);
});
void test('queued work pauses on eviction, cancellation gives no XP, and recovery resumes', () => {
  let s = newGame(10);
  s.cash = 10000;
  s = act(s, { type: 'rentHousing', housing: 'room' });
  s = act(s, { type: 'install', equipment: 'brewVat' });
  s = act(s, { type: 'learn', skill: 'brewing' });
  s.batches.push({
    id: s.nextId++,
    good: 'firewood',
    units: 10,
    cost: 12,
    origin: 'buy',
    remainingMinutes: null,
  });
  s = act(s, { type: 'produce', recipeId: 'wine', quantity: 1 });
  assert.equal(s.skillXp.brewing, 0);
  const job = s.jobs[0];
  s = act(s, { type: 'endLease' });
  const remaining = s.jobs[0].remainingMinutes;
  s = closeDay(s, 'inn');
  assert.equal(s.jobs[0].remainingMinutes, remaining);
  assert.equal(s.jobs[0].status, 'queued');
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  s = act(s, { type: 'rentHousing', housing: 'room' });
  s = act(s, { type: 'install', equipment: 'brewVat' });
  s = act(s, { type: 'cancelProduction', jobId: job.id });
  assert.equal(s.skillXp.brewing, 0);
  assert.equal(s.equipment[0].jobId, null);
  const before = s.cash;
  s = act(s, { type: 'sellEquipment', equipmentId: s.equipment[0].id });
  assert.equal(s.cash - before, 216);
  assert(dispatch(s, { type: 'sellEquipment', equipmentId: 500 }).error);
});
void test('maintenance and rent are paid with outside lodging and unpaid homes suspend safely', () => {
  let s = newGame(12);
  s.cash = 10000;
  s = act(s, { type: 'buyHousing', housing: 'yard' });
  s.cash = 18;
  s = closeDay(s, 'yard');
  assert.equal(s.cash, 0);
  assert(s.housing.maintenanceSuspended);
  s.cash = 16;
  s = act(s, { type: 'maintain' });
  assert.equal(s.housing.maintenanceSuspended, false);
  assert(dispatch(s, { type: 'maintain' }).error);
  s = act(newGame(13), { type: 'rentHousing', housing: 'room' });
  const before = s.cash;
  s = closeDay(s, 'inn');
  assert.equal(before - s.cash, 60);
  s.cash = 18;
  s = closeDay(s, 'room');
  assert.equal(s.cash, 0);
  assert.equal(s.housing.id, 'street');
});
void test('new multi-day saves round-trip and missing ledger fields are rejected', () => {
  const s = newGame(20);
  setDay(s, 50);
  s.buffs = {};
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  const broken = JSON.parse(JSON.stringify(s));
  delete broken.ledger.purchases;
  assert.throws(() => readSave(JSON.stringify(broken)));
});
void test('100 days of tea obey semantic and story cooldowns with actionable text', () => {
  assert.equal(new Set(INFO_TEMPLATES.map((t) => t.semantic)).size, 120);
  let s = newGame(88, 30000);
  s.cash = 100000;
  s.housing = { id: 'mansion', paidThrough: null, maintenanceSuspended: false };
  const seen = new Map<string, number>();
  const skeletonSeen = new Map<string, number>();
  let total = 0;
  const categories = new Set<string>();
  for (let day = 1; day <= 100; day++) {
    s = act(s, { type: 'wait', minutes: 60 });
    s = act(s, { type: 'tea' });
    const fresh = s.intel.filter((i) => i.heardDay === day);
    assert.equal(fresh.length, 3);
    for (const i of fresh) {
      const t = INFO_TEMPLATES.find((t) => t.id === i.templateId)!;
      assert(!i.text.includes(t.semantic));
      assert(day - (seen.get(t.semantic) ?? -99) >= 20);
      assert(day - (skeletonSeen.get(t.skeleton) ?? -99) >= 7);
      seen.set(t.semantic, day);
      skeletonSeen.set(t.skeleton, day);
      categories.add(i.category);
      total++;
    }
    if (s.event)
      s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
    s = closeDay(s, 'mansion');
  }
  assert.equal(total, 300);
  assert(categories.size >= 8);
  assert(s.worlds.some((w) => w.expected > 120));
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

void test('every recipe completes purchase-learn-install-produce-sell with reload and positive ordinary margin', () => {
  for (const recipe of RECIPES) {
    let s = newGame(77, 30000);
    s.cash = 100000;
    s = act(s, { type: 'rentHousing', housing: 'room' });
    s = act(s, { type: 'learn', skill: recipe.industry });
    if (recipe.minSkill > 1) {
      s.skillXp[recipe.industry] = 10;
      s.daily.lessons = 0;
      s.stamina = 100;
      s = act(s, { type: 'learn', skill: recipe.industry });
    }
    s = act(s, { type: 'install', equipment: recipe.equipment });
    s.batches = [];
    s.stamina = 100;
    s = act(s, { type: 'market' });
    for (const [good, units] of Object.entries(recipe.inputs))
      s = act(s, {
        type: 'trade',
        good: good as Good,
        quantity: units! / 10,
        side: 'buy',
      });
    s = act(s, { type: 'leave' });
    s = act(s, { type: 'produce', recipeId: recipe.id, quantity: 1 });
    s = readSave(JSON.stringify(s));
    for (let n = 0; n < recipe.duration; n++) {
      s = closeDay(s, 'room');
      s = readSave(JSON.stringify(s));
    }
    if (s.jobs[0].status === 'queued' && s.jobs[0].remainingMinutes! > 0)
      s = act(s, { type: 'wait', minutes: s.jobs[0].remainingMinutes! });
    const output = quantity(s, recipe.output);
    assert(output > 0, recipe.id);
    assert.equal(s.jobs.filter((j) => j.status === 'queued').length, 0);
    // Use ordinary reference prices to compare production margin without a random price event.
    s.prices[recipe.output] = {
      buy: GOODS[recipe.output].base,
      sell: GOODS[recipe.output].firstSell,
    };
    s = act(s, { type: 'market' });
    s = act(s, {
      type: 'trade',
      good: recipe.output,
      quantity: output,
      side: 'sell',
    });
    assert(s.ledger.productionRevenue > s.ledger.productionCost, recipe.id);
    assert.equal(s.ledger.tradeRevenue, 0);
    assert.equal(s.ledger.tradeCost, 0);
    assert.deepEqual(readSave(JSON.stringify(s)), s);
  }
});
void test('fatigue warning uses the same action cost and invalid inputs are atomic', () => {
  let s = newGame(17);
  s.stamina = 20;
  const a = { type: 'learn', skill: 'food' } as const;
  const p = actionPreview(s, a);
  assert(p.warning);
  const next = act(s, a);
  assert.equal(next.health, s.health);
  assert.equal(p.healthChange, 0);
  assert.equal(p.confirmation, false);
  assert.doesNotMatch(p.warning, /健康−2/);
  assert.equal(next.stamina, 0);
  s = act(newGame(17), { type: 'market' });
  for (const q of [NaN, Infinity, -1, 0, 0.15]) {
    const r = dispatch(s, {
      type: 'trade',
      good: 'grain',
      quantity: q,
      side: 'buy',
    });
    assert(r.error);
    assert.deepEqual(r.state, s);
  }
});
void test('poultry feed costs follow eggs instead of disappearing from production margin', () => {
  let s = newGame(21);
  s.cash = 10000;
  s = act(s, { type: 'rentHousing', housing: 'courtyard' });
  s = act(s, { type: 'install', equipment: 'coop' });
  s = act(s, { type: 'learn', skill: 'husbandry' });
  s = act(s, { type: 'market' });
  s = act(s, { type: 'trade', good: 'hen', quantity: 10, side: 'buy' });
  s.batches = [];
  s = act(s, { type: 'trade', good: 'grain', quantity: 2, side: 'buy' });
  s = act(s, { type: 'leave' });
  s = act(s, { type: 'feed', count: 10 });
  s = closeDay(s, 'courtyard');
  assert(quantity(s, 'egg') > 0);
  assert.equal(s.ledger.feed, 42);
  assert.equal(
    s.batches.filter((b) => b.good === 'egg').reduce((a, b) => a + b.cost, 0) +
      s.ledger.feedPending,
    42,
  );
  assert(s.skillXp.husbandry > 0);
});

void test('a thousand clock-driven days retain future events, resumable saves and a reconciled cash journal', () => {
  let s = newGame(20260910, 30000);
  s.cash = 100000;
  let balance = s.cash;
  let peak = 0;
  let publicEvents = 0;
  for (let day = 1; day <= 1000; day++) {
    const perform = (action: Action) => {
      if (s.event)
        s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
      const before = s.nextId;
      const next = act(s, action);
      balance += next.logs
        .filter((l) => l.id >= before)
        .reduce((v, l) => v + l.cash, 0);
      s = next;
      assert.equal(s.cash, balance);
    };
    perform({ type: 'short' });
    if (s.event)
      s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
    perform({ type: 'eat', meal: 'diner' });
    perform({ type: 'wait', minutes: 1320 - (s.clock.minute % 1440) });
    perform({ type: 'sleep', minutes: 480, bed: 'inn' });
    perform({ type: 'wait', minutes: 120 });
    assert(s.worlds.some((w) => w.expected > s.day));
    publicEvents = s.stats.events;
    if (day % 50 === 0) {
      const raw = JSON.stringify(s);
      peak = Math.max(peak, Buffer.byteLength(raw));
      assert.deepEqual(readSave(raw), s);
    }
  }
  assert.equal(s.day, 1001);
  assert(
    publicEvents > 50,
    'repeatable encounters continue beyond the initial stories',
  );
  assert(peak < 100000);
});

void test('city reports replace lessons and persist their own verifiable follow-up', () => {
  let s = newGame(20260910);
  s.worlds = [];
  s.clock.minute = 540;
  s = act(s, { type: 'tea' });
  s.event = null;
  assert.equal(s.intel.length, 3);
  assert(s.intel.every((i) => i.reportVersion === 2 && i.resolution));
  assert(INFO_TEMPLATES.every((t) => t.id.startsWith('city-')));
  const entry = s.intel[0];
  const expected = structuredClone(entry.resolution!);
  s = act(s, { type: 'askIntel', id: entry.id });
  assert.equal(s.intel[0].followUp, expected.clue);
  const premature = dispatch(s, { type: 'visitIntel', id: entry.id });
  assert(premature.error);
  assert.deepEqual(premature.state, s);
  s = readSave(JSON.stringify(s))!;
  assert.deepEqual(s.intel[0].resolution, expected);
  setDay(s, expected.due, 540);
  s = act(s, { type: 'visitIntel', id: entry.id });
  assert.equal(s.intel[0].followUp, expected.text);
  assert(s.intel[0].visited);
  const repeat = dispatch(s, { type: 'visitIntel', id: entry.id });
  assert(repeat.error);
  const oldLesson = {
    ...s.intel[0],
    id: 'old-lesson',
    reportVersion: undefined,
    resolution: undefined,
  };
  s.intel.push(oldLesson);
  assert.throws(() => readSave(JSON.stringify(s)));
});

void test('operation feedback records current action and exact resource changes across reloads', () => {
  let s = newGame(5);
  s = act(s, { type: 'market' });
  assert.equal(s.lastResponse, undefined, '导航不生成经营结果');
  const before = structuredClone(s);
  s = act(s, { type: 'trade', side: 'buy', good: 'wheat', quantity: 1 });
  assert.match(s.lastResponse!, /买入/);
  assert(s.lastResponse!.includes(`现金${s.cash - before.cash}文`));
  assert(s.lastResponse!.includes(`体力${s.stamina - before.stamina}`));
  assert.equal(readSave(JSON.stringify(s))!.lastResponse, s.lastResponse);
  const response = s.lastResponse;
  s = act(s, { type: 'leave' });
  assert.equal(s.lastResponse, response, '离开市场保留上次经营结果');
});

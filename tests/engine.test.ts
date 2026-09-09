import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  quantity,
  occupied,
  capacity,
  quote,
  maybeEncounter,
  readSave,
  updatePrices,
  pickWeighted,
  achievements,
} from '../lib/game/engine.ts';
import { EVENTS } from '../lib/game/content.ts';
import { GOODS, GOOD_IDS } from '../lib/game/config.ts';
import type { Action, GameState } from '../lib/game/types.ts';
void test('every authored outcome is executable, bounded and replayable', () => {
  let checked = 0;
  for (const f of EVENTS)
    for (const v of f.variants)
      for (const c of v.choices) {
        const seen = new Set<string>();
        for (let seed = 1; seed <= 100; seed++) {
          const s = newGame(seed * 982451653);
          s.day = 2;
          s.event = {
            id: 999,
            family: f.id,
            variant: v.id,
            person: v.person,
            title: f.title,
            text: v.texts[0],
            clue: v.clue,
            inspection: v.inspection,
            hiddenFact: v.fact,
            inspected: false,
            choices: structuredClone(v.choices),
          };
          const next = act(s, { type: 'choice', id: c.id, eventId: 999 });
          const expected = c.outcomes.find((o) => o.text === next.story);
          assert(expected);
          seen.add(next.story);
          assert.equal(
            next.cash,
            s.cash - (c.cost.cash ?? 0) + (expected.effect.cash ?? 0),
          );
          assert.equal(next.ap, s.ap - (c.cost.ap ?? 0));
          assert(next.health >= 92);
          assert(next.followups.length <= 2);
          assert.deepEqual(
            next,
            act(readSave(JSON.stringify(s)), {
              type: 'choice',
              id: c.id,
              eventId: 999,
            }),
          );
          if (f.id === 'bargain' && expected.effect.good)
            assert.equal(
              next.batches.at(-1)?.cost,
              (c.cost.cash ?? 0) - (expected.effect.cash ?? 0),
            );
        }
        assert.equal(
          seen.size,
          c.outcomes.length,
          `${f.id}/${v.id}/${c.id}: unreachable outcome`,
        );
        checked += seen.size;
      }
  assert(checked >= 72);
});
void test('deep corrupt inventory and hidden event records are rejected', () => {
  for (const mutate of [
    (s: GameState) => {
      s.batches[0].units = -1;
    },
    (s: GameState) => {
      s.prices.grain.buy = 0;
    },
    (s: GameState) => {
      s.worlds[0].truth = 'broken' as never;
    },
    (s: GameState) => {
      s.buffs.cold = NaN;
    },
  ]) {
    const s = newGame(5);
    mutate(s);
    assert.throws(() => readSave(JSON.stringify(s)));
  }
});
function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined);
  return r.state;
}
function cancel(s: GameState) {
  return s.event
    ? act(s, { type: 'choice', id: 'decline', eventId: s.event.id })
    : s;
}
function invariant(s: GameState) {
  assert(s.cash >= 0 && Number.isInteger(s.cash));
  assert(s.health >= 0 && s.health <= 100);
  assert(s.stamina >= 0 && s.stamina <= 100);
  assert(s.ap >= 0 && s.ap <= 2);
  assert(occupied(s) <= capacity(s));
  for (const b of s.batches) {
    assert(b.units > 0 && Number.isInteger(b.units));
    assert(b.cost >= 0 && Number.isInteger(b.cost));
  }
  for (const g of GOOD_IDS) {
    assert(quote(s, g).buy > quote(s, g).sell);
  }
  assert.equal(s.cash, 800 + s.logs.reduce((n, l) => n + l.cash, 0));
}
void test('original sequence, accounting, deterministic save resume', () => {
  let s = newGame(42);
  for (const a of [
    { type: 'tea' },
    { type: 'market' },
    { type: 'trade', side: 'buy', good: 'grain', quantity: 20 },
    { type: 'trade', side: 'buy', good: 'hen', quantity: 1 },
    { type: 'leave' },
  ] as Action[])
    s = act(s, a);
  assert.equal(s.cash, 246);
  const saved = readSave(JSON.stringify(s));
  const a: Action = { type: 'night', meal: 'bread', bed: 'inn', feed: 1 };
  const next = act(s, a);
  assert.deepEqual(next, act(saved, a));
  assert.equal(next.cash, 216);
  assert.equal(next.day, 2);
  assert.equal(quantity(next, 'grain'), 21.8);
  assert.equal(quantity(next, 'bread'), 1);
  invariant(next);
  assert(dispatch(next, a).error);
  assert(dispatch(next, { type: 'heavy' }, s.revision).error);
});
void test('invalid trades are atomic and cannot reroll RNG', () => {
  const s = act(newGame(1), { type: 'market' });
  for (const q of [-1, 0, NaN, Infinity, 0.123, 1000000]) {
    const r = dispatch(s, {
      type: 'trade',
      side: 'buy',
      good: 'grain',
      quantity: q,
    });
    assert(r.error);
    assert.equal(r.state, s);
  }
  assert(
    dispatch(s, { type: 'trade', side: 'buy', good: 'hen', quantity: 0.5 })
      .error,
  );
  assert(
    dispatch(s, { type: 'trade', side: 'sell', good: 'tea', quantity: 1 })
      .error,
  );
  s.cash = 100000;
  const r = dispatch(s, {
    type: 'trade',
    side: 'buy',
    good: 'grain',
    quantity: 61,
  });
  assert(r.error);
  assert.equal(r.state, s);
});
void test('same-day trading loses spread; hens track purchase cost', () => {
  let s = act(newGame(1), { type: 'market' });
  s = act(s, { type: 'trade', side: 'buy', good: 'hen', quantity: 1 });
  s = act(s, { type: 'trade', side: 'sell', good: 'hen', quantity: 1 });
  assert.equal(s.stats.profit, -18);
  assert.equal(s.cash, 782);
  s.buffs.regular = 5;
  const before = s.cash;
  s = act(s, { type: 'trade', side: 'buy', good: 'grain', quantity: 1 });
  s = act(s, { type: 'trade', side: 'sell', good: 'grain', quantity: 1 });
  assert(s.cash < before);
  invariant(s);
});
void test('night preflight checks shared grain before spending', () => {
  const s = newGame(8);
  s.phase = 'night';
  s.hens = [{ id: 900, hunger: 0, cost: 126 }];
  s.batches = s.batches.filter((b) => b.good === 'grain');
  s.batches[0].units = 10;
  const r = dispatch(s, { type: 'night', meal: 'grain', bed: 'inn', feed: 1 });
  assert(r.error);
  assert.equal(r.state, s);
  assert.equal(r.state.cash, 800);
});
void test('starvation kills hens only after three consecutive nights', () => {
  let s = newGame(7);
  s.hens = [{ id: 900, hunger: 0, cost: 126 }];
  for (let n = 1; n <= 3; n++) {
    s.phase = 'night';
    s = act(s, { type: 'night', meal: 'diner', bed: 'inn', feed: 0 });
    assert.equal(s.hens.length, n < 3 ? 1 : 0);
  }
  assert.equal(s.stats.eggs, 0);
});
void test('feeding resets hunger and expiry occurs after meal', () => {
  let s = newGame(10);
  s.day = 3;
  s.phase = 'night';
  s.hens = [{ id: 900, hunger: 2, cost: 126 }];
  s = act(s, { type: 'night', meal: 'bread', bed: 'inn', feed: 1 });
  assert.equal(s.hens[0].hunger, 0);
  assert.equal(quantity(s, 'bread'), 0);
  assert(s.batches.every((b) => b.expires === null || b.expires >= s.day));
});
void test('mixed purchased and produced eggs keep separate costs', () => {
  let s = newGame(2);
  s.phase = 'market';
  s.batches = [
    {
      id: 100,
      good: 'egg',
      units: 10,
      cost: 4,
      expires: 3,
      origin: 'production',
    },
    { id: 101, good: 'egg', units: 10, cost: 15, expires: 4, origin: 'buy' },
  ];
  s = act(s, { type: 'trade', side: 'sell', good: 'egg', quantity: 2 });
  assert.equal(s.stats.eggRevenue, 12);
  assert.equal(s.stats.productionCostSold, 4);
  assert.equal(s.stats.profit, -3);
});
void test('three endings and final-night death precedence', () => {
  let s = newGame(9);
  s.cash = 3000;
  s = act(s, { type: 'return' });
  assert.equal(s.ending, 'return');
  assert.equal(s.cash, 0);
  assert.equal(s.beforeReturn, 3000);
  assert(achievements(s).find(([n]) => n === '归去来兮')?.[1]);
  let t = newGame(9);
  t.day = 30;
  t.phase = 'night';
  t = act(t, { type: 'night', meal: 'bread', bed: 'inn', feed: 0 });
  assert.equal(t.phase, 'last');
  t = act(t, { type: 'stay' });
  assert.equal(t.ending, 'stay');
  let d = newGame(9);
  d.day = 30;
  d.phase = 'night';
  d.health = 1;
  d = act(d, { type: 'night', meal: 'none', bed: 'street', feed: 0 });
  assert.equal(d.ending, 'death');
  assert.equal(d.stats.eggs, 0);
});
void test('content inventory: 8 families, 3 variants, coherent alternatives', () => {
  assert.equal(EVENTS.length, 8);
  const ids = new Set();
  for (const f of EVENTS) {
    assert(f.variants.length >= 3);
    for (const v of f.variants) {
      const id = f.id + v.id;
      assert(!ids.has(id));
      ids.add(id);
      assert.equal(v.texts.length, 2);
      assert(v.fact && v.clue && v.inspection);
      assert(v.choices.length >= 2 && v.choices.length <= 3);
      assert(v.choices.some((c) => c.outcomes.length >= 2));
      assert(
        v.choices.some(
          (c) => c.id === 'decline' && Object.keys(c.cost).length === 0,
        ),
      );
      for (const c of v.choices)
        for (const o of c.outcomes) {
          assert(o.weight > 0);
          assert(!o.effect.cash || o.effect.cash >= -50);
          assert(!o.effect.health || o.effect.health >= -8);
        }
    }
  }
});
void test('encounter facts, version exclusions, cooldown and save stability', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    let s = newGame(seed);
    for (let day = 2; day <= 30; day++) {
      s.day = day;
      s.phase = 'day';
      s.ap = 2;
      const prior = [...s.seen];
      maybeEncounter(s, true);
      if (s.event) {
        const e = s.event;
        variants.add(e.family + ':' + e.variant);
        assert(!prior.includes(e.family + ':' + e.variant));
        const saved = readSave(JSON.stringify(s));
        assert.deepEqual(
          act(s, { type: 'inspect' }),
          act(saved, { type: 'inspect' }),
        );
        s = cancel(s);
        const count = s.stats.events;
        maybeEncounter(s, true);
        assert.equal(s.stats.events, count);
      }
    }
  }
  assert.equal(variants.size, 24);
});
void test('world events vary across seeds, bounded prices, stable learned clues', () => {
  const types = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    let s = newGame(seed);
    s = act(s, { type: 'tea' });
    assert(s.worlds.filter((w) => w.heard).every((w) => w.clueKnown));
    s.worlds.forEach((w) => types.add(w.truth));
    for (let day = 2; day <= 30; day++) {
      s.day = day;
      updatePrices(s);
      for (const g of GOOD_IDS) {
        assert(s.prices[g].buy >= Math.ceil(GOODS[g].base * 0.5));
        assert(s.prices[g].buy <= GOODS[g].base * 2);
        assert(s.prices[g].buy > s.prices[g].sell);
      }
    }
  }
  assert.equal(types.size, 4);
});
void test('weighted sampler distribution and rare outcome reachable', () => {
  const s = newGame(1023);
  let rare = 0;
  for (let i = 0; i < 10000; i++)
    if (
      pickWeighted(s, [
        { weight: 99, id: 0 },
        { weight: 1, id: 1 },
      ]).id === 1
    )
      rare++;
  assert(rare > 65 && rare < 140, `rare=${rare}`);
});
void test('follow-up requires provenance and triggers once', () => {
  let s = newGame(7);
  s.day = 6;
  s.followups = [
    { chain: 'widow', person: '陈婆婆', source: 2, due: 5, branch: 'gift' },
  ];
  s.relations = { widow: 2 };
  maybeEncounter(s, true);
  assert.equal(s.event?.family, 'followup');
  assert(s.event?.text.includes('第2日'));
  assert.equal(s.followups.length, 0);
  s = cancel(s);
  maybeEncounter(s, true);
  assert.equal(s.event, null);
  const t = newGame(8);
  t.day = 4;
  t.followups = [
    { chain: 'widow', person: '陈婆婆', source: 2, due: 3, branch: 'gift' },
  ];
  maybeEncounter(t, true);
  assert.notEqual(t.event?.family, 'followup');
});
void test('declining is always available with no money or AP', () => {
  let s = newGame(5);
  s.day = 2;
  maybeEncounter(s, true);
  s.cash = 0;
  s.ap = 0;
  s.stamina = 0;
  s = cancel(s);
  assert.equal(s.event, null);
  assert.equal(s.cash, 0);
  assert.equal(s.phase, 'night');
});
void test('broken and incompatible saves are rejected', () => {
  assert.throws(() => readSave('{'));
  assert.throws(() => readSave('{}'));
  const s = newGame(1);
  s.version = 99;
  assert.throws(() => readSave(JSON.stringify(s)));
});

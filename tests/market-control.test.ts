import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  actionPreview,
  quote,
  readSave,
  updatePrices,
} from '../lib/game/engine.ts';
import { GOODS, GOOD_IDS } from '../lib/game/config.ts';
import { MARKET_METHODS } from '../lib/game/market-control.ts';
import { publicState } from '../lib/game/webmcp.ts';
import { discoverStory } from '../lib/game/story-engine.ts';
import { act, setDay } from './helpers.ts';
import type { GameState, Action } from '../lib/game/types.ts';

function ready(seed = 1) {
  const s = newGame(seed, 30000);
  s.cash = 5000;
  return s;
}
function caughtStory() {
  for (let seed = 1; seed < 100; seed++) {
    const s = ready(seed);
    const q = discoverStory(s, 'tea-price', 'tea');
    const action: Action = {
      type: 'storyAction',
      storyId: q.id,
      stage: 'opening',
      choiceId: 'rumor',
    };
    const result = dispatch(s, action);
    if (result.state.marketControl.jailedUntil)
      return { s, action, after: result.state };
  }
  throw Error('no caught seed');
}

await test('ordinary quotes have one price at start, with regular status and through changing markets', () => {
  const s = ready();
  s.buffs.regular = 100000;
  for (let day = 1; day <= 30; day++) {
    setDay(s, day);
    updatePrices(s);
    for (const g of GOOD_IDS) assert.equal(quote(s, g).buy, quote(s, g).sell);
  }
  let roundTrip = ready();
  const cash = roundTrip.cash;
  roundTrip = act(roundTrip, {
    type: 'trade',
    side: 'buy',
    good: 'herb',
    quantity: 1,
  });
  roundTrip = act(roundTrip, {
    type: 'trade',
    side: 'sell',
    good: 'herb',
    quantity: 1,
  });
  assert.equal(roundTrip.cash, cash);
  assert.equal(roundTrip.ledger.tradeRevenue - roundTrip.ledger.tradeCost, 0);
  assert.ok(roundTrip.clock.minute > 480);
  assert.ok(roundTrip.stamina < 100);
});

await test('legal interventions can succeed, fail or reverse; cooldown survives reload and no future outcome is public', () => {
  const signs = new Set<number>();
  for (let seed = 1; seed <= 60; seed++) {
    const s = ready(seed);
    const action: Action = {
      type: 'influenceMarket',
      method: 'promote',
      good: 'tea',
    };
    const before = structuredClone(s);
    const preview = actionPreview(s, action);
    assert.equal(preview.cashChange, -MARKET_METHODS.promote.cash);
    assert.deepEqual(s, before);
    const after = act(s, action);
    signs.add(Math.sign(after.prices.tea.buy - s.prices.tea.buy));
    assert.equal(after.cash, s.cash - MARKET_METHODS.promote.cash);
    assert.equal(after.prices.tea.buy, after.prices.tea.sell);
    assert.equal(after.history.at(-1)!.prices.tea.buy, after.prices.tea.buy);
    assert.deepEqual(readSave(JSON.stringify(after)), after);
    const duplicate = dispatch(after, {
      ...action,
      good: 'silk',
      method: 'import',
    });
    assert.match(duplicate.error!, /48小时/);
    assert.deepEqual(duplicate.state, after);
    assert.equal(JSON.stringify(publicState(s)).includes('caughtNext'), false);
  }
  assert.deepEqual(signs, new Set([1, 0, -1]));
});

await test('influence expires at morning repricing and legal regular discount cannot create a resale spread', () => {
  let s = ready(1);
  s.buffs.regular = 4000;
  s = act(s, { type: 'influenceMarket', method: 'import', good: 'grain' });
  assert.equal(s.marketControl.expenses, 35);
  const control = structuredClone(s);
  control.prices.grain = { buy: GOODS.grain.base, sell: GOODS.grain.base };
  const minutes = 1800 - s.clock.minute;
  s = act(s, { type: 'wait', minutes });
  const clean = act(control, { type: 'wait', minutes });
  assert.deepEqual(s.prices, clean.prices);
  assert.equal(quote(s, 'grain').buy, quote(s, 'grain').sell);
});

await test('caught rumor records actual fine, branches to court, blocks business and serves real continuous time', () => {
  const { s, action, after } = caughtStory();
  assert.equal(actionPreview(s, action).cashChange, null);
  assert.equal(after.stories[0].stage, 'court');
  const fine = 150 + Math.floor((s.cash - 25) * 0.2);
  assert.equal(after.cash, s.cash - 25 - fine);
  assert.equal(after.marketControl.fines, fine);
  assert.equal(after.ledger.dailyCash.at(-1)!.expense, fine + 25);
  assert.match(after.stories[0].history.at(-1)!.text, /拘押12小时/);
  for (const blocked of [
    { type: 'wait', minutes: 720 },
    { type: 'short' },
    { type: 'return' },
    { type: 'trade', good: 'tea', side: 'buy', quantity: 1 },
  ] as Action[]) {
    const result = dispatch(after, blocked);
    assert.match(result.error!, /拘押/);
    assert.deepEqual(result.state, after);
  }
  const resumed = readSave(JSON.stringify(after));
  const freed = act(resumed, { type: 'serveSentence' });
  assert.equal(freed.clock.minute - after.clock.minute, 720);
  assert.equal(freed.marketControl.jailedUntil, 0);
  assert.equal(
    freed.operationHistory.at(-1)!.finishedAt -
      freed.operationHistory.at(-1)!.startedAt,
    720,
  );
  const end = act(freed, {
    type: 'storyAction',
    storyId: freed.stories[0].id,
    stage: 'court',
    choiceId: 'accept',
  });
  assert.equal(end.stories[0].stage, 'risk-end');
  assert.deepEqual(readSave(JSON.stringify(end)), end);
  assert.ok(dispatch(end, { type: 'serveSentence' }).error);
});

await test('custody does not freeze spoilage or deadlines across dawn', () => {
  const s = ready();
  setDay(s, 2, 1320);
  s.marketControl.jailedUntil = s.clock.minute + 720;
  s.batches.push({
    id: s.nextId++,
    good: 'egg',
    units: 10,
    cost: 20,
    origin: 'buy',
    remainingMinutes: 60,
  });
  const story = discoverStory(s, 'tea-price', 'tea', 'tea-table');
  story.deadlineAt = s.clock.minute + 60;
  const after = act(s, { type: 'serveSentence' });
  assert.equal(after.day, 3);
  assert.equal(after.stories[0].stage, 'late');
  assert.equal(
    after.batches.some((b) => b.good === 'egg'),
    false,
  );
  assert.ok(after.ledger.losses > s.ledger.losses);
});

await test('invalid requests and old or incomplete saves are rejected without spending resources', () => {
  const s = ready();
  for (const action of [
    { type: 'influenceMarket', method: 'bad', good: 'tea' },
    { type: 'influenceMarket', method: 'promote', good: 'bad' },
  ])
    assert.deepEqual(dispatch(s, action as Action).state, s);
  for (const mutate of [
    (v: GameState) => {
      v.saveRevision = 5;
    },
    (v: GameState) => {
      delete (v as Partial<GameState>).marketControl;
    },
    (v: GameState) => {
      v.marketControl.jailedUntil = v.clock.minute + 721;
    },
    (v: GameState) => {
      v.prices.tea.sell--;
    },
    (v: GameState) => {
      v.history[0].prices.tea.sell--;
    },
  ]) {
    const broken = structuredClone(s);
    mutate(broken);
    assert.throws(() => readSave(JSON.stringify(broken)));
  }
});

await test('generated contract premiums use unified price and already posted terms stay locked during intervention', async () => {
  const { generateOrders, CUSTOMER_IDS } =
    await import('../lib/game/commerce.ts');
  const risks = new Set<boolean>();
  for (let seed = 1; seed <= 30; seed++) {
    const s = ready(seed);
    setDay(s, 5);
    for (const id of CUSTOMER_IDS) s.commerce.relations[id] = 3;
    generateOrders(s);
    for (const order of s.commerce.orders) {
      risks.add(order.highRisk);
      for (const good of Object.keys(order.goods) as (keyof typeof GOODS)[]) {
        assert.equal(
          order.prices[good],
          Math.round(s.prices[good].buy * (order.highRisk ? 1.15 : 1.1)),
        );
      }
    }
    const terms = structuredClone(s.commerce.orders);
    const after = act(s, {
      type: 'influenceMarket',
      method: 'promote',
      good: 'tea',
    });
    assert.deepEqual(after.commerce.orders, terms);
  }
  assert.deepEqual(risks, new Set([true, false]));
});

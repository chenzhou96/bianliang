import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, dispatch, quote, readSave } from '../lib/game/engine.ts';
import {
  MARKET_METHODS,
  type MarketMethod,
} from '../lib/game/market-control.ts';
import type { Action } from '../lib/game/types.ts';

// A controlled single-position experiment, not a long-term survival policy.
const rows: {
  method: MarketMethod;
  seed: number;
  change: number;
  caught: boolean;
  cashChange: number;
  fines: number;
  minutes: number;
}[] = [];
for (const method of Object.keys(MARKET_METHODS) as MarketMethod[]) {
  for (let seed = 1; seed <= 100; seed++) {
    let s = newGame(seed, 30000);
    s.cash = 5000;
    const act = (a: Action) => {
      if (s.event) {
        const exit = dispatch(s, {
          type: 'choice',
          eventId: s.event.id,
          id: 'decline',
        });
        assert.equal(exit.error, undefined);
        s = exit.state;
      }
      const result = dispatch(s, a);
      assert.equal(result.error, undefined, result.error);
      s = result.state;
    };
    const initialPrice = quote(s, 'tea').buy;
    if (method !== 'import')
      act({ type: 'trade', side: 'buy', good: 'tea', quantity: 10 });
    act({ type: 'influenceMarket', method, good: 'tea' });
    const change = quote(s, 'tea').buy - initialPrice;
    const caught = s.marketControl.jailedUntil > s.clock.minute;
    if (caught) act({ type: 'serveSentence' });
    if (method === 'import')
      act({ type: 'trade', side: 'buy', good: 'tea', quantity: 10 });
    if (method === 'import' || caught) {
      const tomorrow = (Math.floor(s.clock.minute / 1440) + 1) * 1440 + 480;
      act({ type: 'wait', minutes: tomorrow - s.clock.minute });
    }
    act({ type: 'trade', side: 'sell', good: 'tea', quantity: 10 });
    assert.deepEqual(readSave(JSON.stringify(s)), s);
    rows.push({
      method,
      seed,
      change,
      caught,
      cashChange: s.cash - 5000,
      fines: s.marketControl.fines,
      minutes: s.clock.minute - 480,
    });
  }
}
const summary = (Object.keys(MARKET_METHODS) as MarketMethod[]).map(
  (method) => {
    const group = rows.filter((r) => r.method === method);
    const profits = group.map((r) => r.cashChange).sort((a, b) => a - b);
    return {
      method,
      samples: group.length,
      caught: group.filter((r) => r.caught).length,
      expectedDirection: group.filter(
        (r) => r.change * MARKET_METHODS[method].direction > 0,
      ).length,
      unchanged: group.filter((r) => r.change === 0).length,
      reversed: group.filter(
        (r) => r.change * MARKET_METHODS[method].direction < 0,
      ).length,
      profitable: profits.filter((n) => n > 0).length,
      mean: profits.reduce((a, b) => a + b, 0) / profits.length,
      median: (profits[49] + profits[50]) / 2,
      min: profits[0],
      max: profits.at(-1),
    };
  },
);
assert.ok(
  summary.every((r) => r.min < 0 && r.max! > 0),
  'every method must carry real trading risk',
);
assert.ok(summary.find((r) => r.method === 'rumor')!.caught > 0);
mkdirSync('tests/browser-output/market-control', { recursive: true });
writeFileSync(
  'tests/browser-output/market-control/economy.json',
  JSON.stringify(
    {
      assumption:
        '5000 cash, 10 tea units; promote/rumor buy before intervention, import buys after and sells next morning; no meals or outside work',
      summary,
      rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary, null, 2));

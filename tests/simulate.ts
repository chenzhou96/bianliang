import {
  newGame,
  dispatch,
  quantity,
  occupied,
  capacity,
  quote,
  active,
  assets,
} from '../lib/game/engine.ts';
import { GOODS, GOOD_IDS } from '../lib/game/config.ts';
import type { Action, Good, Meal } from '../lib/game/types.ts';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
type Strategy = 'labor' | 'trader' | 'poultry' | 'mixed';
function run(seed: number, strategy: Strategy) {
  let s = newGame(seed),
    steps = 0;
  const act = (a: Action) => {
    const r = dispatch(s, a);
    if (r.error)
      throw Error(`${strategy} seed=${seed} day=${s.day}: ${r.error}`);
    s = r.state;
    assert(s.cash >= 0 && s.health >= 0 && occupied(s) <= capacity(s));
    assert.equal(s.cash, 800 + s.logs.reduce((a, l) => a + l.cash, 0));
  };
  const tradeGoods: Good[] = ['tea', 'cloth', 'wine', 'herb'];
  while (s.phase !== 'ended' && steps++ < 500) {
    if (s.event) {
      act({ type: 'choice', id: 'decline', eventId: s.event.id });
      continue;
    }
    if (s.cash >= 3000) {
      act({ type: 'return' });
      continue;
    }
    if (s.phase === 'last') {
      act({ type: 'stay' });
      continue;
    }
    if (s.phase === 'day' && assets(s) >= 3000) {
      act({ type: 'market' });
      continue;
    }
    if (s.phase === 'market' && assets(s) >= 3000) {
      for (const good of GOOD_IDS) {
        const q = quantity(s, good);
        if (q) act({ type: 'trade', good, side: 'sell', quantity: q });
      }
      act({ type: 'return' });
      continue;
    }
    if (s.phase === 'night') {
      const feed = Math.min(
        s.hens.length,
        Math.floor(quantity(s, 'grain') * 5),
      );
      const meal: Meal =
        quantity(s, 'bread') >= 1
          ? 'bread'
          : quantity(s, 'egg') >= 2
            ? 'egg'
            : s.cash >= 18
              ? 'diner'
              : quantity(s, 'grain') >= 1 + feed * 0.2
                ? 'grain'
                : 'none';
      act({
        type: 'night',
        meal,
        bed: s.rented
          ? 'home'
          : s.cash >= (meal === 'diner' ? 48 : 30)
            ? 'inn'
            : 'temple',
        feed,
      });
      continue;
    }
    const chicken = strategy === 'poultry' || strategy === 'mixed';
    const trade = strategy === 'trader' || strategy === 'mixed';
    const sellable = tradeGoods.filter(
      (g) =>
        quantity(s, g) > 0 &&
        quote(s, g).sell >=
          (s.batches
            .filter((b) => b.good === g)
            .reduce((a, b) => a + b.cost, 0) /
            quantity(s, g)) *
            1.1,
    );
    const opportunity = tradeGoods
      .filter((g) => quote(s, g).buy < GOODS[g].base * 0.82)
      .sort(
        (a, b) =>
          quote(s, a).buy / GOODS[a].base - quote(s, b).buy / GOODS[b].base,
      )[0];
    if (s.phase === 'market') {
      for (const g of tradeGoods)
        if (quantity(s, g) > 0 && (sellable.includes(g) || s.day >= 29))
          act({
            type: 'trade',
            good: g,
            side: 'sell',
            quantity: quantity(s, g),
          });
      if (quantity(s, 'egg') > 0)
        act({
          type: 'trade',
          good: 'egg',
          side: 'sell',
          quantity: quantity(s, 'egg'),
        });
      const henGoal = s.coop ? (strategy === 'poultry' ? 12 : 6) : 3;
      if (chicken && s.day < 20 && s.hens.length < henGoal) {
        const q = Math.min(
          henGoal - s.hens.length,
          Math.floor(Math.max(0, s.cash - 250) / quote(s, 'hen').buy),
        );
        if (q) act({ type: 'trade', good: 'hen', side: 'buy', quantity: q });
      }
      if (s.hens.length && quantity(s, 'grain') < s.hens.length) {
        const want = Math.ceil(s.hens.length * 1.4 - quantity(s, 'grain'));
        const q = Math.min(
          want,
          Math.floor((s.cash - 60) / quote(s, 'grain').buy),
          Math.floor((capacity(s) - occupied(s)) / 10),
        );
        if (q > 0)
          act({ type: 'trade', good: 'grain', side: 'buy', quantity: q });
      }
      if (trade && opportunity && s.day < 27) {
        const q = Math.min(
          15,
          Math.floor(Math.max(0, s.cash - 300) / quote(s, opportunity).buy),
          Math.floor((capacity(s) - occupied(s)) / 10),
        );
        if (q > 0)
          act({ type: 'trade', good: opportunity, side: 'buy', quantity: q });
      }
      act({ type: 'leave' });
      continue;
    }
    if (!s.rented && s.cash >= 450) {
      act({ type: 'rent' });
      continue;
    }
    if (chicken && !s.coop && s.rented && s.cash > 750 && s.day < 15) {
      act({ type: 'coop' });
      continue;
    }
    const needsMarket =
      (chicken &&
        ((s.hens.length === 0 && s.cash > 450) ||
          (s.hens.length > 0 && quantity(s, 'grain') < s.hens.length * 0.6) ||
          quantity(s, 'egg') >= Math.max(4, s.hens.length * 2))) ||
      (trade && (sellable.length > 0 || (!!opportunity && s.cash > 600))) ||
      (s.day === 29 && tradeGoods.some((g) => quantity(s, g) > 0));
    if (needsMarket && s.ap > 0) {
      act({ type: 'market' });
      continue;
    }
    if (
      strategy === 'mixed' &&
      s.day % 7 === 0 &&
      s.teaDay !== s.day &&
      s.cash > 400 &&
      s.ap === 2
    ) {
      act({ type: 'tea' });
      continue;
    }
    if (s.stamina >= (active(s, 'tired') ? 45 : 40) && s.health >= 40)
      act({ type: 'heavy' });
    else if (s.stamina >= (active(s, 'tired') ? 30 : 25))
      act({ type: 'short' });
    else act({ type: 'rest' });
  }
  assert(steps < 500, 'softlock');
  return {
    seed,
    strategy,
    ending: s.ending,
    day: s.day,
    cash: s.beforeReturn || s.cash,
    assets: assets(s),
    eggs: s.stats.eggs,
    profit: s.stats.profit,
    events: s.stats.events,
  };
}
const rows: ReturnType<typeof run>[] = [];
for (const strategy of ['labor', 'trader', 'poultry', 'mixed'] as Strategy[])
  for (let seed = 1; seed <= 100; seed++) rows.push(run(seed * 7919, strategy));
const summary = (['labor', 'trader', 'poultry', 'mixed'] as Strategy[]).map(
  (strategy) => {
    const r = rows.filter((r) => r.strategy === strategy),
      wins = r.filter((r) => r.ending === 'return');
    return {
      strategy,
      runs: r.length,
      wins: wins.length,
      deaths: r.filter((r) => r.ending === 'death').length,
      meanDay: +(r.reduce((a, b) => a + b.day, 0) / r.length).toFixed(1),
      meanCash: +(r.reduce((a, b) => a + b.cash, 0) / r.length).toFixed(0),
      meanEggs: +(r.reduce((a, b) => a + b.eggs, 0) / r.length).toFixed(1),
    };
  },
);
writeFileSync(
  'tests/simulation-results.json',
  JSON.stringify(
    {
      notice:
        '自动策略使用当前报价和公开基础价格，不读取隐藏事件事实。不能替代真人时长验证。',
      summary,
      rows,
    },
    null,
    2,
  ),
);
console.table(summary);

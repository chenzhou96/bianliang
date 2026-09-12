import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  assets,
  capacity,
  dispatch,
  newGame,
  occupied,
  quantity,
  quote,
  inventoryCost,
  productionPlan,
  installed,
  henCapacity,
  readSave,
  orderPreview,
  availableSurplus,
} from '../lib/game/engine.ts';
import {
  orderTerms,
  returnTerms,
  publicCalendar,
} from '../lib/game/commerce.ts';
import {
  EQUIPMENT,
  GOODS,
  GOOD_IDS,
  HOUSING,
  RECIPES,
  LESSON_COST,
  XP_TO_LEVEL,
} from '../lib/game/config.ts';
import type {
  Action,
  Good,
  SkillId,
  EquipmentKind,
} from '../lib/game/types.ts';
type Strategy =
  | 'labor'
  | 'trade'
  | 'poultry'
  | 'food'
  | 'textile'
  | 'brewing'
  | 'mixed'
  | 'order-trade'
  | 'order-risk'
  | 'festival';
const strategies: Strategy[] = [
  'labor',
  'trade',
  'poultry',
  'food',
  'textile',
  'brewing',
  'mixed',
  'order-trade',
  'order-risk',
  'festival',
];
const specialties: Partial<
  Record<
    Strategy,
    { skill: SkillId; equipment: EquipmentKind[]; recipes: string[] }
  >
> = {
  food: {
    skill: 'food',
    equipment: ['stove', 'mill'],
    recipes: ['bread', 'flour'],
  },
  textile: {
    skill: 'textile',
    equipment: ['spinningWheel', 'loom'],
    recipes: ['thread', 'cloth', 'silk'],
  },
  brewing: { skill: 'brewing', equipment: ['brewVat'], recipes: ['wine'] },
  poultry: { skill: 'husbandry', equipment: ['coop'], recipes: [] },
  mixed: {
    skill: 'food',
    equipment: ['stove', 'pickleVat'],
    recipes: ['bread', 'saltedEgg'],
  },
  festival: { skill: 'brewing', equipment: ['brewVat'], recipes: ['wine'] },
};
export function run(
  seed: number,
  strategy: Strategy,
  maxDay = 180,
  neverReturn = false,
) {
  let s = newGame(seed, 30000);
  let steps = 0;
  let maxSaveBytes = 0;
  let futureDays = 0;
  let acceptedOrders = 0;
  const attempt = (a: Action) => {
    steps++;
    const r = dispatch(s, a);
    if (r.error) return false;
    if (a.type === 'acceptOrder') acceptedOrders++;
    s = r.state;
    return true;
  };
  const resolve = () => {
    if (s.event)
      assert(attempt({ type: 'choice', eventId: s.event.id, id: 'decline' }));
  };
  const market = () => {
    resolve();
    if (s.phase === 'day') assert(attempt({ type: 'market' }));
  };
  const leave = () => {
    resolve();
    if (s.phase === 'day') assert(attempt({ type: 'leave' }));
  };
  const buy = (g: Good, q: number) => {
    if (q <= 0) return true;
    market();
    return attempt({ type: 'trade', side: 'buy', good: g, quantity: q });
  };
  const sell = (g: Good, q: number) => {
    if (q <= 0) return;
    market();
    attempt({ type: 'trade', side: 'sell', good: g, quantity: q });
  };
  const special = specialties[strategy];
  while (s.phase !== 'ended' && s.day <= maxDay) {
    resolve();
    if (s.cash >= s.target && !neverReturn) {
      assert(attempt({ type: 'return', confirm: returnTerms(s) }));
      break;
    }
    attempt({ type: 'rest' });
    attempt({ type: 'snack' });
    // Only today's visible prices, inventory costs and public configuration drive decisions.
    for (const g of GOOD_IDS) {
      if (strategy.startsWith('order-')) continue;
      if (g === 'hen') continue;
      if (
        strategy === 'festival' &&
        s.cash > 500 &&
        publicCalendar(s).some((f) => f.goods.includes(g) && f.start > s.day) &&
        !s.batches.some(
          (b) =>
            b.good === g &&
            b.remainingMinutes !== null &&
            b.remainingMinutes! < (publicCalendar(s)[0].start - s.day) * 1440,
        )
      )
        continue;
      const q = Math.floor(
        strategy.startsWith('order-') ? availableSurplus(s, g) : quantity(s, g),
      );
      const produced = s.batches.some(
        (b) => b.good === g && b.origin === 'production',
      );
      const c = q ? inventoryCost(s, g, q) / q : 0;
      const expiry = s.batches.some(
        (b) =>
          b.good === g &&
          b.remainingMinutes !== null &&
          b.remainingMinutes! <= 1440,
      );
      if (
        produced ||
        (['trade', 'order-trade', 'order-risk'].includes(strategy) &&
          q > 0 &&
          (quote(s, g).sell > c * 1.08 || expiry))
      )
        sell(g, q);
    }
    leave();
    if (s.housing.id === 'street' && s.cash > HOUSING.room.cost + 120)
      attempt({ type: 'rentHousing', housing: 'room' });
    if (strategy.startsWith('order-')) {
      // Contract prices and past observations are public. No future price or RNG access.
      for (const o of s.commerce.orders
        .filter((o) => o.status === 'offered')
        .sort(
          (a, b) => orderPreview(s, b).profit - orderPreview(s, a).profit,
        )) {
        if (o.highRisk && strategy === 'order-trade') continue;
        const costFloor = Object.entries(o.goods).reduce((n, [id, q]) => {
          const g = id as Good;
          const observed = Math.min(
            quote(s, g).buy,
            ...s.history.map((h) => h.prices[g].buy),
          );
          return n + q! * observed;
        }, 0);
        const p = orderPreview(s, o);
        if (
          o.price - costFloor < 30 ||
          p.profit < 20 ||
          s.cash <
            o.deposit +
              p.purchaseCost +
              120 +
              s.commerce.orders
                .filter((x) => x.status === 'accepted')
                .reduce((n, x) => n + orderPreview(s, x).purchaseCost, 0) ||
          p.carrying > 80
        )
          continue;
        attempt({ type: 'acceptOrder', orderId: o.id, confirm: orderTerms(o) });
      }
      for (const original of s.commerce.orders.filter(
        (o) => o.status === 'accepted',
      )) {
        const o = s.commerce.orders.find((x) => x.id === original.id)!;
        const p = orderPreview(s, o);
        if (
          (p.profit >= 20 ||
            o.deadlineAt <= s.clock.minute + 1440 ||
            p.deliverable) &&
          p.purchaseCost < s.cash - 65
        ) {
          for (const m of p.materials)
            if (m.missing)
              buy(
                m.good,
                Math.min(m.missing, Math.max(0, Math.floor(s.stamina - 10))),
              );
          leave();
          attempt({ type: 'deliverOrder', orderId: o.id });
        }
      }
    }
    if (special) {
      const level = s.skills[special.skill];
      if (
        level < 3 &&
        !s.daily.lessons &&
        s.cash > LESSON_COST[level] + 150 &&
        (level === 0 || s.skillXp[special.skill] >= XP_TO_LEVEL[level + 1])
      )
        attempt({ type: 'learn', skill: special.skill });
      for (const eq of special.equipment)
        if (!installed(s, eq) && s.cash > EQUIPMENT[eq].cost + 160)
          attempt({ type: 'install', equipment: eq });
      if (strategy === 'poultry') {
        if (s.housing.id === 'room' && s.cash > 1400)
          attempt({ type: 'rentHousing', housing: 'courtyard' });
        if (s.housing.id === 'courtyard' && s.cash > 10000)
          attempt({ type: 'buyHousing', housing: 'yard' });
        const desired = henCapacity(s) - s.hens.length;
        const available = Math.floor((s.cash - 180) / quote(s, 'hen').buy);
        if (desired > 0 && available > 0)
          buy(
            'hen',
            Math.min(desired, available, Math.floor((s.stamina - 20) / 2)),
          );
      }
      if (strategy === 'poultry') {
        const need = Math.max(
          0,
          s.hens.length * (s.skills.husbandry >= 3 ? 0.1 : 0.2) -
            quantity(s, 'grain'),
        );
        buy('grain', Math.ceil(need * 10) / 10);
        leave();
      }
      for (let cycle = 0; cycle < 2; cycle++) {
        leave();
        let best: {
          id: string;
          n: number;
          profit: number;
          score: number;
          inputs: Partial<Record<Good, number>>;
        } | null = null;
        for (const r of RECIPES.filter(
          (r) =>
            special.recipes.includes(r.id) &&
            s.skills[r.industry] >= r.minSkill &&
            installed(s, r.equipment) &&
            !installed(s, r.equipment)?.jobId,
        ))
          for (let n = 1; n <= 20; n++) {
            const p = productionPlan(s, r, n);
            let spend = 0;
            let carry = p.outputUnits / 10;
            let removed = 0;
            for (const [g, u] of Object.entries(p.inputs) as [Good, number][]) {
              const q = Math.max(0, Math.ceil(u / 10 - quantity(s, g)));
              spend += q * quote(s, g).buy;
              carry += q;
              removed += u;
            }
            const material = Object.entries(p.inputs).reduce(
              (a, [g, u]) => a + (quote(s, g as Good).buy * u!) / 10,
              0,
            );
            const profit =
              (quote(s, r.output).sell * p.outputUnits) / 10 - material;
            if (
              spend > s.cash - 65 ||
              p.energy + carry + 10 > s.stamina ||
              occupied(s) + p.outputUnits - removed > capacity(s) ||
              profit <= 0
            )
              continue;
            const score =
              strategy === 'festival' &&
              publicCalendar(s).some(
                (f) =>
                  f.goods.includes(r.output) &&
                  s.day + r.duration >= f.start &&
                  s.day + r.duration <= f.end,
              )
                ? profit * 1.1
                : profit;
            if (!best || score > best.score)
              best = { id: r.id, n, profit, score, inputs: p.inputs };
          }
        if (!best) break;
        let ok = true;
        for (const [g, u] of Object.entries(best.inputs) as [Good, number][])
          ok = buy(g, Math.max(0, Math.ceil(u / 10 - quantity(s, g)))) && ok;
        leave();
        if (
          ok &&
          attempt({ type: 'produce', recipeId: best.id, quantity: best.n })
        ) {
          const r = RECIPES.find((r) => r.id === best!.id)!;
          if (!r.duration) sell(r.output, Math.floor(quantity(s, r.output)));
          leave();
        }
      }
    }
    if (['trade', 'order-trade', 'order-risk'].includes(strategy)) {
      if (strategy.startsWith('order-')) {
        for (const g of GOOD_IDS) {
          if (g === 'hen') continue;
          const q = Math.floor(availableSurplus(s, g));
          const c = q ? inventoryCost(s, g, q) / q : 0;
          if (
            q > 0 &&
            (quote(s, g).sell > c * 1.08 ||
              s.batches.some(
                (b) =>
                  b.good === g &&
                  b.remainingMinutes !== null &&
                  b.remainingMinutes! <= 1440,
              ))
          )
            sell(g, q);
        }
      }
      const choices = GOOD_IDS.filter(
        (g) =>
          !GOODS[g].life &&
          g !== 'hen' &&
          quote(s, g).buy < GOODS[g].base * 0.88,
      ).sort(
        (a, b) =>
          GOODS[b].base * 0.92 -
          quote(s, b).buy -
          (GOODS[a].base * 0.92 - quote(s, a).buy),
      );
      if (
        choices[0] &&
        !(
          strategy.startsWith('order-') &&
          s.commerce.orders.some((o) => o.status === 'accepted')
        )
      ) {
        const g = choices[0];
        const q = Math.min(
          Math.floor(
            (s.cash -
              150 -
              (strategy.startsWith('order-')
                ? s.commerce.orders
                    .filter((o) => o.status === 'accepted')
                    .reduce((n, o) => n + orderPreview(s, o).purchaseCost, 0)
                : 0)) /
              quote(s, g).buy,
          ),
          Math.floor((capacity(s) - occupied(s)) / 10),
          Math.max(0, s.stamina - 15),
        );
        buy(g, q);
      }
      leave();
    }
    for (let n = 0; n < 2; n++) {
      resolve();
      if (!attempt({ type: 'heavy' })) attempt({ type: 'short' });
    }
    resolve();
    if (s.health < 65 && s.cash > 100) attempt({ type: 'treat', mode: 'slow' });
    if (s.cash >= s.target && !neverReturn) {
      assert(attempt({ type: 'return', confirm: returnTerms(s) }));
      break;
    }
    const feed = Math.min(
      s.hens.length,
      Math.floor(
        quantity(s, 'grain') / (s.skills.husbandry >= 3 ? 0.1 : 0.2) + 1e-6,
      ),
    );
    const bed =
      s.housing.id === 'street'
        ? s.cash >= 60
          ? 'inn'
          : 'temple'
        : s.housing.id;
    if (feed) attempt({ type: 'feed', count: feed });
    if (quantity(s, 'bread') >= 1) attempt({ type: 'eat', meal: 'bread' });
    else if (s.cash >= 18) attempt({ type: 'eat', meal: 'diner' });
    if (s.clock.minute % 1440 < 1320)
      attempt({ type: 'wait', minutes: 1320 - (s.clock.minute % 1440) });
    let ok = attempt({ type: 'sleep', minutes: 480, bed });
    if (!ok) ok = attempt({ type: 'sleep', minutes: 480, bed: 'temple' });
    assert(ok);
    if (s.health > 0 && s.clock.minute % 1440 < 480)
      attempt({ type: 'wait', minutes: 480 - (s.clock.minute % 1440) });
    assert(
      s.cash >= 0 &&
        s.stamina >= 0 &&
        s.stamina <= 100 &&
        s.jobs.filter((j) => j.status === 'queued').length <=
          s.equipment.length,
    );
    if (s.worlds.some((w) => w.expected > s.day)) futureDays++;
    if (s.day % 25 === 0) {
      const raw = JSON.stringify(s);
      maxSaveBytes = Math.max(maxSaveBytes, Buffer.byteLength(raw));
      assert.deepEqual(readSave(raw), s);
    }
  }
  return {
    seed,
    strategy,
    target: s.target,
    ending: s.ending,
    day: s.day,
    cash: s.beforeReturn || s.cash,
    assets: assets(s),
    productionRuns: s.stats.productionRuns,
    eggs: s.stats.eggs,
    workIncome: s.stats.workIncome,
    profit:
      s.ledger.tradeRevenue -
      s.ledger.tradeCost +
      s.ledger.productionRevenue -
      s.ledger.productionCost,
    steps,
    maxSaveBytes,
    futureDays,
    acceptedOrders,
    completedOrders: s.commerce.completed,
    failedOrders: s.commerce.failed,
    depositLosses: s.ledger.depositLosses,
    death: s.ending === 'death',
    cashExhausted: s.cash === 0 && s.ending !== 'return',
  };
}
const samples = Number(process.env.SIMULATION_SAMPLES ?? 100);
const days = Number(process.env.SIMULATION_DAYS ?? 180);
const selectedStrategies = process.env.SIMULATION_STRATEGIES
  ? strategies.filter((s) =>
      process.env.SIMULATION_STRATEGIES!.split(',').includes(s),
    )
  : strategies;
assert(selectedStrategies.length > 0);
const rows = selectedStrategies.flatMap((strategy) =>
  Array.from({ length: samples }, (_, i) =>
    run((i + 1) * 7919, strategy, days),
  ),
);
const summary = selectedStrategies.map((strategy) => {
  const g = rows.filter((r) => r.strategy === strategy);
  return {
    strategy,
    runs: g.length,
    wins: g.filter((r) => r.ending === 'return').length,
    meanWinDay: g.some((r) => r.ending === 'return')
      ? +(
          g
            .filter((r) => r.ending === 'return')
            .reduce((n, r) => n + r.day, 0) /
          g.filter((r) => r.ending === 'return').length
        ).toFixed(1)
      : null,
    meanDay: +(g.reduce((a, r) => a + r.day, 0) / g.length).toFixed(1),
    meanCash: Math.round(g.reduce((a, r) => a + r.cash, 0) / g.length),
    meanProfit: Math.round(g.reduce((a, r) => a + r.profit, 0) / g.length),
    meanProduction: Math.round(
      g.reduce((a, r) => a + r.productionRuns, 0) / g.length,
    ),
    orderCompletions: g.reduce((n, r) => n + r.completedOrders, 0),
    orderFailures: g.reduce((n, r) => n + r.failedOrders, 0),
    defaultRate: +(
      g.reduce((n, r) => n + r.failedOrders, 0) /
      Math.max(
        1,
        g.reduce((n, r) => n + r.acceptedOrders, 0),
      )
    ).toFixed(4),
    depositLosses: g.reduce((n, r) => n + r.depositLosses, 0),
    deaths: g.filter((r) => r.death).length,
    cashExhausted: g.filter((r) => r.cashExhausted).length,
  };
});
const stability =
  process.env.SIMULATION_SKIP_STABILITY === '1'
    ? null
    : run(20260910, 'food', 1000, true);
const result = {
  notice: `${selectedStrategies.length}策略使用相同${samples}组种子，统一30000文目标，观察${days}日。策略不读隐藏日程、真相或随机数。`,
  summary,
  stability,
  rows,
};
writeFileSync(
  process.env.SIMULATION_OUTPUT ?? 'tests/simulation-results.json',
  JSON.stringify(result, null, 2),
);
console.table(summary);
console.log('1000日稳定性', stability);

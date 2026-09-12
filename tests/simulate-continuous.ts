import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  assets,
  availableSurplus,
  dispatch,
  inventoryCost,
  maximumTrade,
  newGame,
  orderPreview,
  productionPlan,
  quantity,
  actionPreview,
  quote,
  readSave,
} from '../lib/game/engine.ts';
import {
  EQUIPMENT,
  GOODS,
  GOOD_IDS,
  HOUSING,
  RECIPES,
} from '../lib/game/config.ts';
import { FACILITIES } from '../lib/game/home.ts';
import { orderTerms } from '../lib/game/commerce.ts';
import { publicOpportunities } from '../lib/game/market-opportunities.ts';
import { lifeCycle } from '../lib/game/time.ts';
import type { Action, Good, GameState } from '../lib/game/types.ts';

const STRATEGIES = [
  'grain',
  'precious',
  'fresh',
  'order',
  'production',
  'mixed',
] as const;
type Strategy = (typeof STRATEGIES)[number];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
function run(seed: number, strategy: Strategy, days: number, late = false) {
  let s = newGame(seed, 30000);
  const initial = assets(s);
  let developmentDay: number | null = null;
  let housingDay: number | null = null;
  let cartDay: number | null = null;
  let cashTheft = 0;
  const actionMinutes: Record<string, number> = {};
  let actions = 0;
  const actionCounts: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  const snapshots: {
    day: number;
    cash: number;
    assets: number;
    health: number;
    debt: number;
  }[] = [];
  const netAssets = () =>
    assets(s) +
    s.equipment.reduce(
      (sum, e) => sum + Math.floor(EQUIPMENT[e.kind].cost * 0.6),
      0,
    ) +
    s.home.facilities.reduce(
      (sum, f) => sum + Math.floor(FACILITIES[f.kind].cost * 0.6),
      0,
    ) +
    (HOUSING[s.housing.id].kind === 'owned'
      ? Math.floor(HOUSING[s.housing.id].cost * 0.72)
      : 0);
  const observe = (before: GameState, after: GameState, action: Action) => {
    actions++;
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
    actionMinutes[action.type] =
      (actionMinutes[action.type] ?? 0) +
      after.clock.minute -
      before.clock.minute;
    cashTheft -= after.logs
      .filter((l) => l.id >= before.nextId && l.text === '临时住宿失窃')
      .reduce((n, l) => n + l.cash, 0);
    if (after.home.cart && cartDay === null) cartDay = after.day;
    if (after.housing.id !== 'street' && housingDay === null)
      housingDay = after.day;
  };
  const act = (action: Action) => {
    if (s.phase === 'ended') return false;
    if (s.event && action.type !== 'choice') {
      const result = dispatch(s, {
        type: 'choice',
        eventId: s.event.id,
        id: 'decline',
      });
      assert.equal(result.error, undefined);
      observe(s, result.state, {
        type: 'choice',
        eventId: s.event.id,
        id: 'decline',
      });
      s = result.state;
    }
    const result = dispatch(s, action);
    if (result.error) {
      rejected[result.error] = (rejected[result.error] ?? 0) + 1;
      return false;
    }
    observe(s, result.state, action);
    s = result.state;
    if (s.home.cart && s.housing.id !== 'street' && developmentDay === null)
      developmentDay = s.day;
    return true;
  };
  const transport = () => (s.home.cart ? ('cart' as const) : ('self' as const));
  const allowed = (good: Good) =>
    good !== 'hen' &&
    (strategy === 'grain'
      ? ['grain', 'wheat'].includes(good)
      : strategy === 'precious'
        ? !GOODS[good].life && GOODS[good].base >= 100
        : strategy === 'fresh'
          ? !!GOODS[good].life
          : true);
  const buy = (good: Good, wanted: number) => {
    const n = Math.min(
      Math.floor(wanted),
      Math.floor(maximumTrade(s, good, 'buy', transport())),
      Math.floor(Math.max(0, s.cash - 80) / quote(s, good).buy),
    );
    return (
      n > 0 &&
      act({
        type: 'trade',
        side: 'buy',
        good,
        quantity: n,
        transport: transport(),
      })
    );
  };
  const sell = (good: Good, wanted: number) => {
    const n = Math.min(
      Math.floor(Math.min(wanted, availableSurplus(s, good))),
      Math.floor(maximumTrade(s, good, 'sell', transport())),
    );
    return (
      n > 0 &&
      act({
        type: 'trade',
        side: 'sell',
        good,
        quantity: n,
        transport: transport(),
      })
    );
  };
  const lots = () => {
    for (const lot of publicOpportunities(s).lots) {
      if (!Object.keys(lot.goods).every((g) => allowed(g as Good))) continue;
      const perishable = Object.keys(lot.goods).some(
        (g) => GOODS[g as Good].life,
      );
      const cold = s.home.facilities.some(
        (f) => f.kind === 'coldStorage' && f.installed,
      );
      if (perishable && s.clock.minute % 1440 >= 1080 && !cold) continue;
      const value = Object.entries(lot.goods).reduce(
        (n, [g, q]) => n + GOODS[g as Good].base * 0.9 * q!,
        0,
      );
      if (value > lot.price * 1.12 && s.cash > lot.price + 120)
        act({ type: 'buyLot', lotId: lot.id, transport: transport() });
    }
  };
  for (let day = 1; day <= days && s.phase !== 'ended'; day++) {
    const start = s.clock.minute;
    if (
      s.housing.id === 'street' &&
      s.cash >= (strategy === 'production' || strategy === 'mixed' ? 600 : 1600)
    )
      act({ type: 'rentHousing', housing: 'room' });
    const producing = strategy === 'production' || strategy === 'mixed';
    if (
      !s.home.cart &&
      s.cash >= (producing ? 650 : 1400) &&
      (producing || (actionCounts.trade ?? 0) >= 5)
    )
      act({ type: 'buyCart' });
    if (
      strategy === 'fresh' &&
      s.housing.id !== 'street' &&
      s.cash > 1000 &&
      !s.home.facilities.some((f) => f.kind === 'coldStorage')
    )
      act({ type: 'installFacility', facility: 'coldStorage' });
    if (s.stamina < 55) act({ type: 'rest' });
    for (const g of GOOD_IDS) {
      if (g === 'hen') continue;
      const held = quantity(s, g);
      if (!held) continue;
      const unitCost = inventoryCost(s, g, held) / held;
      const urgent = s.batches.some(
        (b) =>
          b.good === g &&
          b.remainingMinutes !== null &&
          (b.remainingMinutes ?? Infinity) < 1440,
      );
      if (quote(s, g).sell >= unitCost * 1.04 || urgent || s.cash < 60)
        sell(g, held);
    }
    if (strategy !== 'production') {
      for (const request of publicOpportunities(s).requests) {
        if (!allowed(request.good)) continue;
        const n = request.remaining;
        if (request.price <= quote(s, request.good).buy * 1.02) continue;
        if (quantity(s, request.good) < n)
          buy(request.good, n - quantity(s, request.good));
        const q = Math.min(n, Math.floor(quantity(s, request.good)));
        if (q > 0) {
          const delivery = {
            type: 'supplyRequest',
            requestId: request.id,
            quantity: q,
            transport: transport(),
          } as const;
          while (
            actionPreview(s, delivery).energy > s.stamina &&
            s.clock.minute + 60 < request.deadline
          ) {
            if (!act({ type: 'rest' })) break;
          }
          act(delivery);
        }
      }
    }
    if (strategy === 'order' || strategy === 'mixed') {
      for (const o of s.commerce.orders.filter((o) => o.status === 'offered')) {
        const p = orderPreview(s, o);
        if (p.profit >= 25 && s.cash > p.purchaseCost + o.deposit + 100)
          act({ type: 'acceptOrder', orderId: o.id, confirm: orderTerms(o) });
      }
      for (const o of s.commerce.orders.filter(
        (o) => o.status === 'accepted',
      )) {
        for (const m of orderPreview(s, o).materials)
          if (m.missing) buy(m.good, m.missing);
        act({ type: 'deliverOrder', orderId: o.id, transport: transport() });
      }
    }
    if (strategy === 'production' || strategy === 'mixed') {
      if (s.skills.food === 0 && s.cash > 220)
        act({ type: 'learn', skill: 'food' });
      if (
        !s.equipment.some((e) => e.kind === 'stove' && e.installed) &&
        s.cash > 280
      )
        act({ type: 'install', equipment: 'stove' });
      const recipe = RECIPES.find((r) => r.id === 'bread')!;
      for (let round = 0; round < 3; round++) {
        if (s.stamina < 45) act({ type: 'rest' });
        const plan = productionPlan(s, recipe, 2);
        for (const [g, units] of Object.entries(plan.inputs))
          buy(
            g as Good,
            Math.max(0, units! / 10 + (late ? 8 : 0) - quantity(s, g as Good)),
          );
        const making = {
          type: 'produce',
          recipeId: 'bread',
          quantity: 2,
        } as const;
        if (actionPreview(s, making).energy > s.stamina) act({ type: 'rest' });
        if (!act(making)) break;
        sell('bread', quantity(s, 'bread'));
      }
    }
    if (strategy !== 'production' && strategy !== 'order') {
      lots();
      const choices = GOOD_IDS.filter(
        (g) =>
          strategy !== 'fresh' &&
          allowed(g) &&
          quote(s, g).buy < GOODS[g].base * 0.9,
      ).sort(
        (a, b) =>
          quote(s, a).buy / GOODS[a].base - quote(s, b).buy / GOODS[b].base,
      );
      if (choices[0])
        buy(
          choices[0],
          Math.floor(((s.cash - 120) * 0.3) / quote(s, choices[0]).buy),
        );
    }
    if (s.health < 65 && s.cash > 160) act({ type: 'treat', mode: 'fast' });
    if (late && s.life.ateCycle !== lifeCycle(s.clock.minute)) {
      if (quantity(s, 'bread') >= 1) act({ type: 'eat', meal: 'bread' });
      else act({ type: 'eat', meal: 'diner' });
    }
    if (strategy !== 'production' && strategy !== 'order') {
      const evening = Math.floor(start / 1440) * 1440 + 1080;
      if (s.clock.minute < evening)
        act({ type: 'wait', minutes: evening - s.clock.minute });
      lots();
    }
    const bedtime = Math.floor(start / 1440) * 1440 + (late ? 1680 : 1320);
    if (late) {
      const night = Math.floor(start / 1440) * 1440 + 1320;
      if (s.clock.minute < night)
        act({ type: 'wait', minutes: night - s.clock.minute });
      for (let round = 0; round < 2 && s.clock.minute + 14 < bedtime; round++) {
        const making = {
          type: 'produce',
          recipeId: 'bread',
          quantity: 2,
        } as const;
        while (
          s.stamina < actionPreview(s, making).energy &&
          s.clock.minute + 74 < bedtime
        ) {
          if (!act({ type: 'rest' })) break;
        }
        if (!act(making)) break;
      }
    }
    if (late) {
      if (s.clock.minute < bedtime)
        act({ type: 'wait', minutes: bedtime - s.clock.minute });
      act({
        type: 'sleep',
        minutes: 240,
        bed: s.housing.id === 'street' ? 'temple' : s.housing.id,
      });
    } else {
      act({
        type: 'closeDay',
        bed: s.housing.id === 'street' ? 'temple' : s.housing.id,
        meal: quantity(s, 'bread') >= 1 ? 'bread' : 'diner',
      });
    }
    const nextStart = Math.floor(start / 1440) * 1440 + 1920;
    if (s.clock.minute < nextStart)
      act({ type: 'wait', minutes: nextStart - s.clock.minute });
    assert(s.clock.minute > start, 'strategy must advance time');
    assert(s.cash >= 0 && s.health >= 0 && s.clock.sleepDebt <= 12);
    snapshots.push({
      day,
      cash: s.cash,
      assets: netAssets(),
      health: s.health,
      debt: s.clock.sleepDebt,
    });
    if (day % 25 === 0) assert.deepEqual(readSave(JSON.stringify(s)), s);
  }
  assert.equal(s.stats.workIncome, 0, 'no labor subsidy');
  return {
    seed,
    strategy,
    late,
    days: snapshots.length,
    survived: s.phase !== 'ended',
    growth: netAssets() - initial,
    cash: s.cash,
    health: s.health,
    debt: s.clock.sleepDebt,
    developmentDay,
    housingDay,
    cartDay,
    losses: {
      inventory: s.ledger.losses - cashTheft,
      cashTheft,
      deposits: s.ledger.depositLosses,
    },
    ledger: s.ledger,
    waitingMinutes: actionMinutes.wait ?? 0,
    actionMinutes,
    valuation: {
      housing: 'owned housing at 72% resale',
      equipmentAndFacilities: '60% resale',
      cart: 'no resale action; zero liquidation value',
    },
    tradeProfit: s.ledger.tradeRevenue - s.ledger.tradeCost,
    productionProfit: s.ledger.productionRevenue - s.ledger.productionCost,
    actions,
    actionCounts,
    dailyLifeActions:
      ['eat', 'rest', 'sleep', 'closeDay', 'feed', 'snack', 'treat'].reduce(
        (n, key) => n + (actionCounts[key] ?? 0),
        0,
      ) / snapshots.length,
    dailyWaitActions:
      ((actionCounts.wait ?? 0) + (actionCounts.waitUntil ?? 0)) /
      snapshots.length,
    openingRejections: Object.entries(rejected)
      .filter(([reason]) => /营业|收工|受理/.test(reason))
      .reduce((n, [, count]) => n + count, 0),
    rejected,
    snapshots,
  };
}
if (!isMainThread && workerData?.runner) {
  parentPort!.on(
    'message',
    (task: {
      seed: number;
      strategy: Strategy;
      days: number;
      late: boolean;
    }) => {
      try {
        parentPort!.postMessage({
          row: run(task.seed, task.strategy, task.days, task.late),
        });
      } catch (error) {
        parentPort!.postMessage({ error: String(error) });
      }
    },
  );
} else {
  const samples = Number(process.env.SIMULATION_SAMPLES ?? 30);
  const days = Number(process.env.SIMULATION_DAYS ?? 100);
  assert(
    Number.isInteger(samples) &&
      samples > 0 &&
      Number.isInteger(days) &&
      days > 0,
  );
  const tasks = [
    ...STRATEGIES.map((strategy) => ({ strategy, late: false })),
    { strategy: 'mixed' as const, late: true },
  ].flatMap((mode) =>
    Array.from({ length: samples }, (_, i) => ({
      ...mode,
      seed: (i + 1) * 7919,
      days,
    })),
  );
  const rows: ReturnType<typeof run>[] = [];
  let next = 0;
  const concurrency = Math.min(3, tasks.length);
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { runner: true },
      });
      try {
        while (next < tasks.length) {
          const index = next++;
          const task = tasks[index];
          const response = await new Promise<{
            row?: ReturnType<typeof run>;
            error?: string;
          }>((resolve, reject) => {
            const fail = (error: Error) => {
              worker.off('message', done);
              reject(error);
            };
            const done = (value: {
              row?: ReturnType<typeof run>;
              error?: string;
            }) => {
              worker.off('error', fail);
              resolve(value);
            };
            worker.once('error', fail);
            worker.once('message', done);
            worker.postMessage(task);
          });
          if (response.error || !response.row)
            throw Error(response.error ?? 'Missing worker result');
          rows[index] = response.row;
          console.log(
            `${task.strategy}${task.late ? '-late' : ''}: seed ${task.seed / 7919}/${samples}`,
          );
        }
      } finally {
        await worker.terminate();
      }
    }),
  );
  const summary = [...STRATEGIES, 'mixed-late'].map((name) => {
    const group = rows.filter(
      (r) => (r.late ? 'mixed-late' : r.strategy) === name,
    );
    return {
      strategy: name,
      survival: group.filter((r) => r.survived).length / samples,
      medianGrowth: median(group.map((r) => r.growth)),
      medianHealth: median(group.map((r) => r.health)),
      medianDebt: median(group.map((r) => r.debt)),
      developedBy30:
        group.filter((r) => r.developmentDay !== null && r.developmentDay <= 30)
          .length / samples,
    };
  });
  const traders = summary.filter((r) =>
    ['grain', 'precious', 'fresh', 'order'].includes(r.strategy),
  );
  const steady = summary
    .filter((r) => ['grain', 'precious', 'order'].includes(r.strategy))
    .sort((a, b) => b.medianGrowth - a.medianGrowth)[0];
  const producer = summary.find((r) => r.strategy === 'production')!;
  const bestTrade = Math.max(...traders.map((r) => r.medianGrowth));
  const gates = {
    completeSample: samples >= 30 && days >= 100,
    traderSurvival: traders.every((r) => r.survival >= 0.8),
    steadyGrowth: steady.medianGrowth > 0,
    housingAndCartBy30: steady.developedBy30 >= 0.5,
    tradeProductionBalance:
      bestTrade > 0 &&
      producer.medianGrowth > 0 &&
      Math.max(bestTrade, producer.medianGrowth) /
        Math.min(bestTrade, producer.medianGrowth) <=
        2,
    noLateDominance: rows
      .filter((r) => r.late)
      .every((late) => {
        const normal = rows.find(
          (r) => r.seed === late.seed && r.strategy === 'mixed' && !r.late,
        )!;
        return !(
          late.growth >= normal.growth &&
          late.health >= normal.health &&
          late.debt <= normal.debt &&
          (late.growth > normal.growth ||
            late.health > normal.health ||
            late.debt < normal.debt)
        );
      }),
  };
  mkdirSync('tests/browser-output/economy', { recursive: true });
  writeFileSync(
    process.env.SIMULATION_OUTPUT ??
      'tests/browser-output/economy/continuous.json',
    JSON.stringify(
      {
        strategyVersion: 10,
        samples,
        days,
        mode: gates.completeSample ? 'formal' : 'diagnostic',
        gates,
        summary,
        rows,
      },
      null,
      2,
    ),
  );
  console.table(summary);

  console.log('Acceptance gates', gates);
  if (gates.completeSample)
    assert(
      Object.values(gates).every(Boolean),
      'Economy acceptance failed; inspect saved results',
    );
}

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
} from '../lib/game/engine.ts';
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
  | 'mixed';
const strategies: Strategy[] = [
  'labor',
  'trade',
  'poultry',
  'food',
  'textile',
  'brewing',
  'mixed',
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
  const attempt = (a: Action) => {
    steps++;
    const r = dispatch(s, a);
    if (r.error) return false;
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
    if (s.phase === 'market') assert(attempt({ type: 'leave' }));
    resolve();
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
      assert(attempt({ type: 'return' }));
      break;
    }
    attempt({ type: 'rest' });
    attempt({ type: 'snack' });
    // Only today's visible prices, inventory costs and public configuration drive decisions.
    for (const g of GOOD_IDS) {
      if (g === 'hen') continue;
      const q = Math.floor(quantity(s, g));
      const produced = s.batches.some(
        (b) => b.good === g && b.origin === 'production',
      );
      const c = q ? inventoryCost(s, g, q) / q : 0;
      const expiry = s.batches.some(
        (b) => b.good === g && b.expires !== null && b.expires <= s.day + 1,
      );
      if (
        produced ||
        (strategy === 'trade' &&
          q > 0 &&
          (quote(s, g).sell > c * 1.08 || expiry))
      )
        sell(g, q);
    }
    leave();
    if (s.housing.id === 'street' && s.cash > HOUSING.room.cost + 120)
      attempt({ type: 'rentHousing', housing: 'room' });
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
            if (!best || profit > best.profit)
              best = { id: r.id, n, profit, inputs: p.inputs };
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
    if (strategy === 'trade') {
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
      if (choices[0]) {
        const g = choices[0];
        const q = Math.min(
          Math.floor((s.cash - 150) / quote(s, g).buy),
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
      assert(attempt({ type: 'return' }));
      break;
    }
    assert(attempt({ type: 'endDay' }));
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
    let ok = attempt({
      type: 'night',
      meal:
        quantity(s, 'bread') >= 1
          ? 'bread'
          : s.cash >=
              HOUSING[s.housing.id].upkeep + 18 + (bed === 'inn' ? 30 : 0)
            ? 'diner'
            : 'none',
      bed,
      feed,
    });
    if (!ok)
      ok = attempt({ type: 'night', meal: 'none', bed: 'temple', feed: 0 });
    assert(ok);
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
  };
}
const samples = Number(process.env.SIMULATION_SAMPLES ?? 100);
const days = Number(process.env.SIMULATION_DAYS ?? 180);
const rows = strategies.flatMap((strategy) =>
  Array.from({ length: samples }, (_, i) =>
    run((i + 1) * 7919, strategy, days),
  ),
);
const summary = strategies.map((strategy) => {
  const g = rows.filter((r) => r.strategy === strategy);
  return {
    strategy,
    runs: g.length,
    wins: g.filter((r) => r.ending === 'return').length,
    meanDay: +(g.reduce((a, r) => a + r.day, 0) / g.length).toFixed(1),
    meanCash: Math.round(g.reduce((a, r) => a + r.cash, 0) / g.length),
    meanProfit: Math.round(g.reduce((a, r) => a + r.profit, 0) / g.length),
    meanProduction: Math.round(
      g.reduce((a, r) => a + r.productionRuns, 0) / g.length,
    ),
  };
});
const stability = run(20260910, 'food', 1000, true);
const result = {
  notice: `七策略使用相同${samples}组种子，统一30000文目标，观察${days}日。策略不读隐藏日程、真相或随机数。`,
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

import { productionEarliest } from './production-time.ts';
import { formatMoment } from './time.ts';
import { statusActive, STATUS_DURATION } from './status.ts';
import { validContinuousSave } from './save-validation.ts';
import { timelineEvents } from './timeline.ts';
import {
  newOpportunities,
  generateOpportunities,
  lotWeight,
  tradeNet,
  updateTradeMilestones,
  TRADE_REWARDS,
} from './market-opportunities.ts';
import {
  FACILITIES,
  HOME_STORIES,
  HOME_EVENTS,
  hasFacility,
  usedHomeSlots,
} from './home.ts';
import { transportQuote, type Transport } from './time.ts';
import { actionTiming } from './action-time.ts';
import {
  OPENING_HOURS,
  nextDailyTime,
  formatClock,
  newClock,
  validClock,
  clockDay,
  lifeCycle,
  timeOfDay,
  canFinishAtVenue,
  projectTime,
  staminaCap,
  sleepEfficiency,
} from './time.ts';
import {
  BUFFS,
  EQUIPMENT,
  EQUIPMENT_IDS,
  GOODS,
  GOOD_IDS,
  HOUSING,
  LESSON_COST,
  RECIPE_MAP,
  RULES,
  SKILLS,
  SKILL_IDS,
  SKILL_LEVELS,
  XP_TO_LEVEL,
  WORLD_FAMILIES,
} from './config.ts';
import { EVENTS, INFO_TEMPLATES, out, option, decline } from './content.ts';
import { isOperatingAction, operationResult } from './feedback.ts';
import {
  newCommerce,
  generateOrders,
  updateMilestones,
  businessProfit,
  festivalOn,
  orderTerms,
  returnTerms,
  orderReserved,
  CUSTOMERS,
  CUSTOMER_DECLINES,
  CUSTOMER_IDS,
  customerStage,
  customerOpportunity,
  validCommerce,
  MILESTONES,
} from './commerce.ts';
import type {
  Action,
  Batch,
  Buff,
  Effect,
  EquipmentKind,
  EventInstance,
  GameState,
  Good,
  IntelEntry,
  ProductionJob,
  Recipe,
  OperationResult,
  Order,
  SkillId,
} from './types.ts';

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function random(s: GameState) {
  s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
function integer(s: GameState, a: number, b: number) {
  return a + Math.floor(random(s) * (b - a + 1));
}
export function pickWeighted<T extends { weight: number }>(
  s: GameState,
  list: T[],
): T {
  let n = random(s) * list.reduce((a, b) => a + b.weight, 0);
  for (const x of list) {
    n -= x.weight;
    if (n < 0) return x;
  }
  return list[list.length - 1];
}
export function staminaMax(s: GameState) {
  return staminaCap(s.health, s.clock.sleepDebt);
}
export function quantity(s: GameState, g: Good) {
  return g === 'hen'
    ? s.hens.length
    : s.batches.filter((b) => b.good === g).reduce((a, b) => a + b.units, 0) /
        10;
}
export function capacity(s: GameState) {
  return Math.floor(
    HOUSING[s.housing.id].capacity * (hasFacility(s, 'warehouse') ? 1.4 : 1),
  );
}
export function occupied(s: GameState) {
  return s.batches.reduce((a, b) => a + b.units, 0);
}
export function reserved(s: GameState) {
  return (
    occupied(s) +
    (s.pendingTrade?.units ?? 0) +
    s.jobs
      .filter((j) => j.status === 'queued')
      .reduce((a, j) => a + j.outputUnits, 0)
  );
}
export function active(s: GameState, b: Buff) {
  return statusActive(s, b);
}
export function installed(s: GameState, kind: EquipmentKind) {
  return s.equipment.find((e) => e.kind === kind && e.installed);
}
export function quote(s: GameState, g: Good) {
  const p = s.prices[g];
  return {
    buy:
      g === 'grain' && active(s, 'regular')
        ? Math.max(p.sell + 1, Math.round(p.buy * 0.95))
        : p.buy,
    sell: p.sell,
  };
}
export function assets(s: GameState) {
  return (
    s.cash +
    s.commerce.orders
      .filter((o) => o.status === 'accepted')
      .reduce((n, o) => n + o.deposit, 0) +
    GOOD_IDS.reduce(
      (a, g) => a + Math.floor(quantity(s, g) * quote(s, g).sell),
      0,
    )
  );
}
export function log(s: GameState, text: string, cash = 0, items = '') {
  s.logs.push({ id: s.nextId++, day: s.day, text, cash, items });
  if (s.logs.length > RULES.maxLogs)
    s.logs.splice(0, s.logs.length - RULES.maxLogs);
}
function money(s: GameState, amount: number, text: string) {
  const value = amount === 0 ? 0 : Math.round(amount);
  if (value < 0 && s.cash < -value) throw Error('现金不足');
  s.cash += value;
  log(s, text, value);
}
function add(
  s: GameState,
  g: Good,
  units: number,
  cost = 0,
  origin: Batch['origin'] = 'gift',
  _born = s.day,
) {
  const room = Math.max(0, capacity(s) - reserved(s));
  const accepted = Math.min(
    units,
    g === 'grain' ? room : Math.floor(room / 10) * 10,
  );
  if (accepted > 0)
    s.batches.push({
      id: s.nextId++,
      good: g,
      units: accepted,
      cost: units ? Math.round((cost * accepted) / units) : 0,
      origin,
      remainingMinutes: GOODS[g].life ? GOODS[g].life! * 1440 : null,
    });
  if (accepted < units)
    log(
      s,
      '仓储装不下，多余货物损耗。',
      0,
      `${GOODS[g].name}损耗 ${accepted < units ? (units - accepted) / 10 : 0}`,
    );
  return accepted;
}
function consume(s: GameState, g: Good, units: number) {
  let left = units,
    cost = 0,
    production = 0,
    productionCost = 0;
  s.batches.sort(
    (a, b) =>
      (a.remainingMinutes ?? Infinity) - (b.remainingMinutes ?? Infinity) ||
      a.id - b.id,
  );
  for (const b of s.batches) {
    if (
      b.good !== g ||
      !left ||
      (b.remainingMinutes != null && b.remainingMinutes <= 0)
    )
      continue;
    const take = Math.min(left, b.units);
    const c = take === b.units ? b.cost : Math.floor((b.cost * take) / b.units);
    b.units -= take;
    b.cost -= c;
    left -= take;
    cost += c;
    if (b.origin === 'production') {
      production += take;
      productionCost += c;
    }
  }
  if (left) throw Error('货物不足');
  s.batches = s.batches.filter((b) => b.units > 0);
  return { cost, production, productionCost };
}
function makeWorlds(s: GameState) {
  for (
    let expected = Math.max(s.day + 2, ...s.worlds.map((w) => w.expected + 4));
    expected <= s.day + 120;
    expected += 4
  ) {
    const f = WORLD_FAMILIES[integer(s, 0, WORLD_FAMILIES.length - 1)];
    const roll = random(s);
    const truth =
      roll < 0.52
        ? 'normal'
        : roll < 0.7
          ? 'delay'
          : roll < 0.86
            ? 'small'
            : 'false';
    const start = expected + (truth === 'delay' ? integer(s, 1, 3) : 0);
    s.worlds.push({
      id: s.nextId++,
      family: f.id,
      name: f.name,
      good: f.good,
      expected,
      start,
      duration: integer(s, 2, 5),
      factor:
        truth === 'false'
          ? 1
          : 1 +
            (f.factor - 1) * (truth === 'small' ? 0.25 : 0.8 + random(s) * 0.4),
      truth,
      publicText: f.publicText,
      heard: false,
      clueKnown: false,
      source: ['船工', '行商', '市场伙计'][integer(s, 0, 2)],
      clue:
        truth === 'normal'
          ? '有人见过相关货单，但规模还不清楚。'
          : truth === 'delay'
            ? '有关的人说正在安排，日期没有定稳。'
            : truth === 'small'
              ? '有人见过零星货物，数量没有传得那么多。'
              : '追问具体出处，几个人的说法对不上。',
    });
  }
}
export function updatePrices(s: GameState) {
  makeWorlds(s);
  s.worlds = s.worlds.filter((w) => w.start + w.duration >= s.day - 30);
  if (s.day >= s.trendUntil) {
    for (const g of GOOD_IDS) s.trend[g] = 0.82 + random(s) * 0.36;
    s.trendUntil = s.day + integer(s, 3, 6);
  }
  for (const g of GOOD_IDS) {
    let factor = festivalOn(s.day)?.goods.includes(g) ? 1.1 : 1;
    for (const w of s.worlds)
      if (
        (w.good === g || GOODS[w.good].category === GOODS[g].category) &&
        w.truth !== 'false' &&
        s.day >= w.start &&
        s.day < w.start + w.duration
      )
        factor *= w.good === g ? w.factor : 1 + (w.factor - 1) * 0.35;
    const base = GOODS[g].base;
    const buy = clamp(
      Math.round(base * s.trend[g] * (0.92 + random(s) * 0.16) * factor),
      Math.ceil(base * 0.5),
      base * 2,
    );
    s.prices[g] = {
      buy,
      sell: Math.max(1, Math.min(buy - 1, Math.floor(buy * 0.85))),
    };
  }
  s.history.push({ day: s.day, prices: structuredClone(s.prices) });
  s.history = s.history.slice(-14);
}

function emptySkills(): Record<SkillId, number> {
  return { husbandry: 0, food: 0, textile: 0, brewing: 0 };
}
function emptyLedger() {
  return {
    depositsPaid: 0,
    depositsReturned: 0,
    depositLosses: 0,
    purchases: 0,
    returns: 0,
    losses: 0,
    feedPending: 0,
    sinceDay: 1,
    tradeRevenue: 0,
    tradeCost: 0,
    productionRevenue: 0,
    productionCost: 0,
    tuition: 0,
    equipment: 0,
    housing: 0,
    living: 0,
    feed: 0,
    social: 0,
    medical: 0,
    workIncome: 0,
  };
}
export function newGame(seed: number, target: 3000 | 30000 = 3000): GameState {
  const s: GameState = {
    marketOffers: newOpportunities(),
    commerce: newCommerce({ seed, day: 1, ledger: emptyLedger() }),
    home: {
      cart: false,
      events: {},
      visits: {},
      facilities: [],
      coldPriority: ['bread', 'egg', 'saltedEgg'],
    },
    clock: newClock(),
    life: {
      ateCycle: -1,
      fed: [],
      autoFeed: false,
      lastDawn: 360,
      wakeSummary: null,
    },
    saveRevision: 3,
    operationHistory: [],
    version: 3,
    rules: RULES.version,
    seed: seed >>> 0,
    rng: seed >>> 0,
    revision: 0,
    nextId: 1,
    day: 1,
    phase: 'day',
    target,
    cash: 800,
    health: 100,
    stamina: 80,
    reputation: 0,
    weather: '晴',
    batches: [],
    hens: [],
    buffs: { outsider: 480 + STATUS_DURATION.outsider },
    prices: {} as GameState['prices'],
    history: [],
    trend: {} as GameState['trend'],
    trendUntil: 3,
    worlds: [],
    event: null,
    teaDay: 0,
    encounterDay: 0,
    followups: [],
    relations: {},
    seen: [],
    cooldowns: {},
    familyCounts: {},
    intel: [],
    intelSeen: {},
    skills: emptySkills(),
    skillXp: emptySkills(),
    equipment: [],
    jobs: [],
    housing: { id: 'street', paidThrough: null, maintenanceSuspended: false },
    daily: {
      work: 0,
      lessons: 0,
      treatment: 0,
      rest: 0,
      snack: 0,
      tradeUnits: 0,
    },
    ledger: emptyLedger(),
    logs: [],
    story:
      '你在东京城外醒来。手表只留下一条清楚的提示：攒够目标现金，就能打开归航的门。兜里的八百文轻轻碰响，远处有人叫卖刚出炉的炊饼。',
    ending: null,
    deathCause: '',
    beforeReturn: 0,
    stats: {
      trades: 0,
      profit: 0,
      maxProfit: 0,
      eggs: 0,
      eggRevenue: 0,
      feedCost: 0,
      productionCostSold: 0,
      workIncome: 0,
      helped: 0,
      events: 0,
      peakAssets: 800,
      survivedLow: false,
      lowDay: 0,
      maxHens: 0,
      productionRuns: 0,
      lessons: 0,
      days: 1,
    },
  };
  for (const g of GOOD_IDS) {
    s.prices[g] = { buy: GOODS[g].base, sell: GOODS[g].firstSell };
    s.trend[g] = 1;
  }
  add(s, 'bread', 20);
  add(s, 'grain', 20);
  add(s, 'wheat', 20);
  add(s, 'salt', 10);
  add(s, 'firewood', 10);
  makeWorlds(s);
  s.history.push({ day: 1, prices: structuredClone(s.prices) });
  generateOpportunities(s);
  log(s, '你带着800文、两个炊饼、两份粟米和少量原料来到汴梁。');
  return s;
}

function followupEvent(
  s: GameState,
  f: GameState['followups'][number],
): EventInstance {
  const isWidow = f.chain === 'widow';
  return {
    id: s.nextId++,
    family: 'followup',
    variant: f.branch,
    person: f.person,
    title: isWidow ? '故人捎来口信' : '码头又见',
    text: `${f.person}认出了你，提起第${f.source}日你帮忙的事。${f.branch === 'gift' ? '这回带来了一点心意。' : '这回有个机会，问你是否愿意。'}`,
    clue: '是你先前认识的人，你认得对方。',
    hiddenFact: f.branch,
    inspection: '你们核对了旧事，对方确实是那个人。',
    inspected: false,
    choices:
      f.branch === 'gift'
        ? [
            option('accept', '收下心意', '没有额外成本。', {}, [
              out(
                1,
                `${f.person}递给你一点回礼，认真说了声谢谢。`,
                isWidow ? { good: 'egg', units: 20 } : { cash: 25 },
              ),
            ]),
            decline,
          ]
        : [
            option(
              'accept',
              isWidow ? '接受引荐' : '帮忙搬货',
              isWidow
                ? '没有额外成本；介绍认识粮商。'
                : '消耗20体力；约定报酬40文。',
              isWidow ? {} : { stamina: 20 },
              [
                out(
                  1,
                  isWidow
                    ? '粮商听了经过，愿意给你五日熟客价。'
                    : '阿成照约定付了40文。',
                  isWidow ? { buff: 'regular' } : { cash: 40 },
                ),
              ],
            ),
            decline,
          ],
  };
}
const repeatable = new Set(['work', 'meal', 'shelter', 'doctor']);
export function maybeEncounter(s: GameState, force = false) {
  if (
    s.event ||
    s.encounterDay === clockDay(s.life.lastDawn) ||
    clockDay(s.life.lastDawn) === 1
  )
    return;
  const due = s.followups.find(
    (f) => f.dueAt <= s.clock.minute && s.relations[f.chain] === f.source,
  );
  if (due) {
    s.followups = s.followups.filter((f) => f !== due);
    s.event = followupEvent(s, due);
  } else {
    if (!force && random(s) > 0.42) return;
    const eligible = EVENTS.filter(
      (f) =>
        (s.cooldowns[f.id] ?? 0) <= s.clock.minute &&
        (repeatable.has(f.id) ||
          f.variants.some((v) => !s.seen.includes(`${f.id}:${v.id}`))),
    );
    if (!eligible.length) return;
    const family = pickWeighted(
      s,
      eligible.map((f) => ({
        weight: 1 / (1 + (s.familyCounts[f.id] ?? 0)),
        f,
      })),
    ).f;
    const variants = family.variants.filter(
      (v) =>
        repeatable.has(family.id) || !s.seen.includes(`${family.id}:${v.id}`),
    );
    const v = variants[integer(s, 0, variants.length - 1)];
    s.event = {
      id: s.nextId++,
      family: family.id,
      variant: v.id,
      person: v.person,
      title: family.title,
      text: v.texts[integer(s, 0, 1)],
      clue: v.clue,
      hiddenFact: v.fact,
      inspection: v.inspection,
      inspected: false,
      choices: structuredClone(v.choices),
    };
    if (!s.seen.includes(`${family.id}:${v.id}`))
      s.seen.push(`${family.id}:${v.id}`);
    s.cooldowns[family.id] = s.clock.minute + 7 * 1440;
    s.familyCounts[family.id] = (s.familyCounts[family.id] ?? 0) + 1;
  }
  s.encounterDay = clockDay(s.life.lastDawn);
  s.stats.events++;
  log(s, `街巷偶遇：${s.event.title}。`);
}
function effect(s: GameState, e: Effect, person: string, acquisitionCost = 0) {
  if (e.cash) money(s, e.cash, '遭遇收支');
  if (e.good && e.units) {
    add(s, e.good, e.units, acquisitionCost, acquisitionCost ? 'buy' : 'gift');
    log(s, '遭遇带来货物变化。', 0, `${GOODS[e.good].name} +${e.units / 10}`);
  }
  s.health = clamp(s.health + (e.health ?? 0), 0, 100);
  s.stamina = clamp(s.stamina + (e.stamina ?? 0), 0, staminaMax(s));
  s.reputation += e.reputation ?? 0;
  if (e.buff) {
    s.buffs[e.buff] = s.clock.minute + STATUS_DURATION[e.buff];
    log(s, `获得「${BUFFS[e.buff].name}」：${BUFFS[e.buff].detail}`);
  }
  if (e.help) s.stats.helped++;
  if (
    e.chain &&
    s.followups.length < 2 &&
    !s.followups.some((f) => f.chain === e.chain)
  ) {
    s.relations[e.chain] = s.clock.minute;
    s.followups.push({
      chain: e.chain,
      person,
      dueAt: s.clock.minute + integer(s, 2, 7) * 1440,
      branch: pickWeighted(s, [
        { weight: 4, b: 'gift' },
        { weight: 3, b: 'work' },
        { weight: 2, b: 'request' },
      ]).b as 'gift' | 'work' | 'request',
      source: s.clock.minute,
    });
  }
}
function requireDay(s: GameState) {
  if (s.phase !== 'day' || s.event)
    throw Error('请先结束当前安排或处理眼前的遭遇');
}
function finishAction(s: GameState, encounter = true) {
  if (encounter) maybeEncounter(s);
}
export function tradeStamina(
  s: GameState,
  g: Good,
  q: number,
  transport: Transport = 'self',
) {
  return transportQuote(q * (g === 'hen' ? 2 : 1), transport).stamina;
}
export function henCapacity(s: GameState) {
  return installed(s, 'coop') ? HOUSING[s.housing.id].henCapacity : 3;
}
export function productionPlan(s: GameState, r: Recipe, n: number) {
  const mult = productionMultiplier(s, r);
  const inputs = Object.fromEntries(
    Object.entries(r.inputs).map(([g, u]) => [
      g,
      g === 'grain'
        ? Math.ceil(u * n * mult)
        : Math.ceil((u * n * mult) / 10) * 10,
    ]),
  ) as Partial<Record<Good, number>>;
  const outputUnits =
    Math.floor(
      (r.outputUnits * n * (s.skills[r.industry] >= 3 ? 1.2 : 1)) / 10,
    ) * 10;
  const energy =
    Math.ceil(r.stamina * n * (s.skills[r.industry] >= 2 ? 0.85 : 1)) +
    (active(s, 'tired') ? 5 : 0);
  return { inputs, outputUnits, energy };
}
export function inventoryCost(s: GameState, good: Good, q = quantity(s, good)) {
  if (good === 'hen') return s.hens.slice(0, q).reduce((v, h) => v + h.cost, 0);
  const copy = structuredClone(s);
  return q > 0 && q <= quantity(s, good)
    ? consume(copy, good, Math.round(q * 10)).cost
    : 0;
}

export function recipeQuote(s: GameState, recipeId: string, n: number) {
  const recipe = RECIPE_MAP[recipeId];
  if (!recipe || !Number.isInteger(n) || n < 1 || n > 20)
    throw Error('请选择有效配方与1～20批加工量');
  const plan = productionPlan(s, recipe, n);
  const materials = Object.entries(plan.inputs).map(([id, units]) => {
    const good = id as Good;
    const needed = units! / 10;
    const owned = quantity(s, good);
    const used = Math.min(owned, needed);
    const missing = Math.round((needed - used) * 10) / 10;
    return {
      good,
      needed,
      owned,
      missing,
      stockCost: inventoryCost(s, good, used),
      refillCost: Math.ceil(quote(s, good).buy * missing),
      replacementCost: Math.ceil(quote(s, good).buy * needed),
    };
  });
  const totalMissing = materials.reduce((n, m) => n + m.missing, 0);
  const carrying =
    Math.ceil(s.daily.tradeUnits + totalMissing - 1e-9) -
    Math.ceil(s.daily.tradeUnits - 1e-9);
  const refillCost = materials.reduce((n, m) => n + m.refillCost, 0);
  const stockCost = materials.reduce((n, m) => n + m.stockCost, 0);
  const revenue = Math.floor(
    (quote(s, recipe.output).sell * plan.outputUnits) / 10,
  );
  return {
    ...plan,
    materials,
    carrying,
    refillCost,
    revenue,
    stockProfit: totalMissing ? null : revenue - stockCost,
    refillProfit: revenue - stockCost - refillCost,
    replacementProfit:
      revenue - materials.reduce((n, m) => n + m.replacementCost, 0),
  };
}

export function maximumTrade(
  s: GameState,
  good: Good,
  side: 'buy' | 'sell',
  transport: Transport = 'self',
) {
  const scale = good === 'grain' ? 10 : 1;
  let lo = 0,
    hi =
      side === 'sell'
        ? Math.floor(quantity(s, good) * scale)
        : Math.min(
            100000 * scale,
            Math.floor((s.cash / quote(s, good).buy) * scale),
          );
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const r = dispatch(s, {
      type: 'trade',
      side,
      good,
      quantity: mid / scale,
      transport,
    });
    if (r.error) hi = mid - 1;
    else lo = mid;
  }
  return lo / scale;
}

export function maximumProduction(s: GameState, recipeId: string) {
  for (let n = 20; n >= 1; n--)
    if (!dispatch(s, { type: 'produce', recipeId, quantity: n }).error)
      return n;
  return 0;
}

export function reservedFood(s: GameState, good: Good) {
  const meal = quantity(s, 'bread') >= 1 ? 'bread' : 'diner';
  return (
    (s.life.ateCycle !== lifeCycle(s.clock.minute) && meal === good ? 1 : 0) +
    (good === 'grain'
      ? (s.hens.filter((h) => !s.life.fed.includes(h.id)).length *
          (s.skills.husbandry >= 3 ? 1 : RULES.feed)) /
        10
      : 0)
  );
}

export function availableSurplus(s: GameState, good: Good) {
  const scale = good === 'grain' ? 10 : 1;
  return (
    Math.floor(
      Math.max(
        0,
        quantity(s, good) - reservedFood(s, good) - orderReserved(s, good),
      ) * scale,
    ) / scale
  );
}
export function actionEnergy(s: GameState, a: Action) {
  try {
    return rawActionEnergy(s, a);
  } catch {
    return 0;
  }
}
function rawActionEnergy(s: GameState, a: Action) {
  if (a.type === 'buyLot') {
    const lot = s.marketOffers.lots.find((l) => l.id === a.lotId);
    return lot
      ? transportQuote(lotWeight(lot), a.transport ?? 'self').stamina
      : 0;
  }
  if (a.type === 'supplyRequest')
    return transportQuote(a.quantity, a.transport ?? 'self').stamina;
  if (a.type === 'deliverOrder') {
    const order = s.commerce.orders.find((o) => o.id === a.orderId);
    return order
      ? transportQuote(
          Object.entries(order.goods).reduce(
            (n, [g, q]) => n + q! * (g === 'hen' ? 2 : 1),
            0,
          ),
          a.transport ?? 'self',
        ).stamina
      : 0;
  }
  if (a.type === 'meetCustomer' || a.type === 'visitCustomer') return 5;
  if (a.type === 'refill') {
    try {
      return recipeQuote(s, a.recipeId, a.quantity).carrying;
    } catch {
      return 0;
    }
  }
  if (a.type === 'trade')
    return tradeStamina(s, a.good, a.quantity, a.transport ?? 'self');
  if (a.type === 'produce')
    return RECIPE_MAP[a.recipeId]
      ? productionPlan(s, RECIPE_MAP[a.recipeId], a.quantity).energy
      : 0;
  if (a.type === 'learn') return RULES.lessonStamina;
  if (a.type === 'short' || a.type === 'heavy')
    return (
      (a.type === 'short' ? RULES.shortEnergy : RULES.heavyEnergy) +
      (active(s, 'tired') ? 5 : 0)
    );
  if (a.type === 'askIntel' || a.type === 'visitIntel') return 5;
  if (a.type === 'choice') {
    const c = s.event?.choices.find((c) => c.id === a.id);
    return c?.cost.stamina ?? 0;
  }
  return 0;
}
export function actionPreview(s: GameState, a: Action) {
  let duration = 0;
  let venue: import('./time.ts').Venue = 'home';
  try {
    const timing = actionTiming(s, a);
    duration = timing.minutes;
    venue = timing.venue;
  } catch {
    /* Dispatch reports unavailable legacy actions. */
  }
  let multiplier = 1;
  try {
    multiplier = projectTime(
      s.clock,
      duration,
      a.type === 'sleep' ? { sleeping: true } : {},
    ).averageExertion;
  } catch {
    /* Dispatch validates durations. */
  }
  const energy = actionEnergy(s, a) * multiplier;
  const order =
    a.type === 'acceptOrder'
      ? s.commerce.orders.find((o) => o.id === a.orderId)
      : undefined;
  const risky = order?.highRisk && order.status === 'offered';
  const abandoned =
    a.type === 'abandonOrder'
      ? s.commerce.orders.find(
          (o) => o.id === a.orderId && o.status === 'accepted',
        )
      : undefined;
  const returning = a.type === 'return' && !!returnTerms(s);
  const result = dispatch(
    s,
    risky
      ? ({ ...a, confirm: orderTerms(order) } as Action)
      : returning
        ? ({ ...a, confirm: returnTerms(s) } as Action)
        : a,
  );
  const finishAt = s.clock.minute + duration;
  const crossesDawn = nextDailyTime(s.clock.minute, 360) <= finishAt;
  const uncertainOutcome = a.type === 'choice';
  const theftRisk =
    a.type === 'sleep' &&
    (a.bed === 'street' ||
      a.bed === 'temple' ||
      (a.bed !== 'inn' &&
        (s.housing.maintenanceSuspended ||
          (crossesDawn && s.cash < HOUSING[s.housing.id].upkeep))));
  const deadlineRisks = s.commerce.orders.filter(
    (o) =>
      o.status === 'accepted' &&
      o.deadlineAt >= s.clock.minute &&
      o.deadlineAt <= finishAt &&
      !(a.type === 'deliverOrder' && a.orderId === o.id),
  );
  const spoilage = result.state.logs.filter(
    (l) => l.id >= s.nextId && l.text.endsWith('已经腐坏。'),
  );
  const opening = venue === 'home' ? null : OPENING_HOURS[venue];
  const opensNext =
    opening && !canFinishAtVenue(s.clock.minute, duration, venue)
      ? nextDailyTime(s.clock.minute, opening[0])
      : null;
  return {
    error: result.error,
    startsAt: s.clock.minute,
    openingHours: opening,
    nextOpeningAt: opensNext,
    minutes: duration,
    finishAt,
    healthChange: uncertainOutcome ? null : result.state.health - s.health,
    staminaChange: uncertainOutcome ? null : result.state.stamina - s.stamina,
    cashChange:
      uncertainOutcome || theftRisk ? null : result.state.cash - s.cash,
    energy,
    confirmation: !!risky || returning,
    warning: [
      opensNext
        ? `下次可办理：${formatMoment(opensNext)}；营业${formatClock(opening![0])}—${opening![1] === 1440 ? '24:00' : formatClock(opening![1])}。`
        : '',
      crossesDawn && HOUSING[s.housing.id].upkeep > 0
        ? `期间经过06:00住房账单：${HOUSING[s.housing.id].upkeep}文；不足时租房退租、产权房暂停维护。`
        : '',
      ...deadlineRisks.map(
        (o) =>
          `期间订单「${o.title}」于${formatMoment(o.deadlineAt)}截止，请先交货。`,
      ),
      ...spoilage.map((l) => `${l.text}${l.items ?? ''}`),
      uncertainOutcome
        ? '回应结果尚未确定；按已知线索判断，不预先显示随机报酬。'
        : '',
      theftRisk ? '此住宿有失窃风险，现金变化无法预先确定。' : '',
      a.type !== 'sleep' && duration > 0 && multiplier > 1
        ? `困倦使本次行动体力成本增至${multiplier.toFixed(2)}倍。`
        : '',
      energy > 0 && s.stamina >= 10 && s.stamina - energy < 10
        ? '这次操作后体力将低于10，可安排休息或睡眠。'
        : '',
      a.type === 'trade' &&
      a.side === 'sell' &&
      a.quantity > availableSurplus(s, a.good)
        ? '此次出售将动用口粮、饲料或订单备货，请及时补齐。'
        : '',
      risky
        ? `接单冻结保证金${order.deposit}文；逾期或放弃全额没收，客户关系−2。${formatMoment(order.deadlineAt)}截止。`
        : '',
      abandoned
        ? `放弃「${abandoned.title}」将没收已冻结保证金${abandoned.deposit}文，客户关系−${abandoned.highRisk ? 2 : 1}；已经投入的货物保留。`
        : '',
      returning
        ? `归航前将放弃全部在途订单，损失保证金${s.commerce.orders.filter((o) => o.status === 'accepted').reduce((n, o) => n + o.deposit, 0)}文，并降低客户关系。`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function productionMultiplier(s: GameState, r: Recipe) {
  const level = s.skills[r.industry];
  return level >= 3 ? 0.8 : level >= 2 ? 0.9 : 1;
}
function gainXp(s: GameState, skill: SkillId, n: number) {
  s.skillXp[skill] += n;
  const next = Math.min(3, s.skills[skill] + 1);
  if (s.skills[skill] < 3 && s.skillXp[skill] >= XP_TO_LEVEL[next])
    log(s, `${SKILLS[skill].name}的手艺熟练了一些，再拜师可进阶。`);
}
export function orderPreview(s: GameState, order: Order) {
  const materials = Object.entries(order.goods).map(([id, required]) => {
    const good = id as Good;
    const owned = s.batches
      .filter(
        (b) =>
          b.good === good &&
          (b.remainingMinutes == null || b.remainingMinutes > 0),
      )
      .reduce((n, b) => n + b.units / 10, 0);
    const missing = Math.max(0, required! - owned);
    return {
      good,
      required: required!,
      owned,
      missing,
      buyCost: Math.ceil(missing * quote(s, good).buy),
      stockCost: inventoryCost(s, good, Math.min(owned, required!)),
      earliest: missing ? productionEarliest(s, good, missing) : s.clock.minute,
    };
  });
  const purchaseCost = materials.reduce((n, m) => n + m.buyCost, 0);
  const stockCost = materials.reduce((n, m) => n + m.stockCost, 0);
  return {
    materials,
    purchaseCost,
    profit: order.price - purchaseCost - stockCost,
    carrying: actionEnergy(s, { type: 'deliverOrder', orderId: order.id }),
    deliverable:
      order.status === 'accepted' &&
      order.deadlineAt >= s.clock.minute &&
      materials.every((m) => m.missing === 0),
    risk:
      s.cash < purchaseCost + (order.status === 'offered' ? order.deposit : 0)
        ? '现金不足以补齐全部缺货与保证金'
        : materials.some(
              (m) =>
                m.missing &&
                (m.earliest === null || m.earliest > order.deadlineAt),
            )
          ? '部分缺货无法按当前设备及时自产，可考虑采购'
          : '自产时间为原料、体力与仓位齐备时的理论下限，另需搬运交付；采购价与生产安排可能变化',
  };
}
function failOrder(s: GameState, order: Order) {
  if (order.status !== 'accepted') return;
  order.status = 'failed';
  order.settledDay = s.day;
  s.ledger.depositLosses += order.deposit;
  s.commerce.failed++;
  s.commerce.relations[order.customer] = Math.max(
    -5,
    s.commerce.relations[order.customer] - (order.highRisk ? 2 : 1),
  );
  const customer = s.commerce.customers[order.customer] ?? {
    met: true,
    visited: 0,
    lastOutcome: null,
  };
  customer.lastOutcome = 'failed';
  s.commerce.customers[order.customer] = customer;
  log(
    s,
    `订单「${order.title}」未履约，没收已冻结保证金${order.deposit}文，客户关系下降。${CUSTOMERS[order.customer].failure}`,
  );
}
function deliverOrder(
  s: GameState,
  order: Order,
  transport: Transport = 'self',
) {
  const preview = {
    ...orderPreview(s, order),
    carrying: actionEnergy(s, {
      type: 'deliverOrder',
      orderId: order.id,
      transport,
    }),
  };
  const freight = transportQuote(
    Object.entries(order.goods).reduce(
      (n, [g, q]) => n + q! * (g === 'hen' ? 2 : 1),
      0,
    ),
    transport,
  ).fee;
  if (freight) {
    money(s, -freight, '交货搬运费');
    s.ledger.tradeCost += freight;
    s.stats.profit -= freight;
  }
  if (order.status !== 'accepted') throw Error('订单尚未接取或已结算');
  if (s.clock.minute > order.deadlineAt) throw Error('订单已超过交期');
  const missing = preview.materials.filter((m) => m.missing > 0);
  if (missing.length)
    throw Error(
      `尚缺${missing.map((m) => `${GOODS[m.good].name}${m.missing}`).join('、')}`,
    );
  if (s.stamina < preview.carrying)
    throw Error(`交货搬运需要${preview.carrying}体力`);
  for (const [id, q] of Object.entries(order.goods)) {
    const good = id as Good,
      units = q! * 10;
    const taken = consume(s, good, units);
    const income = order.prices[good]! * q!;
    const productionIncome = Math.floor((income * taken.production) / units);
    s.ledger.productionRevenue += productionIncome;
    s.ledger.productionCost += taken.productionCost;
    s.stats.productionCostSold += taken.productionCost;
    s.ledger.tradeRevenue += income - productionIncome;
    s.ledger.tradeCost += taken.cost - taken.productionCost;
    s.stats.profit +=
      income - productionIncome - (taken.cost - taken.productionCost);
  }
  money(s, order.price, `交付订单「${order.title}」`);
  if (order.deposit) money(s, order.deposit, '返还履约保证金');
  s.ledger.depositsReturned += order.deposit;
  s.stamina -= preview.carrying;
  s.daily.tradeUnits += Object.values(order.goods).reduce((n, q) => n + q!, 0);
  order.status = 'delivered';
  order.settledDay = s.day;
  s.commerce.completed++;
  s.commerce.relations[order.customer] = Math.min(
    10,
    s.commerce.relations[order.customer] + (order.highRisk ? 2 : 1),
  );
  const customer = s.commerce.customers[order.customer] ?? {
    met: true,
    visited: 0,
    lastOutcome: null,
  };
  customer.met = true;
  customer.lastOutcome = 'delivered';
  s.commerce.customers[order.customer] = customer;
  s.story = `「${order.title}」如约交齐，收到货款${order.price}文${order.deposit ? `并取回保证金${order.deposit}文` : ''}。`;
}
function addIntel(
  s: GameState,
  t: (typeof INFO_TEMPLATES)[number],
  world?: GameState['worlds'][number],
) {
  const semantic = t.semantic;
  s.intelSeen[semantic] = s.clock.minute + 20 * 1440;
  s.intelSeen[`skeleton:${t.skeleton}`] = s.clock.minute + 7 * 1440;
  const due = s.day + integer(s, 2, 6);
  const happens = random(s) < 0.72;
  const entry: IntelEntry = {
    reportVersion: 2,
    ...(!world
      ? {
          resolution: {
            due,
            happens,
            text: happens
              ? t.resolved!
              : `${t.source}摇头说：“${t.title}”没能按约落定，经手人还没有给准信；先前的说法暂时落了空。`,
            clue: happens
              ? t.clue!
              : `${t.source}也只是听人转述，问到经手人的姓名，前后说法有些出入。`,
          },
        }
      : {}),
    id: `${t.id}-${s.day}-${s.nextId}`,
    templateId: t.id,
    title: world ? world.name : t.title,
    category: world ? GOODS[world.good].category : t.category,
    source: world?.source ?? t.source,
    semantic,
    text: world
      ? `${world.source}说：“${WORLD_FAMILIES.find((f) => f.id === world.family)?.rumor ?? world.name} 预计第${world.expected}日前后有消息，先别把传闻当成定局。”`
      : t.variants[integer(s, 0, 2)],
    heardDay: s.day,
    usefulUntil: world ? world.expected + 4 : due,
    status: 'new',
    ...(world
      ? { worldId: world.id, good: world.good }
      : t.good
        ? { good: t.good }
        : {}),
  };
  if (world) {
    world.heard = true;
  }
  s.intel.unshift(entry);
  s.intel = s.intel.slice(0, RULES.maxIntel);
}
function refreshIntelStatuses(s: GameState) {
  for (const i of s.intel) {
    if (i.status !== 'new' || !i.visited) continue;
    if (i.worldId) {
      const w = s.worlds.find((x) => x.id === i.worldId);
      if (w && s.day >= w.start && w.truth !== 'false') i.status = 'confirmed';
      else if (w && s.day > w.expected + 3) i.status = 'wrong';
    } else if (i.resolution && s.day >= i.resolution.due)
      i.status = i.resolution.happens ? 'confirmed' : 'wrong';
    else if (s.day > i.usefulUntil) i.status = 'expired';
  }
}

export function operationResponse(
  before: GameState,
  after: GameState,
  action: Action,
) {
  const names: Record<string, string> = {
    market: '进入市场',
    leave: '离开市场',
    tea: '打听情报',
    short: '完成短工',
    heavy: '完成重活',
    rest: '休息',
    snack: '加餐',
    treat: '治疗',
    learn: '学习',
    install: '安装设备',
    uninstall: '封存设备',
    produce: '开工',
    trade: action.type === 'trade' && action.side === 'buy' ? '买入' : '卖出',
    askIntel: '追问',
    visitIntel: '回访',
    choice: '回应遭遇',
    inspect: '查问遭遇',
    return: '归航',
    sellHousing: '出售产权',
    sellEquipment: '出售设备',
    endLease: '退租',
    maintain: '补缴维护',
    buyHousing: '购买住宅',
    rentHousing: '租住房屋',
    cancelProduction: '放弃生产',
  };
  const changes = [
    ['现金', after.cash - before.cash, '文'],
    ['健康', after.health - before.health, ''],
    ['体力', after.stamina - before.stamina, ''],
  ]
    .filter(([, n]) => n !== 0)
    .map(
      ([label, n, unit]) => `${label}${Number(n) > 0 ? '+' : ''}${n}${unit}`,
    );
  const detail =
    after.story !== before.story
      ? after.story
      : (after.logs.filter((l) => l.id >= before.nextId).at(-1)?.text ??
        '操作已完成。');
  return `${names[action.type] ?? '操作完成'}${changes.length ? ' · ' + changes.join('，') : ''}。${detail}`;
}

function performTrade(
  s: GameState,
  action: Extract<Action, { type: 'trade' }>,
) {
  const state = structuredClone(s);
  requireDay(s);
  const q = action.quantity,
    g = action.good;
  if (
    !['buy', 'sell'].includes(action.side) ||
    !GOOD_IDS.includes(g) ||
    !Number.isFinite(q) ||
    q <= 0 ||
    q > 100000 ||
    Math.abs(q * 10 - Math.round(q * 10)) > 1e-8 ||
    (g !== 'grain' && !Number.isInteger(q))
  )
    throw Error('数量须为正数；粟米可输入一位小数');
  const costStamina = tradeStamina(s, g, q, action.transport ?? 'self');
  if (s.stamina < costStamina) throw Error(`搬运需要${costStamina}体力`);
  const freight = transportQuote(
    q * (g === 'hen' ? 2 : 1),
    action.transport ?? 'self',
  ).fee;
  const p = quote(s, g),
    u = Math.round(q * 10);
  if (action.side === 'buy') {
    const cost = Math.ceil(p.buy * q) + freight;
    if (s.cash < cost) throw Error('现金不足');
    if (g === 'hen') {
      if (s.hens.length + q > henCapacity(s)) throw Error('当前养殖容量不足');
      for (let i = 0; i < q; i++)
        s.hens.push({ id: s.nextId++, hunger: 0, cost: p.buy });
    } else {
      if (reserved(s) + u > capacity(s)) throw Error('仓储容量不足');
      add(s, g, u, cost, 'buy');
    }
    money(s, -cost, `买入${GOODS[g].name} ×${q}`);
    s.ledger.purchases += cost;
  } else {
    if (freight) {
      money(s, -freight, '销售搬运费');
      s.ledger.tradeCost += freight;
      s.stats.profit -= freight;
    }
    if (quantity(s, g) < q) throw Error('货物不足');
    const income = Math.floor(p.sell * q);
    if (g === 'hen') {
      const cost = s.hens.splice(0, q).reduce((a, h) => a + h.cost, 0);
      s.stats.profit += income - cost;
      s.ledger.tradeCost += cost;
    } else {
      const c = consume(s, g, u);
      s.ledger.tradeCost += c.cost - c.productionCost;
      if (c.production) {
        s.stats.productionCostSold += c.productionCost;
        s.ledger.productionCost += c.productionCost;
        s.ledger.productionRevenue += Math.floor((income * c.production) / u);
      } else s.stats.profit += income - c.cost;
    }
    money(s, income, `卖出${GOODS[g].name} ×${q}`);
    const produced =
      g === 'hen'
        ? 0
        : state.batches
            .filter((b) => b.good === g && b.origin === 'production')
            .reduce((v, b) => v + b.units, 0);
    // The split uses the exact FIFO batch mix, including gifted inventory.
    const soldMix =
      g === 'hen' ? 0 : consume(structuredClone(state), g, u).production;
    s.ledger.tradeRevenue +=
      income - (produced ? Math.floor((income * soldMix) / u) : 0);
  }
  s.stamina -= costStamina;
  s.daily.tradeUnits += q * (g === 'hen' ? 2 : RULES.tradeStaminaPerUnit);
  s.stats.trades++;
  s.stats.maxProfit = Math.max(s.stats.maxProfit, s.stats.profit);
  s.story = `成交${GOODS[g].name} ×${q}，搬运消耗${costStamina}体力。`;
}

function feedHens(s: GameState, count: number) {
  const hungry = s.hens.filter((h) => !s.life.fed.includes(h.id));
  if (!Number.isSafeInteger(count) || count < 1 || count > hungry.length)
    throw Error('请选择尚未喂养的母鸡数量');
  const units = count * (s.skills.husbandry >= 3 ? 1 : RULES.feed);
  const cost = consume(s, 'grain', units).cost;
  s.ledger.feed += cost;
  s.ledger.feedPending += cost;
  s.stats.feedCost += cost;
  s.life.fed.push(...hungry.slice(0, count).map((h) => h.id));
  if (s.skills.husbandry > 0) gainXp(s, 'husbandry', count);
  s.story = `已喂养${count}只母鸡，下次清晨06:00前不会重复消耗饲料。`;
  log(s, s.story);
}

function settleDawn(s: GameState) {
  if (s.life.lastDawn >= s.clock.minute) return;
  const home = HOUSING[s.housing.id];
  if (s.cash >= home.upkeep) {
    money(s, -home.upkeep, '每日住宅费用');
    s.ledger.housing += home.upkeep;
    s.housing.maintenanceSuspended = false;
    s.housing.paidThrough = s.clock.minute;
  } else if (home.kind === 'rent') {
    s.housing = {
      id: 'street',
      paidThrough: null,
      maintenanceSuspended: false,
    };
    for (const eq of s.equipment) eq.installed = false;
    for (const facility of s.home.facilities) facility.installed = false;
    log(s, '无力付租，退回街头；设备和货物保留，生产暂停。');
  } else if (home.kind === 'owned') {
    s.housing.maintenanceSuspended = true;
    log(s, '住宅维护暂停，设施和生产暂不可用。');
  }
  let eggs = 0;
  s.hens = s.hens.filter((h) => {
    if (s.life.fed.includes(h.id)) {
      h.hunger = 0;
      if (
        random(s) <
        (installed(s, 'coop') ? RULES.coopChance : RULES.eggChance) +
          (s.skills.husbandry >= 2 ? 0.1 : 0)
      )
        eggs++;
    } else h.hunger++;
    if (h.hunger >= 3) log(s, '一只母鸡连续三个周期未喂养，饿死了。');
    return h.hunger < 3;
  });
  if (eggs) {
    add(s, 'egg', eggs * 10, s.ledger.feedPending, 'production');
    s.ledger.feedPending = 0;
    s.stats.eggs += eggs;
  }
  s.life.fed = [];
  s.life.lastDawn = s.clock.minute;
  log(s, `清晨生活：产蛋${eggs}枚。`);
}

function refreshDawn(s: GameState) {
  s.commerce.positiveDays =
    businessProfit(s) > s.commerce.profitAtDawn
      ? s.commerce.positiveDays + 1
      : 0;
  s.daily = {
    work: 0,
    lessons: 0,
    treatment: 0,
    rest: 0,
    snack: 0,
    tradeUnits: 0,
  };
  s.encounterDay = 0;
  s.teaDay = 0;
  s.weather = random(s) < 0.2 ? '阴' : '晴';
  updatePrices(s);
  s.commerce.profitAtDawn = businessProfit(s);
  s.marketOffers.profitStreak =
    tradeNet(s) > s.marketOffers.profitAtDawn
      ? s.marketOffers.profitStreak + 1
      : 0;
  s.marketOffers.profitAtDawn = tradeNet(s);
  generateOpportunities(s);
  generateOrders(s);
  log(s, '清晨：行情和商户需求已更新，生活费用已结清。');
}

function chilledBatches(s: GameState) {
  const protectedIds = new Set<number>();
  if (!hasFacility(s, 'coldStorage')) return protectedIds;
  let room = 200;
  const rank = (g: Good) => {
    const i = s.home.coldPriority.indexOf(g);
    return i < 0 ? 999 : i;
  };
  const candidates = s.batches
    .filter((b) => b.remainingMinutes != null)
    .sort(
      (a, b) =>
        rank(a.good) - rank(b.good) ||
        a.remainingMinutes! - b.remainingMinutes! ||
        a.id - b.id,
    );
  for (const b of candidates) {
    if (room <= 0) break;
    if (b.units > room) {
      const cost = Math.floor((b.cost * room) / b.units);
      const part = { ...b, id: s.nextId++, units: room, cost };
      b.units -= room;
      b.cost -= cost;
      s.batches.push(part);
      protectedIds.add(part.id);
      room = 0;
    } else {
      protectedIds.add(b.id);
      room -= b.units;
    }
  }
  return protectedIds;
}

function advanceGameTime(
  s: GameState,
  minutes: number,
  sleeping = false,
  bed?: import('./types.ts').Bed,
) {
  for (let i = 0; i < minutes; i++) {
    const due = timelineEvents(s.clock.minute, s.clock.minute + 1, []);
    const projection = projectTime(s.clock, 1);
    const cold = active(s, 'cold');
    const warm = active(s, 'warm');
    if (sleeping) {
      s.clock.minute++;
      s.clock.sleepDebt = Math.max(0, s.clock.sleepDebt - 1 / 30);
      const effectiveBed =
        !['inn', 'temple', 'street'].includes(bed ?? '') &&
        (bed !== s.housing.id || s.housing.maintenanceSuspended)
          ? 'street'
          : bed;
      const recovery =
        effectiveBed === 'inn'
          ? 55
          : effectiveBed === 'temple'
            ? 35
            : effectiveBed === 'street'
              ? 20
              : HOUSING[s.housing.id].recovery;
      s.stamina +=
        ((recovery + (warm ? 5 : 0)) / 480) *
        sleepEfficiency(s.clock.minute - 0.5) *
        (effectiveBed === s.housing.id && hasFacility(s, 'bedroom') ? 1.15 : 1);
      if (effectiveBed === 'street') s.health -= 3 / 480;
      const theft =
        effectiveBed === 'street' ? 0.2 : effectiveBed === 'temple' ? 0.1 : 0;
      if (theft && random(s) < 1 - (1 - theft) ** (1 / 480)) {
        const loss = Math.min(50, Math.floor(s.cash * 0.1));
        money(s, -loss, '临时住宿失窃');
        s.ledger.losses += loss;
      }
    } else {
      s.clock = projection.clock;
      s.health -= projection.healthLoss;
    }
    if (cold) s.health -= 2 / 1440;
    s.day = clockDay(s.clock.minute);
    s.stats.days = s.day;
    // Life-cycle health is settled before same-minute spoilage, fees and output.
    if (
      due.some((e) => e.kind === 'housing') &&
      s.life.lastDawn < s.clock.minute &&
      s.life.ateCycle !== lifeCycle(s.clock.minute) - 1
    ) {
      s.health -= 8;
      log(s, '清晨到了，昨日至今未吃主餐，健康−8。');
    }
    const clockMinute = timeOfDay(s.clock.minute);
    if (!sleeping && clockMinute === 1020)
      log(s, '17:00：普通市场将在18:00收市，请预留搬运时间。');
    if (!sleeping && clockMinute === 1320)
      log(s, '22:00：夜已深，继续行动的体力成本将逐渐增加。');
    if (!sleeping && clockMinute === 120)
      log(s, '02:00：继续熬夜开始损害健康，代价会逐渐加重。');
    if (
      !sleeping &&
      clockMinute === 1080 &&
      s.life.ateCycle !== lifeCycle(s.clock.minute)
    )
      log(s, '还未吃主餐：请在明日06:00前安排饮食。');
    if (s.health <= 0) {
      s.health = 0;
      s.phase = 'ended';
      s.ending = 'death';
      s.deathCause = '健康耗尽';
      break;
    }
    if (s.pendingTrade) {
      for (const b of s.pendingTrade.batches)
        if (b.remainingMinutes != null) b.remainingMinutes--;
    }
    const chilled = chilledBatches(s);
    for (const b of s.batches) {
      if (b.remainingMinutes != null)
        b.remainingMinutes -= chilled.has(b.id) ? 0.5 : 1;
      if (b.remainingMinutes != null && b.remainingMinutes <= 0) {
        s.ledger.losses += b.cost;
        log(
          s,
          `${GOODS[b.good].name}已经腐坏。`,
          0,
          `损失${b.units / 10}${GOODS[b.good].unit}`,
        );
      }
    }
    s.batches = s.batches.filter(
      (b) => b.remainingMinutes == null || b.remainingMinutes > 0,
    );
    if (
      due.some((e) => e.id.startsWith('clock:autofeed:')) &&
      s.life.autoFeed
    ) {
      const units = s.skills.husbandry >= 3 ? 1 : RULES.feed;
      const count = Math.min(
        s.hens.filter((h) => !s.life.fed.includes(h.id)).length,
        Math.floor((quantity(s, 'grain') * 10) / units),
      );
      if (count) feedHens(s, count);
      const remaining = s.hens.filter((h) => !s.life.fed.includes(h.id)).length;
      if (remaining)
        log(
          s,
          `自动喂养饲料不足：仍有${remaining}只母鸡未喂，请在今天06:00前补齐。`,
        );
    }
    if (due.some((e) => e.kind === 'housing')) settleDawn(s);
    if (s.health <= 0) {
      s.health = 0;
      s.phase = 'ended';
      s.ending = 'death';
      s.deathCause = '健康耗尽';
      break;
    }
    for (const j of s.jobs.filter((j) => j.status === 'queued')) {
      if (
        !s.equipment.some((e) => e.id === j.equipmentId && e.installed) ||
        s.housing.maintenanceSuspended
      )
        continue;
      j.remainingMinutes = Math.max(0, j.remainingMinutes - 1);
      if (j.remainingMinutes === 0) {
        j.status = 'ready';
        const eq = s.equipment.find((e) => e.id === j.equipmentId);
        if (eq) eq.jobId = null;
        const recipe = RECIPE_MAP[j.recipeId];
        gainXp(s, recipe.industry, j.quantity);
        add(s, recipe.output, j.outputUnits, j.inputCost, 'production');
        log(s, `${recipe.name}生产完成，已入库。`);
      }
    }
    if (due.some((e) => e.kind === 'market')) refreshDawn(s);
    // The current action may deliver exactly at its deadline; expiry follows it.
    if (i < minutes - 1) expireTimedOrders(s);
    s.stamina = clamp(s.stamina, 0, staminaMax(s));
    if (s.health <= 0) {
      s.health = 0;
      s.phase = 'ended';
      s.ending = 'death';
      s.deathCause = '健康耗尽';
      break;
    }
  }
  if (sleeping && minutes >= 240) s.clock.awakeMinutes = 0;
}

function expireTimedOrders(s: GameState) {
  for (const order of s.commerce.orders) {
    if (order.deadlineAt <= s.clock.minute) failOrder(s, order);
  }
}

function reserveTrade(s: GameState, a: Action) {
  const outgoing: Partial<Record<Good, number>> = {};
  let cash = 0,
    units = 0;
  if (a.type === 'trade') {
    const fee = transportQuote(
      a.quantity * (a.good === 'hen' ? 2 : 1),
      a.transport ?? 'self',
    ).fee;
    if (a.side === 'buy') {
      cash = Math.ceil(quote(s, a.good).buy * a.quantity) + fee;
      units = a.good === 'hen' ? 0 : Math.round(a.quantity * 10);
    } else {
      cash = fee;
      outgoing[a.good] = a.quantity;
    }
  } else if (a.type === 'buyLot') {
    const lot = s.marketOffers.lots.find((l) => l.id === a.lotId)!;
    cash =
      lot.price + transportQuote(lotWeight(lot), a.transport ?? 'self').fee;
    units = lotWeight(lot) * 10;
  } else if (a.type === 'supplyRequest') {
    const r = s.marketOffers.requests.find((r) => r.id === a.requestId)!;
    outgoing[r.good] = a.quantity;
    cash = transportQuote(a.quantity, a.transport ?? 'self').fee;
  } else if (a.type === 'deliverOrder') {
    const order = s.commerce.orders.find((o) => o.id === a.orderId)!;
    Object.assign(outgoing, order.goods);
    cash = transportQuote(
      Object.values(outgoing).reduce((n, q) => n + q!, 0),
      a.transport ?? 'self',
    ).fee;
  } else return;
  if (s.cash < cash) throw Error('现金不足以预留本次货款与运费');
  s.cash -= cash;
  const held: NonNullable<GameState['pendingTrade']> = {
    cash,
    batches: [],
    hens: [],
    units,
  };
  for (const [key, q] of Object.entries(outgoing)) {
    const good = key as Good;
    if (good === 'hen') {
      held.hens.push(...s.hens.splice(0, q));
      continue;
    }
    let left = Math.round(q! * 10);
    const stock = s.batches
      .filter((b) => b.good === good)
      .sort(
        (a, b) =>
          (a.remainingMinutes ?? Infinity) - (b.remainingMinutes ?? Infinity) ||
          a.id - b.id,
      );
    for (const b of stock) {
      if (!left) break;
      const take = Math.min(left, b.units);
      const cost =
        take === b.units ? b.cost : Math.floor((b.cost * take) / b.units);
      held.batches.push({
        ...b,
        id: take === b.units ? b.id : s.nextId++,
        units: take,
        cost,
      });
      b.units -= take;
      b.cost -= cost;
      left -= take;
      held.units += take;
    }
    if (left) throw Error('交货库存不足');
  }
  s.batches = s.batches.filter((b) => b.units > 0);
  s.pendingTrade = held;
}

function releaseTrade(s: GameState) {
  const held = s.pendingTrade;
  if (!held) return;
  s.cash += held.cash;
  for (const b of held.batches) {
    if (b.remainingMinutes != null && b.remainingMinutes <= 0) {
      s.ledger.losses += b.cost;
      log(s, '运输途中货物腐坏。');
    } else s.batches.push(b);
  }
  s.hens.push(...held.hens);
  delete s.pendingTrade;
}

export function dispatch(
  state: GameState,
  action: Action,
  expectedRevision = state.revision,
): { state: GameState; error?: string; result?: OperationResult } {
  try {
    if (expectedRevision !== state.revision)
      throw Error('操作已更新，请勿重复提交');
    if (state.phase === 'ended') throw Error('本局已经结束');
    const timing = actionTiming(state, action);
    if (
      !Number.isSafeInteger(timing.minutes) ||
      timing.minutes < 0 ||
      timing.minutes > 1440
    )
      throw Error('单次行动时间须在0至1440分钟内');
    if (!canFinishAtVenue(state.clock.minute, timing.minutes, timing.venue))
      throw Error('当前营业时间不足以完成此行动，请查看下次营业时间');
    if (action.type === 'sleep') {
      if (action.minutes < 60 || action.minutes > 600)
        throw Error('睡眠时长须为1至10小时');
      if (!['inn', 'temple', 'street', state.housing.id].includes(action.bed))
        throw Error('只能使用当前住所或临时住宿');
      if (action.bed === 'inn' && state.cash < 30)
        throw Error('客栈住宿需要30文');
    }
    if (action.type === 'deliverOrder') {
      const o = state.commerce.orders.find((o) => o.id === action.orderId);
      if (o && state.clock.minute + timing.minutes > o.deadlineAt)
        throw Error('无法在订单截止前完成交货');
    }
    if (
      action.type === 'trade' ||
      action.type === 'deliverOrder' ||
      action.type === 'buyLot' ||
      action.type === 'supplyRequest'
    ) {
      if (action.transport === 'cart' && !state.home.cart)
        throw Error('请先购买手推车');
      if (
        action.transport === 'porter' &&
        !canFinishAtVenue(state.clock.minute, timing.minutes, 'porter')
      )
        throw Error('脚夫仅在08:00—18:00接活，需在收工前完成');
    }
    const check = applyAction(state, action, expectedRevision);
    if (check.error) throw Error(check.error);
    const s = structuredClone(state);
    if (action.type === 'sleep' && action.bed === 'inn') {
      money(s, -30, '客栈住宿');
      s.ledger.living += 30;
    }
    const energy = actionEnergy(state, action);
    const projection = projectTime(
      state.clock,
      timing.minutes,
      action.type === 'sleep' ? { sleeping: true } : {},
    );
    const extraEnergy = energy * (projection.averageExertion - 1);
    if (state.stamina < energy + extraEnergy)
      throw Error(`考虑困倦后需要${Math.ceil(energy + extraEnergy)}体力`);
    reserveTrade(s, action);
    advanceGameTime(
      s,
      timing.minutes,
      action.type === 'sleep',
      action.type === 'sleep' ? action.bed : undefined,
    );
    releaseTrade(s);
    if (s.phase === 'ended') {
      for (const o of s.commerce.orders) failOrder(s, o);
      s.revision++;
      return { state: s, result: operationResult(state, s, action) };
    }
    // Quote is locked at dispatch; ordinary daily prices remain the new day's prices.
    const actualPrices = s.prices;
    if (action.type === 'trade') s.prices = structuredClone(state.prices);
    const applied = applyAction(s, action, s.revision);
    if (applied.error) throw Error(applied.error);
    const next = applied.state;
    next.prices = actualPrices;
    next.stamina = Math.max(0, next.stamina - extraEnergy);
    next.life.fed = next.life.fed.filter((id) =>
      next.hens.some((h) => h.id === id),
    );
    expireTimedOrders(next);
    if (
      (action.type === 'trade' && action.side === 'sell') ||
      action.type === 'supplyRequest' ||
      action.type === 'deliverOrder'
    ) {
      if (tradeNet(next) > tradeNet(state))
        next.marketOffers.milestones.firstProfit ??= next.clock.minute;
      if (action.transport === 'porter')
        next.marketOffers.milestones.porter ??= next.clock.minute;
    }
    updateTradeMilestones(next);
    const lifeEvents: Partial<Record<keyof typeof HOME_EVENTS, boolean>> = {
      moveRoom: action.type === 'rentHousing' && action.housing === 'room',
      buyYard: action.type === 'buyHousing' && action.housing === 'yard',
      firstHost: action.type === 'host',
      cartTrade:
        (action.type === 'trade' ||
          action.type === 'buyLot' ||
          action.type === 'supplyRequest' ||
          action.type === 'deliverOrder') &&
        action.transport === 'cart',
      porterDelivery:
        (action.type === 'deliverOrder' ||
          action.type === 'supplyRequest' ||
          (action.type === 'trade' && action.side === 'sell')) &&
        action.transport === 'porter',
      nightTrade:
        action.type === 'buyLot' && timeOfDay(state.clock.minute) >= 1080,
    };
    for (const id of Object.keys(lifeEvents) as (keyof typeof HOME_EVENTS)[]) {
      if (lifeEvents[id] && next.home.events[id] === undefined) {
        next.home.events[id] = next.clock.minute;
        log(next, HOME_EVENTS[id]);
      }
    }
    if (action.type === 'sleep')
      next.life.wakeSummary = {
        at: next.clock.minute,
        lines: [
          `睡眠${action.minutes / 60}小时，体力${next.stamina.toFixed(1)}，睡眠不足${next.clock.sleepDebt.toFixed(1)}小时。`,
          `睡眠期间现金变化${next.cash - state.cash}文，健康变化${(next.health - state.health).toFixed(1)}。`,
          ...next.logs
            .filter((l) => l.id >= state.nextId)
            .map((l) => `${l.text}${l.items ? ' ' + l.items : ''}`)
            .slice(-12),
        ],
      };
    const result = operationResult(state, next, action);
    if (isOperatingAction(action))
      next.operationHistory = [...state.operationHistory, result].slice(-50);
    return { state: next, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : '操作失败';
    return {
      state,
      error,
      result: operationResult(state, state, action, error),
    };
  }
}

function applyAction(
  state: GameState,
  action: Action,
  expectedRevision = state.revision,
): { state: GameState; error?: string; result?: OperationResult } {
  if (expectedRevision !== state.revision)
    return {
      state,
      error: '操作已更新，请勿重复提交',
      result: operationResult(state, state, action, '操作已更新，请勿重复提交'),
    };
  if (state.phase === 'ended')
    return {
      state,
      error: '本局已经结束',
      result: operationResult(state, state, action, '本局已经结束'),
    };
  const s = structuredClone(state);
  try {
    switch (action.type) {
      case 'reserveRequest': {
        const r = s.marketOffers.requests.find(
          (r) => r.id === action.requestId,
        );
        if (!r || r.remaining <= 0 || s.clock.minute > r.deadline)
          throw Error('收购需求已失效');
        if (s.commerce.relations[r.customer] < 6)
          throw Error('客户关系达到6才可预留');
        if (
          s.marketOffers.requests.some(
            (r) => r.reservedUntil != null && r.reservedUntil > s.clock.minute,
          )
        )
          throw Error('同时只能预留一条需求');
        r.reservedUntil = (Math.floor(s.clock.minute / 1440) + 1) * 1440 + 720;
        r.deadline = r.reservedUntil;
        s.story = '这份收购需求已为你保留至次日12:00，到期释放，不收罚金。';
        break;
      }
      case 'supplyRequest': {
        const r = s.marketOffers.requests.find(
          (r) => r.id === action.requestId,
        );
        if (!r || s.clock.minute < r.opensAt || s.clock.minute > r.deadline)
          throw Error('不在收购时限内');
        if (
          !Number.isSafeInteger(action.quantity) ||
          action.quantity < 1 ||
          action.quantity > r.remaining
        )
          throw Error('交货数量超过剩余需求');
        const freight = transportQuote(
          action.quantity,
          action.transport ?? 'self',
        ).fee;
        if (s.stamina < actionEnergy(s, action)) throw Error('交货体力不足');
        money(s, -freight, '收购交货运费');
        const taken = consume(s, r.good, action.quantity * 10);
        const revenue = r.price * action.quantity;
        money(s, revenue, '限量收购交货');
        const productionRevenue = Math.floor(
          (revenue * taken.production) / (action.quantity * 10),
        );
        s.ledger.productionRevenue += productionRevenue;
        s.ledger.productionCost += taken.productionCost;
        s.ledger.tradeRevenue += revenue - productionRevenue;
        s.ledger.tradeCost += taken.cost - taken.productionCost + freight;
        s.stats.productionCostSold += taken.productionCost;
        s.stats.profit +=
          revenue -
          productionRevenue -
          (taken.cost - taken.productionCost) -
          freight;
        s.stamina -= actionEnergy(s, action);
        r.remaining -= action.quantity;
        s.commerce.customers[r.customer] ??= {
          met: true,
          visited: 0,
          lastOutcome: null,
        };
        s.story = `已交付${GOODS[r.good].name}${action.quantity}${GOODS[r.good].unit}，需求还剩${r.remaining}。`;
        break;
      }
      case 'buyLot': {
        const lot = s.marketOffers.lots.find((l) => l.id === action.lotId);
        if (
          !lot ||
          lot.bought ||
          s.clock.minute < lot.opensAt ||
          s.clock.minute > lot.closesAt
        )
          throw Error('货盘已成交或不在营业时间');
        if (
          lot.large &&
          !Object.values(s.commerce.relations).some((r) => r >= 10)
        )
          throw Error('大宗货盘需要熟客关系10');
        const weight = lotWeight(lot);
        const freight = transportQuote(weight, action.transport ?? 'self').fee;
        if (reserved(s) + weight * 10 > capacity(s))
          throw Error('仓储容量不足');
        if (s.stamina < actionEnergy(s, action)) throw Error('搬运体力不足');
        const total = lot.price + freight;
        money(s, -total, '整批货盘采购');
        s.ledger.purchases += total;
        const goods = Object.entries(lot.goods) as [Good, number][];
        let allocated = 0;
        const basis = goods.reduce((n, [g, q]) => n + s.prices[g].buy * q, 0);
        goods.forEach(([g, q], i) => {
          const cost =
            i === goods.length - 1
              ? total - allocated
              : Math.floor((total * s.prices[g].buy * q) / basis);
          allocated += cost;
          add(s, g, q * 10, cost, 'buy');
          const batch = s.batches.at(-1)!;
          if (batch.remainingMinutes != null)
            batch.remainingMinutes = Math.min(
              batch.remainingMinutes,
              lot.shelfMinutes,
            );
        });
        s.stamina -= actionEnergy(s, action);
        lot.bought = true;
        s.marketOffers.milestones.cargo ??= s.clock.minute;
        s.story = '整批货盘已入库，运费已经计入各批货物成本。';
        break;
      }
      case 'host': {
        if (!CUSTOMER_IDS.includes(action.customer))
          throw Error('找不到这位客人');
        if (!hasFacility(s, 'reception')) throw Error('请先布置会客间');
        if (!s.commerce.customers[action.customer]?.met)
          throw Error('请先结识这位客户');
        const prior = s.home.visits[action.customer];
        if (prior && prior.count >= 2)
          throw Error('这位熟客的居家故事已读完，可免费回看');
        if (prior && s.clock.minute < prior.at + 4320)
          throw Error('同一客户每三日可邀请一次');
        money(s, -20, '熟客家宴');
        s.ledger.social += 20;
        if (s.life.ateCycle !== lifeCycle(s.clock.minute))
          s.health = Math.min(100, s.health + 2);
        s.life.ateCycle = lifeCycle(s.clock.minute);
        const count = prior?.count ?? 0;
        s.story = HOME_STORIES[action.customer][count];
        s.home.visits[action.customer] = {
          count: count + 1,
          at: s.clock.minute,
        };
        s.commerce.relations[action.customer] = Math.min(
          10,
          s.commerce.relations[action.customer] + 1,
        );
        log(s, s.story);
        break;
      }
      case 'buyCart':
        if (s.home.cart) throw Error('已有手推车');
        money(s, -300, '购买手推车');
        s.ledger.equipment += 300;
        s.home.cart = true;
        s.story = '手推车备好了，买卖货物时可以选择推车搬运。';
        break;
      case 'installFacility':
      case 'removeFacility':
      case 'sellFacility': {
        if (!Object.hasOwn(FACILITIES, action.facility))
          throw Error('未知住宅设施');
        const spec = FACILITIES[action.facility];
        const item = s.home.facilities.find((f) => f.kind === action.facility);
        if (action.type === 'installFacility') {
          if (s.housing.id === 'street' || s.housing.maintenanceSuspended)
            throw Error('需要维护正常的固定住所');
          if (item?.installed) throw Error('设施已安装');
          if (usedHomeSlots(s) >= HOUSING[s.housing.id].slots)
            throw Error('住宅功能位不足');
          if (!item) {
            money(s, -spec.cost, `购置${spec.name}`);
            s.ledger.equipment += spec.cost;
            s.home.facilities.push({ kind: action.facility, installed: true });
          } else item.installed = true;
        } else {
          if (!item) throw Error('尚未拥有该设施');
          if (action.type === 'removeFacility') {
            if (!item.installed) throw Error('设施已经封存');
            item.installed = false;
          } else {
            money(s, Math.floor(spec.cost * 0.6), `出售${spec.name}`);
            s.ledger.returns += Math.floor(spec.cost * 0.6);
            s.home.facilities = s.home.facilities.filter((f) => f !== item);
          }
        }
        s.story = `${spec.name}已${action.type === 'installFacility' ? '安装' : action.type === 'removeFacility' ? '封存' : '出售'}。`;
        break;
      }
      case 'coldPriority':
        if (
          !Array.isArray(action.goods) ||
          action.goods.some((g) => !GOOD_IDS.includes(g)) ||
          new Set(action.goods).size !== action.goods.length
        )
          throw Error('保鲜顺序包含无效或重复商品');
        s.home.coldPriority = [...action.goods];
        s.story = '凉储间保鲜优先顺序已更新。';
        break;
      case 'wait':
      case 'sleep':
        if (s.event) throw Error('请先处理眼前的遭遇');
        s.story =
          action.type === 'sleep'
            ? '你醒来，重新安排眼前的生活。'
            : '时光流逝，城里的生意继续变化。';
        break;
      case 'autoFeed':
        s.life.autoFeed = action.enabled;
        s.story = action.enabled
          ? '每日05:30将用现有粮食自动喂养。'
          : '已关闭自动喂养。';
        break;
      case 'feed':
        feedHens(s, action.count);
        break;
      case 'eat': {
        const costs = { bread: 10, egg: 20, saltedEgg: 10, grain: 10 };
        let cost = 0;
        if (action.meal === 'diner') {
          money(s, -18, '食肆主餐');
          cost = 18;
        } else {
          if (!(action.meal in costs)) throw Error('请选择有效的饭食');
          cost = consume(s, action.meal, costs[action.meal]).cost;
        }
        s.ledger.living += cost;
        if (s.life.ateCycle !== lifeCycle(s.clock.minute))
          s.health = Math.min(100, s.health + 2);
        s.life.ateCycle = lifeCycle(s.clock.minute);
        s.story = '用过主餐，本生活周期的饮食已满足。';
        break;
      }
      case 'acceptOrder': {
        requireDay(s);
        const order = s.commerce.orders.find((o) => o.id === action.orderId);
        if (!order || order.status !== 'offered' || order.postedDay !== s.day)
          throw Error('该订单已失效或已经接取');
        if (
          s.commerce.orders.filter((o) => o.status === 'accepted').length >= 2
        )
          throw Error('最多同时履行两张订单');
        if (order.highRisk && s.commerce.relations[order.customer] < 3)
          throw Error('客户关系不足，先完成普通订单');
        if (order.highRisk && action.confirm !== orderTerms(order))
          throw Error('请先确认当前交期、保证金与违约成本');
        if (s.cash < order.deposit) throw Error('现金不足以缴纳保证金');
        if (order.deposit)
          money(s, -order.deposit, `订单「${order.title}」冻结保证金`);
        s.ledger.depositsPaid += order.deposit;
        order.status = 'accepted';
        s.commerce.customers[order.customer] ??= {
          met: true,
          visited: 0,
          lastOutcome: null,
        };
        s.commerce.customers[order.customer]!.met = true;
        s.story = `已接「${order.title}」，${formatMoment(order.deadlineAt)}前交齐；${order.deposit ? '保证金' + order.deposit + '文已冻结' : '无保证金'}。`;
        log(s, s.story);
        break;
      }
      case 'declineOrder': {
        requireDay(s);
        const o = s.commerce.orders.find(
          (o) =>
            o.id === action.orderId &&
            o.status === 'offered' &&
            o.postedDay === s.day,
        );
        if (!o) throw Error('这张订单已失效或已经处理');
        o.status = 'declined';
        o.settledDay = s.day;
        s.story = CUSTOMER_DECLINES[o.customer];
        log(s, s.story);
        break;
      }
      case 'deliverOrder':
      case 'abandonOrder': {
        requireDay(s);
        const order = s.commerce.orders.find((o) => o.id === action.orderId);
        if (!order || order.status !== 'accepted')
          throw Error('没有这张进行中的订单');
        if (action.type === 'deliverOrder')
          deliverOrder(s, order, action.transport ?? 'self');
        else {
          failOrder(s, order);
          s.story = CUSTOMERS[order.customer].failure;
        }
        break;
      }
      case 'meetCustomer':
      case 'visitCustomer': {
        requireDay(s);
        const id = action.customerId;
        if (!CUSTOMER_IDS.includes(id)) throw Error('找不到这位客户');
        const c = s.commerce.customers[id];
        if (!c?.met) throw Error('请先在茶馆追问消息或接取这位客户的订单');
        const stage = customerStage(s, id);
        if (c.visited >= stage && c.lastOutcome !== 'failed')
          throw Error('暂时没有新的后续');
        if (s.stamina < 5) throw Error('拜访需要5体力');
        s.stamina -= 5;
        s.story =
          c.lastOutcome === 'failed'
            ? CUSTOMERS[id].failure
            : CUSTOMERS[id].stories[Math.min(stage, c.visited + 1) - 1];
        if (c.lastOutcome !== 'failed')
          c.visited = Math.min(stage, c.visited + 1);
        if (c.lastOutcome === 'failed') c.lastOutcome = null;
        log(s, s.story);
        break;
      }
      // Legacy tools may still send these navigation actions. They never consume resources or roll encounters.
      case 'market':
      case 'leave':
        requireDay(s);
        s.phase = 'day';
        break;
      case 'trade':
        performTrade(s, action);
        s.phase = 'day';
        finishAction(s);
        break;
      case 'refill': {
        requireDay(s);
        const plan = recipeQuote(s, action.recipeId, action.quantity);
        if (!plan.materials.some((m) => m.missing > 0))
          throw Error('原料已齐，可以直接开工');
        for (const m of plan.materials)
          if (m.missing > 0)
            performTrade(s, {
              type: 'trade',
              side: 'buy',
              good: m.good,
              quantity: m.missing,
            });
        s.story = `${RECIPE_MAP[action.recipeId].name}所缺原料已补齐，可以直接开工。`;
        s.phase = 'day';
        finishAction(s);
        break;
      }
      case 'tea': {
        requireDay(s);
        if (s.teaDay === clockDay(s.life.lastDawn))
          throw Error('今天已经听过消息');
        if (s.cash < 8) throw Error('茶钱不足');
        money(s, -8, '茶馆听消息');
        s.ledger.living += 8;
        s.teaDay = clockDay(s.life.lastDawn);
        const candidates: typeof INFO_TEMPLATES = [];
        const eligible = INFO_TEMPLATES.filter(
          (t) =>
            (s.intelSeen[t.semantic] ?? 0) <= s.clock.minute &&
            (s.intelSeen[`skeleton:${t.skeleton}`] ?? 0) <= s.clock.minute,
        )
          .map((t) => ({
            t,
            score:
              random(s) +
              (t.skill && s.skills[t.skill] > 0 ? 0.6 : 0) +
              (t.good && quantity(s, t.good) > 0 ? 0.3 : 0) +
              (s.intelSeen[t.semantic] === undefined ? 1 : 0),
          }))
          .sort((a, b) => b.score - a.score);
        for (const { t } of eligible)
          if (
            candidates.length < 3 &&
            !candidates.some((c) => c.skeleton === t.skeleton)
          )
            candidates.push(t);
        if (!candidates.length) throw Error('暂时没有新消息，过些时候再来');
        let heardMarket = false;
        for (const t of candidates) {
          const w = heardMarket
            ? undefined
            : s.worlds.find(
                (x) =>
                  !x.heard &&
                  x.expected >= s.day &&
                  x.expected <= s.day + 14 &&
                  (s.intelSeen[`market:${x.family}`] ?? 0) <= s.clock.minute,
              );
          if (w) {
            heardMarket = true;
            s.intelSeen[`market:${w.family}`] = s.clock.minute + 7 * 1440;
          }
          addIntel(s, t, w);
          const customer =
            !w && t === candidates.at(-1) && s.day >= 4 && s.day % 7 === 0
              ? customerOpportunity(s)
              : undefined;
          if (customer) {
            const entry = s.intel[0];
            delete entry.resolution;
            entry.customerId = customer;
            entry.title = `${CUSTOMERS[customer].name}正在找供货人`;
            entry.source = CUSTOMERS[customer].name;
            entry.category = '人物机会';
            entry.semantic = `customer-intro:${customer}`;
            entry.text = CUSTOMERS[customer].stories[0];
            entry.status = 'new';
            s.intelSeen[entry.semantic] = s.clock.minute + 20 * 1440;
          }
        }
        s.story = `你在茶馆坐了一会儿，记下${candidates.length}条新情报。出处和细节各有分量，真假要等后续动静验证。`;
        finishAction(s);
        break;
      }
      case 'askIntel':
      case 'visitIntel': {
        requireDay(s);
        const entry = s.intel.find((i) => i.id === action.id);
        if (!entry) throw Error('这条情报已不在近期记录中');
        const asking = action.type === 'askIntel';
        if (!asking && !entry.asked) throw Error('请先追问出处，再回访核对');
        if (asking ? entry.asked : entry.visited)
          throw Error('这次核对已经做过');
        if (entry.customerId) {
          const id = entry.customerId;
          const customer = s.commerce.customers[id] ?? {
            met: false,
            visited: 0,
            lastOutcome: null,
          };
          if (!asking && !customer.met) throw Error('请先追问并认识这位客户');
          if (
            !asking &&
            customerStage(s, id) < 2 &&
            customer.lastOutcome !== 'failed'
          )
            throw Error('先完成或处理该客户的订单，再来回访');
          if (s.stamina < 5) throw Error('核对需要5体力');
          s.stamina -= 5;
          customer.met = true;
          s.commerce.customers[id] = customer;
          if (asking) {
            entry.asked = true;
            customer.visited = Math.max(1, customer.visited);
          } else {
            entry.visited = true;
            if (customer.lastOutcome !== 'failed')
              customer.visited = Math.min(
                customerStage(s, id),
                customer.visited + 1,
              );
          }
          entry.followUp =
            !asking && customer.lastOutcome === 'failed'
              ? CUSTOMERS[id].failure
              : CUSTOMERS[id].stories[
                  asking ? 0 : Math.max(0, customer.visited - 1)
                ];
          if (!asking && customer.lastOutcome === 'failed')
            customer.lastOutcome = null;
          entry.status = 'confirmed';
          s.story = entry.followUp;
          log(s, s.story);
          break;
        }
        const w = s.worlds.find((w) => w.id === entry.worldId);
        if (!asking && entry.resolution && s.day < entry.resolution.due)
          throw Error(`第${entry.resolution.due}日起可回访`);
        if (!asking && w && s.day <= w.expected + 3)
          throw Error(`第${w.expected + 4}日起可回访核对`);
        if (s.stamina < 5) throw Error('核对需要5体力');
        s.stamina -= 5;
        if (asking) {
          entry.asked = true;
          if (w) w.clueKnown = true;
        } else entry.visited = true;
        entry.followUp =
          asking && w
            ? w.clue
            : w
              ? s.day >= w.start && w.truth !== 'false'
                ? `${w.publicText} 目前${GOODS[w.good].name}买价${quote(s, w.good).buy}文，规模仍需和此前牌价比较。`
                : '截至回访，未见约定的公开动静；这条消息没有兑现。'
              : asking
                ? (entry.resolution?.clue ??
                  '消息来源已经离开，暂时找不到更多细节。')
                : (entry.resolution?.text ?? '这条旧消息已经无从追索。');
        if (!asking)
          entry.status = entry.resolution
            ? entry.resolution.happens
              ? 'confirmed'
              : 'wrong'
            : w
              ? s.day >= w.start && w.truth !== 'false'
                ? 'confirmed'
                : 'wrong'
              : 'expired';
        s.story = entry.followUp;
        break;
      }
      case 'short':
      case 'heavy': {
        requireDay(s);

        const heavy = action.type === 'heavy';
        const cost = actionEnergy(s, action);
        if (heavy && s.health < 40) throw Error('健康低于40，不能做重活');
        if (s.stamina < cost) throw Error(`体力不足，需要${cost}`);
        s.stamina -= cost;
        s.daily.work++;
        const wage = heavy ? RULES.heavyWage : RULES.shortWage;
        money(s, wage, '码头劳动所得');
        s.ledger.workIncome += wage;
        s.stats.workIncome += wage;
        s.story = heavy
          ? '你扛起沉重的麻袋，工头按约付给你40文。'
          : '你做了半日轻活，工头递来25文。';
        finishAction(s);
        break;
      }
      case 'rest':
        requireDay(s);

        s.daily.rest = 1;
        s.stamina = Math.min(staminaMax(s), s.stamina + RULES.restStamina);

        s.story = '你歇脚一小时，恢复20体力；睡眠不足仍需睡觉缓解。';
        finishAction(s, false);
        break;
      case 'snack':
        requireDay(s);
        if (s.daily.snack >= 2)
          throw Error('到下次清晨06:00前，两次有效加餐已用完');
        if (s.cash < 6) throw Error('加餐需要6文');
        money(s, -6, '加餐');
        s.ledger.living += 6;
        s.daily.snack++;
        s.stamina = Math.min(staminaMax(s), s.stamina + RULES.snackStamina);
        s.story = '你买了一份热汤，恢复15体力。';
        finishAction(s, false);
        break;
      case 'treat':
        requireDay(s);
        if (s.daily.treatment) throw Error('今天已经治疗过');
        if (action.mode === 'fast') {
          if (s.cash < 80 || quantity(s, 'herb') < 1)
            throw Error('快速治疗需要80文和一包药材');
          consume(s, 'herb', 10);
          money(s, -80, '郎中快速治疗');
          s.ledger.medical += 80;
          s.health = clamp(s.health + 25, 0, 100);
        } else {
          if (s.cash < 30) throw Error('调养需要30文');
          money(s, -30, '郎中调养');
          s.ledger.medical += 30;
          s.health = clamp(s.health + 10, 0, 100);
        }
        delete s.buffs.cold;
        s.daily.treatment = 1;
        s.story =
          action.mode === 'fast'
            ? '郎中用药很快，风寒和伤痛都缓下来。'
            : '郎中让你喝了几剂温药，慢慢调养。';
        finishAction(s, false);
        break;
      case 'learn': {
        requireDay(s);
        const skill = action.skill;
        if (!SKILL_IDS.includes(skill)) throw Error('无效技能');
        const level = s.skills[skill];
        if (s.daily.lessons) throw Error('每天最多上课一次');
        if (level >= 3) throw Error('这门手艺已经精通');
        if (level > 0 && s.skillXp[skill] < XP_TO_LEVEL[level + 1])
          throw Error(
            `还需生产${XP_TO_LEVEL[level + 1] - s.skillXp[skill]}批才能进阶`,
          );
        const cost = LESSON_COST[level];
        if (s.cash < cost) throw Error('学费不足');
        if (s.stamina < RULES.lessonStamina) throw Error('体力不足，需要20');
        money(s, -cost, `向${SKILLS[skill].teacher}学习${SKILLS[skill].name}`);
        s.ledger.tuition += cost;
        s.stamina -= RULES.lessonStamina;
        s.daily.lessons = 1;
        s.skills[skill]++;
        s.stats.lessons++;
        s.story = `你向${SKILLS[skill].teacher}学会了${SKILL_LEVELS[s.skills[skill]]}的${SKILLS[skill].name}。`;
        break;
      }
      case 'install': {
        requireDay(s);
        const kind = action.equipment;
        if (!EQUIPMENT_IDS.includes(kind)) throw Error('无效设备');
        if (HOUSING[s.housing.id].slots <= usedHomeSlots(s))
          throw Error('当前住所没有空设备位');
        if (s.equipment.some((e) => e.kind === kind && e.installed))
          throw Error('设备已经安装');
        const eq = s.equipment.find((e) => e.kind === kind && !e.installed);
        const cost = eq ? 0 : EQUIPMENT[kind].cost;
        if (cost) {
          if (s.cash < cost) throw Error('设备款不足');
          money(s, -cost, `购置${EQUIPMENT[kind].name}`);
          s.ledger.equipment += cost;
        }
        if (eq) eq.installed = true;
        else
          s.equipment.push({
            id: s.nextId++,
            kind,
            installed: true,
            jobId: null,
          });
        s.story = `${EQUIPMENT[kind].name}已安装，占用1个设备位。`;
        break;
      }
      case 'uninstall': {
        requireDay(s);
        const eq = s.equipment.find((e) => e.id === action.equipmentId);
        if (!eq || !eq.installed) throw Error('找不到已安装设备');
        if (eq.jobId) throw Error('设备正在生产，不能拆卸');
        eq.installed = false;
        s.story = `${EQUIPMENT[eq.kind].name}已拆卸并保留在仓库。`;
        break;
      }
      case 'produce': {
        requireDay(s);
        const r = RECIPE_MAP[action.recipeId] as Recipe | undefined;
        const n = action.quantity;
        if (!r || !Number.isInteger(n) || n < 1 || n > 20)
          throw Error('无效配方或批量');
        if (s.skills[r.industry] < r.minSkill)
          throw Error(
            `需要${SKILLS[r.industry].name}达到${SKILL_LEVELS[r.minSkill]}`,
          );
        const eq = installed(s, r.equipment);
        if (!eq || eq.jobId)
          throw Error(`需要空闲的${EQUIPMENT[r.equipment].name}`);
        if (s.housing.maintenanceSuspended)
          throw Error('住宅维护暂停，请先补缴维护费');
        const plan = productionPlan(s, r, n);
        let inputCost = 0;
        for (const [g, need] of Object.entries(plan.inputs) as [
          Good,
          number,
        ][]) {
          if (
            s.batches
              .filter(
                (b) =>
                  b.good === g &&
                  (b.remainingMinutes == null || b.remainingMinutes > 0),
              )
              .reduce((v, b) => v + b.units, 0) < need
          )
            throw Error(`${GOODS[g].name}不足或已过期`);
          inputCost += consume(s, g, need).cost;
        }
        const { outputUnits, energy } = plan;
        if (reserved(s) + outputUnits > capacity(s))
          throw Error('成品预留后仓储不足');
        if (s.health < 40 && energy >= 20)
          throw Error('健康低于40，不能进行高强度加工');
        if (s.stamina < energy) throw Error(`体力不足，需要${energy}`);
        s.stamina -= energy;
        s.stats.productionRuns += n;
        if (!r.duration) gainXp(s, r.industry, n);
        const job: ProductionJob = {
          id: s.nextId++,
          recipeId: r.id,
          quantity: n,
          equipmentId: eq.id,
          startDay: s.day,
          remainingMinutes: r.duration * 1440,
          inputCost,
          outputUnits,
          status: r.duration ? 'queued' : 'ready',
        };
        s.jobs.push(job);
        if (r.duration) eq.jobId = job.id;
        else add(s, r.output, outputUnits, inputCost, 'production', s.day);
        s.story = r.duration
          ? `${r.name}已开工，${r.duration * 24}小时后完成。原料和成品仓位都已锁定。`
          : `${r.name}完成，产出${GOODS[r.output].name} ×${outputUnits / 10}。`;
        break;
      }
      case 'cancelProduction': {
        requireDay(s);
        const j = s.jobs.find(
          (x) => x.id === action.jobId && x.status === 'queued',
        );
        if (!j) throw Error('找不到进行中的生产');
        const eq = s.equipment.find((e) => e.id === j.equipmentId);
        if (eq) eq.jobId = null;
        j.status = 'abandoned';
        s.ledger.losses += j.inputCost;
        s.story = '你放弃了这批在制品，已投入的原料不返还；设备重新空闲。';
        break;
      }
      case 'rent':
      case 'coop': {
        if (action.type === 'rent') {
          if (s.housing.id !== 'street') throw Error('已经有固定住所');
          dispatchInPlace(s, { type: 'rentHousing', housing: 'room' });
        } else dispatchInPlace(s, { type: 'install', equipment: 'coop' });
        break;
      }
      case 'rentHousing':
      case 'buyHousing': {
        requireDay(s);
        const h = HOUSING[action.housing];
        if (!h || h.kind === 'temporary') throw Error('不能购买或租赁临时住所');
        const old = HOUSING[s.housing.id];
        if (action.housing === s.housing.id) throw Error('已经住在这里');
        if (old.kind === 'owned') throw Error('请先出售现有产权，避免丢失房产');
        if (
          h.slots < usedHomeSlots(s) ||
          h.capacity < reserved(s) ||
          s.hens.length > h.henCapacity
        )
          throw Error('新住所容量不足，请先出售货物或拆卸设备');
        if (action.type === 'rentHousing' && h.kind !== 'rent')
          throw Error('该住所需要购买');
        if (action.type === 'buyHousing' && h.kind !== 'owned')
          throw Error('该住所只能租赁');
        if (h.cost > s.cash) throw Error('现金不足');
        money(
          s,
          -h.cost,
          `${action.type === 'buyHousing' ? '购买' : '租下'}${h.name}`,
        );
        s.ledger.housing += h.cost;
        s.housing = {
          id: action.housing,
          maintenanceSuspended: false,
          paidThrough: action.type === 'rentHousing' ? s.day : null,
        };
        s.story = `${h.name}已接手。${old.name}留下的设备和货物都保留了下来。`;
        break;
      }
      case 'sellHousing': {
        requireDay(s);
        if (HOUSING[s.housing.id].kind !== 'owned')
          throw Error('只有自有住宅可以出售');
        if (
          s.equipment.some((e) => e.installed) ||
          s.jobs.some((j) => j.status === 'queued')
        )
          throw Error('请先拆卸设备并完成或放弃生产');
        const h = HOUSING[s.housing.id];
        money(s, Math.floor(h.cost * 0.72), `出售${h.name}`);
        s.ledger.returns += Math.floor(h.cost * 0.72);
        s.housing = {
          id: 'street',
          paidThrough: null,
          maintenanceSuspended: false,
        };
        s.story = '房契按固定折价卖出，你回到街头，资产没有被偷偷销毁。';
        break;
      }
      case 'sellEquipment': {
        requireDay(s);
        const eq = s.equipment.find((e) => e.id === action.equipmentId);
        if (!eq) throw Error('找不到设备');
        if (eq.jobId) throw Error('请先完成或放弃在制品');
        const price = Math.floor(EQUIPMENT[eq.kind].cost * 0.6);
        money(s, price, `出售${EQUIPMENT[eq.kind].name}`);
        s.ledger.returns += price;
        s.equipment = s.equipment.filter((e) => e.id !== eq.id);
        s.story = '设备按六折出售。';
        break;
      }
      case 'endLease':
        requireDay(s);
        if (HOUSING[s.housing.id].kind !== 'rent') throw Error('当前没有租约');
        s.housing = {
          id: 'street',
          paidThrough: null,
          maintenanceSuspended: false,
        };
        for (const eq of s.equipment) eq.installed = false;
        for (const facility of s.home.facilities) facility.installed = false;
        s.story =
          '已经退租。设备封存、在制品暂停；货物保留，超出容量时只能先卖货。';
        break;
      case 'maintain': {
        requireDay(s);
        if (!s.housing.maintenanceSuspended) throw Error('住宅维护正常');
        const cost =
          s.housing.paidThrough === s.life.lastDawn
            ? 0
            : HOUSING[s.housing.id].upkeep;
        money(s, -cost, '补缴住宅维护');
        s.housing.paidThrough = s.life.lastDawn;
        s.ledger.housing += cost;
        s.housing.maintenanceSuspended = false;
        s.story = '住宅维护恢复，可以重新开工。';
        break;
      }
      case 'inspect': {
        if (!s.event) throw Error('没有待查问的遭遇');
        if (s.event.inspected) throw Error('已经查问过');
        if (s.cash < 5) throw Error('查问需要5文');
        money(s, -5, '请附近人核对经过');
        s.event.inspected = true;
        log(s, s.event.inspection);
        break;
      }
      case 'choice': {
        const e = s.event;
        if (!e || e.id !== action.eventId) throw Error('这个遭遇已经处理');
        const c = e.choices.find((x) => x.id === action.id);
        if (!c) throw Error('无效选择');
        const staminaCost = c.cost.stamina ?? 0;
        if (s.cash < (c.cost.cash ?? 0) || s.stamina < staminaCost)
          throw Error('资源不足，请选择其他行动');
        if (c.cost.cash) money(s, -c.cost.cash, c.label);
        s.stamina -= staminaCost;
        const eligible = c.outcomes.filter(
          (o) => s.reputation >= (o.minRep ?? -999),
        );
        if (!eligible.length) throw Error('此选择当前不可用');
        const result = pickWeighted(s, eligible);
        effect(
          s,
          result.effect,
          e.person,
          e.family === 'bargain' && result.effect.good
            ? Math.max(0, (c.cost.cash ?? 0) - (result.effect.cash ?? 0))
            : 0,
        );
        s.story = result.text;
        log(s, result.text);
        s.event = null;
        break;
      }
      case 'return':
        if (s.event) throw Error('请先处理遭遇');
        if (returnTerms(s) && action.confirm !== returnTerms(s))
          throw Error('请先确认放弃在途订单的损失');
        for (const order of s.commerce.orders) failOrder(s, order);
        if (s.cash < s.target) throw Error(`归航需要${s.target}文现金`);
        s.beforeReturn = s.cash;
        money(s, -s.target, '支付归航费用');
        s.ending = 'return';
        s.phase = 'ended';
        s.story = '手表的光映亮你的掌心。汴梁的叫卖渐渐退去，你终于回来了。';
        break;
      case 'stay':
        s.ending = 'stay';
        s.phase = 'ended';
        s.story = '你把手表收起，决定继续留在这座城里。';
        break;
      default:
        throw Error('未知操作');
    }
    s.jobs = s.jobs
      .filter((j) => j.status === 'queued')
      .concat(s.jobs.filter((j) => j.status !== 'queued').slice(-20));
    if (s.health <= 0 && s.phase !== 'ended') {
      s.phase = 'ended';
      s.ending = 'death';
      s.deathCause = '健康耗尽';
    }
    if (s.phase === 'ended')
      for (const order of s.commerce.orders) failOrder(s, order);
    updateMilestones(s);
    s.health = clamp(s.health, 0, 100);
    s.stamina = clamp(s.stamina, 0, staminaMax(s));
    s.stats.peakAssets = Math.max(s.stats.peakAssets, assets(s));
    s.stats.maxHens = Math.max(s.stats.maxHens, s.hens.length);
    refreshIntelStatuses(s);
    s.revision++;
    const result = operationResult(state, s, action);
    if (isOperatingAction(action)) {
      s.lastResponse = operationResponse(state, s, action);
      s.operationHistory = [...(state.operationHistory ?? []), result].slice(
        -50,
      );
    }
    return { state: s, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : '操作失败';
    return {
      state,
      error,
      result: operationResult(state, state, action, error),
    };
  }
}
function dispatchInPlace(s: GameState, a: Action) {
  const r = dispatch(s, a, s.revision);
  if (r.error) throw Error(r.error);
  Object.assign(s, r.state);
}

export function rumorStatus(s: GameState, w: GameState['worlds'][number]) {
  if (s.day < w.expected) return '仍未证实';
  if (w.truth !== 'false' && s.day >= w.start) return '出现相关公开事件';
  if (s.day > w.expected + 5) return '所传时限内未兑现';
  return '仍未证实';
}
export function achievements(s: GameState) {
  return [
    ['第一笔买卖', s.stats.trades > 0],
    ['手艺入门', Object.values(s.skills).some((x) => x > 0)],
    ['产业成形', s.stats.productionRuns > 0],
    ['第一枚蛋', s.stats.eggs > 0],
    ['有处安身', s.housing.id !== 'street'],
    ['鸡舍落成', !!installed(s, 'coop')],
    ['街坊人情', s.stats.helped >= 3],
    ['命悬一线', s.stats.survivedLow],
    ['三千归航', s.ending === 'return' && s.target === 3000],
    ['万文归航', s.ending === 'return' && s.target === 30000],
  ] as [string, boolean][];
}

export function readSave(raw: string): GameState {
  try {
    const s = JSON.parse(raw) as GameState;
    if (
      s.saveRevision !== 3 ||
      s.version !== 3 ||
      !validClock(s.clock) ||
      !validContinuousSave(s)
    )
      throw Error();
    s.saveRevision = 3;
    s.operationHistory ??= [];
    if (!Array.isArray(s.operationHistory)) throw Error();
    s.operationHistory = s.operationHistory.slice(-50);
    for (const result of s.operationHistory) {
      if (
        !result ||
        typeof result.title !== 'string' ||
        typeof result.actionKey !== 'string' ||
        typeof result.success !== 'boolean' ||
        (result.depositLoss !== undefined &&
          (!Number.isSafeInteger(result.depositLoss) ||
            result.depositLoss < 0)) ||
        !Number.isSafeInteger(result.id) ||
        !Number.isSafeInteger(result.day) ||
        !Number.isSafeInteger(result.startedAt) ||
        !Number.isSafeInteger(result.finishedAt) ||
        result.startedAt < 480 ||
        result.finishedAt < result.startedAt ||
        result.finishedAt > s.clock.minute ||
        result.day !== clockDay(result.startedAt) ||
        (result.error !== undefined && typeof result.error !== 'string') ||
        (result.workRemaining !== null &&
          !Number.isSafeInteger(result.workRemaining)) ||
        (result.sale !== null &&
          result.sale !== undefined &&
          ![result.sale.revenue, result.sale.cost, result.sale.profit].every(
            Number.isFinite,
          )) ||
        (result.customers !== undefined &&
          (!Array.isArray(result.customers) ||
            result.customers.some(
              (c) =>
                !c ||
                !CUSTOMER_IDS.includes(c.id) ||
                !Number.isFinite(c.change),
            ))) ||
        (result.tradeMilestones !== undefined &&
          (!Array.isArray(result.tradeMilestones) ||
            result.tradeMilestones.some(
              (id) => !Object.hasOwn(TRADE_REWARDS, id),
            ))) ||
        (result.milestones !== undefined &&
          (!Array.isArray(result.milestones) ||
            result.milestones.some(
              (id) => !MILESTONES.some((m) => m.id === id),
            ))) ||
        ![result.cash, result.health, result.stamina].every(Number.isFinite) ||
        !Array.isArray(result.items) ||
        result.items.some(
          (i) => !GOOD_IDS.includes(i.good) || !Number.isFinite(i.quantity),
        ) ||
        !Array.isArray(result.skills) ||
        result.skills.some(
          (k) =>
            !SKILL_IDS.includes(k.skill) ||
            !Number.isFinite(k.xp) ||
            !Number.isFinite(k.level),
        ) ||
        !Array.isArray(result.states) ||
        result.states.some(
          (b) => !(b.buff in BUFFS) || typeof b.active !== 'boolean',
        ) ||
        !Array.isArray(result.jobs) ||
        result.jobs.some(
          (j) =>
            !RECIPE_MAP[j.recipeId] ||
            (j.readyAt !== null &&
              (!Number.isSafeInteger(j.readyAt) || j.readyAt < 0)),
        ) ||
        !Array.isArray(result.details) ||
        result.details.some((d) => typeof d !== 'string')
      )
        throw Error();
    }
    s.ledger.depositsPaid ??= 0;
    s.ledger.depositsReturned ??= 0;
    s.ledger.depositLosses ??= 0;
    if (!s.commerce) {
      s.commerce = newCommerce(s);
      updateMilestones(s);
    }
    const model = newGame(0);
    model.buffs = {};
    const shape = (v: unknown, t: unknown): boolean => {
      if (t === null)
        return (
          v === null ||
          typeof v === 'string' ||
          (typeof v === 'number' && Number.isFinite(v)) ||
          (!!v && typeof v === 'object')
        );
      if (Array.isArray(t)) return Array.isArray(v);
      if (typeof t === 'object')
        return (
          !!v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          Object.entries(t).every(([k, x]) =>
            shape((v as Record<string, unknown>)[k], x),
          )
        );
      return (
        typeof v === typeof t && (typeof v !== 'number' || Number.isFinite(v))
      );
    };
    if (
      !shape(s, model) ||
      !validCommerce(s) ||
      s.version !== 3 ||
      s.rules !== RULES.version ||
      ![3000, 30000].includes(s.target) ||
      !Number.isSafeInteger(s.cash) ||
      s.cash < 0 ||
      !Number.isSafeInteger(s.day) ||
      s.day < 1 ||
      !Number.isSafeInteger(s.revision) ||
      !Number.isSafeInteger(s.nextId) ||
      !Number.isInteger(s.rng) ||
      s.rng < 0 ||
      s.rng > 4294967295 ||
      !['day', 'ended'].includes(s.phase)
    )
      throw Error();
    if (
      s.health < 0 ||
      s.health > 100 ||
      s.stamina < 0 ||
      s.stamina > 100 ||
      Object.values(s.skills).some(
        (x) => !Number.isInteger(x) || x < 0 || x > 3,
      ) ||
      s.equipment.some((e) => !EQUIPMENT_IDS.includes(e.kind)) ||
      s.jobs.some((j) => !RECIPE_MAP[j.recipeId])
    )
      throw Error();
    if (
      !GOOD_IDS.every(
        (g) =>
          Number.isSafeInteger(s.prices[g].buy) &&
          Number.isSafeInteger(s.prices[g].sell) &&
          s.prices[g].buy > s.prices[g].sell,
      )
    )
      throw Error();
    return s;
  } catch {
    throw Error('存档损坏或版本不兼容，原存档未被覆盖。');
  }
}

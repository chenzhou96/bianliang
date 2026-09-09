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
  return s.health >= 70 ? 100 : s.health >= 40 ? 80 : 60;
}
export function quantity(s: GameState, g: Good) {
  return g === 'hen'
    ? s.hens.length
    : s.batches.filter((b) => b.good === g).reduce((a, b) => a + b.units, 0) /
        10;
}
export function capacity(s: GameState) {
  return HOUSING[s.housing.id].capacity;
}
export function occupied(s: GameState) {
  return s.batches.reduce((a, b) => a + b.units, 0);
}
export function reserved(s: GameState) {
  return (
    occupied(s) +
    s.jobs
      .filter((j) => j.status === 'queued')
      .reduce((a, j) => a + j.outputUnits, 0)
  );
}
export function active(s: GameState, b: Buff) {
  return (s.buffs[b] ?? 0) >= s.day;
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
  born = s.day,
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
      expires: GOODS[g].life ? born + GOODS[g].life! - 1 : null,
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
    (a, b) => (a.expires ?? 99999) - (b.expires ?? 99999) || a.id - b.id,
  );
  for (const b of s.batches) {
    if (b.good !== g || !left) continue;
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
    let factor = 1;
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
    medical: 0,
    workIncome: 0,
  };
}
export function newGame(seed: number, target: 3000 | 30000 = 3000): GameState {
  const s: GameState = {
    version: 2,
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
    buffs: { outsider: 3 },
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
  if (s.event || s.encounterDay === s.day || s.day === 1) return;
  const due = s.followups.find(
    (f) => f.due <= s.day && s.relations[f.chain] === f.source,
  );
  if (due) {
    s.followups = s.followups.filter((f) => f !== due);
    s.event = followupEvent(s, due);
  } else {
    if (!force && random(s) > 0.42) return;
    const eligible = EVENTS.filter(
      (f) =>
        s.day - (s.cooldowns[f.id] ?? -99) >= 7 &&
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
    s.cooldowns[family.id] = s.day;
    s.familyCounts[family.id] = (s.familyCounts[family.id] ?? 0) + 1;
  }
  s.encounterDay = s.day;
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
    s.buffs[e.buff] =
      s.day + (e.buff === 'regular' ? 5 : e.buff === 'cold' ? 1 : 0);
    log(s, `获得「${BUFFS[e.buff].name}」：${BUFFS[e.buff].detail}`);
  }
  if (e.help) s.stats.helped++;
  if (
    e.chain &&
    s.followups.length < 2 &&
    !s.followups.some((f) => f.chain === e.chain)
  ) {
    s.relations[e.chain] = s.day;
    s.followups.push({
      chain: e.chain,
      person,
      due: s.day + integer(s, 2, 7),
      branch: pickWeighted(s, [
        { weight: 4, b: 'gift' },
        { weight: 3, b: 'work' },
        { weight: 2, b: 'request' },
      ]).b as 'gift' | 'work' | 'request',
      source: s.day,
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
export function tradeStamina(s: GameState, g: Good, q: number) {
  const weight = q * (g === 'hen' ? 2 : RULES.tradeStaminaPerUnit);
  return (
    Math.ceil(s.daily.tradeUnits + weight - 1e-9) -
    Math.ceil(s.daily.tradeUnits - 1e-9)
  );
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
export function actionEnergy(s: GameState, a: Action) {
  if (a.type === 'trade') return tradeStamina(s, a.good, a.quantity);
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
    return (c?.cost.stamina ?? 0) + (c?.cost.ap ?? 0) * 10;
  }
  return 0;
}
export function actionPreview(s: GameState, a: Action) {
  const energy = actionEnergy(s, a);
  const result = dispatch(s, a);
  return {
    error: result.error,
    energy,
    warning:
      energy > 0 && s.stamina >= 10 && s.stamina - energy < 10
        ? '这次操作会让体力低于10：健康−2，并进入劳累。'
        : '',
  };
}

export function nightPreview(
  s: GameState,
  a: Extract<Action, { type: 'night' }>,
) {
  const validMeals = ['bread', 'egg', 'saltedEgg', 'grain', 'diner', 'none'];
  const validBeds = [
    'inn',
    'temple',
    'street',
    'room',
    'courtyard',
    'yard',
    'mansion',
  ];
  if (!validMeals.includes(a.meal) || !validBeds.includes(a.bed))
    throw Error('请选择有效的晚饭与住宿');
  if (!Number.isInteger(a.feed) || a.feed < 0 || a.feed > s.hens.length)
    throw Error('喂养数量不正确');
  const fixed = ['room', 'courtyard', 'yard', 'mansion'].includes(a.bed);
  if (fixed && a.bed !== s.housing.id) throw Error('只能使用当前住所');
  const home = HOUSING[s.housing.id];
  const mealCost = a.meal === 'diner' ? 18 : 0;
  const innCost = a.bed === 'inn' ? 30 : 0;
  const housingCost = home.upkeep;
  if (s.cash < mealCost + innCost) throw Error('现金不足以支付晚饭和临时住宿');
  const evict =
    home.kind === 'rent' && s.cash - mealCost - innCost < housingCost;
  const maintenanceSkipped =
    home.kind === 'owned' && s.cash - mealCost - innCost < housingCost;
  const paidHousing = evict || maintenanceSkipped ? 0 : housingCost;
  const feedUnits = s.skills.husbandry >= 3 ? 1 : RULES.feed;
  const grain = (a.meal === 'grain' ? 10 : 0) + a.feed * feedUnits;
  const foodNeed =
    a.meal === 'bread'
      ? 1
      : a.meal === 'egg'
        ? 2
        : a.meal === 'saltedEgg'
          ? 1
          : 0;
  if (foodNeed && quantity(s, a.meal as Good) < foodNeed)
    throw Error('晚饭库存不足');
  if (quantity(s, 'grain') * 10 < grain)
    throw Error('粟米不足，晚饭与喂鸡共用同一份库存');
  const effectiveBed =
    fixed && (evict || maintenanceSkipped) ? 'street' : a.bed;
  const healthChange =
    (a.meal === 'none' ? -8 : 0) +
    (effectiveBed === 'street' ? -3 : 0) +
    (active(s, 'cold') ? -2 : 0) +
    (a.meal !== 'none' && !['street', 'temple'].includes(effectiveBed) ? 2 : 0);
  const recovery =
    effectiveBed === 'inn'
      ? 55
      : effectiveBed === 'temple'
        ? 35
        : effectiveBed === 'street'
          ? 20
          : home.recovery;
  const food = foodNeed
    ? `${GOODS[a.meal as Good].name} −${foodNeed}`
    : a.meal === 'grain'
      ? '粟米 −1'
      : a.meal === 'diner'
        ? '食肆用餐'
        : '不吃饭';
  const nextHealth = clamp(s.health + healthChange, 0, 100);
  return {
    cash: mealCost + innCost + paidHousing,
    mealCost,
    innCost,
    housingCost: paidHousing,
    grain: grain / 10,
    feedUnits,
    food,
    evict,
    maintenanceSkipped,
    effectiveBed,
    healthChange,
    recovery: clamp(
      recovery +
        (a.meal === 'diner' || active(s, 'warm') ? 5 : 0) -
        (a.meal === 'none' ? 10 : 0),
      0,
      nextHealth >= 70 ? 100 : nextHealth >= 40 ? 80 : 60,
    ),
    unfed: s.hens.slice(a.feed).map((h) => h.id),
  };
}

function completeJobs(s: GameState) {
  for (const j of s.jobs.filter((x) => x.status === 'queued')) {
    if (
      !s.equipment.find((e) => e.id === j.equipmentId)?.installed ||
      s.housing.maintenanceSuspended
    ) {
      j.readyDay++;
      continue;
    }
    if (j.readyDay > s.day) continue;
    const r = RECIPE_MAP[j.recipeId] as Recipe;
    const eq = s.equipment.find((e) => e.id === j.equipmentId);
    if (eq) eq.jobId = null;
    j.status = 'ready';
    gainXp(s, r.industry, j.quantity);
    add(s, r.output, j.outputUnits, j.inputCost, 'production', s.day);
    log(
      s,
      `生产完成：${r.name} ×${j.quantity}。`,
      0,
      `${GOODS[r.output].name} +${j.outputUnits / 10}`,
    );
  }
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
function settleNight(s: GameState, a: Extract<Action, { type: 'night' }>) {
  if (s.phase !== 'night' || s.event) throw Error('现在不能结算夜晚');
  const p = nightPreview(s, a);
  money(s, -p.cash, '晚饭、住宿与住宅费用');
  s.ledger.living += p.mealCost + p.innCost;
  s.ledger.housing += p.housingCost;
  if (p.evict) {
    s.housing = {
      id: 'street',
      paidThrough: null,
      maintenanceSuspended: false,
    };
    for (const e of s.equipment) e.installed = false;
    log(s, '无力付租，退回街头；设备封存，生产暂停，货物保留。');
  } else s.housing.maintenanceSuspended = p.maintenanceSkipped;
  if (p.maintenanceSkipped) log(s, '维护暂停：新开工与住宅恢复停用。');
  if (a.meal === 'bread') s.ledger.living += consume(s, 'bread', 10).cost;
  if (a.meal === 'egg') s.ledger.living += consume(s, 'egg', 20).cost;
  if (a.meal === 'saltedEgg')
    s.ledger.living += consume(s, 'saltedEgg', 10).cost;
  if (a.meal === 'grain') s.ledger.living += consume(s, 'grain', 10).cost;
  if (a.feed) {
    const c = consume(s, 'grain', a.feed * p.feedUnits);
    s.ledger.feed += c.cost;
    s.ledger.feedPending += c.cost;
    s.stats.feedCost += c.cost;
    if (s.skills.husbandry > 0) gainXp(s, 'husbandry', a.feed);
    log(s, `喂养${a.feed}只母鸡。`, 0, `粟米 −${(a.feed * p.feedUnits) / 10}`);
  }
  s.health = clamp(s.health + p.healthChange, 0, 100);
  s.stamina = p.recovery;
  const theft =
    p.effectiveBed === 'temple' ? 0.1 : p.effectiveBed === 'street' ? 0.2 : 0;
  if (theft && random(s) < theft) {
    const loss = Math.min(50, Math.floor(s.cash * 0.1));
    money(s, -loss, '夜间失窃');
    s.ledger.losses += loss;
  }
  const coop = installed(s, 'coop');
  let eggs = 0,
    dead = 0;
  s.hens = s.hens.filter((h, i) => {
    if (i < a.feed) {
      h.hunger = 0;
      if (
        random(s) <
        (coop ? RULES.coopChance : RULES.eggChance) +
          (s.skills.husbandry >= 2 ? 0.1 : 0)
      )
        eggs++;
    } else h.hunger++;
    if (h.hunger >= 3) {
      dead++;
      return false;
    }
    return true;
  });
  if (eggs) {
    add(s, 'egg', eggs * 10, s.ledger.feedPending, 'production', s.day + 1);
    s.ledger.feedPending = 0;
    s.stats.eggs += eggs;
  }
  for (const b of s.batches)
    if (b.expires !== null && b.expires <= s.day) {
      s.ledger.losses += b.cost;
      log(s, '过期货物已丢弃。', 0, `${GOODS[b.good].name} −${b.units / 10}`);
    }
  s.batches = s.batches.filter((b) => b.expires === null || b.expires > s.day);
  log(
    s,
    `夜间结算：健康${s.health}，体力${s.stamina}；产蛋${eggs}枚${dead ? `，${dead}只母鸡死亡` : ''}。`,
  );
  if (s.health <= 0) {
    s.ending = 'death';
    s.phase = 'ended';
    s.deathCause = '健康耗尽';
    s.story = '城里的叫卖声渐渐远了。你的旅程在这一夜结束。';
    return;
  }
  if (s.health < 10 && !s.stats.lowDay) s.stats.lowDay = s.day;
  s.stats.survivedLow = !!s.stats.lowDay;
  s.day++;
  s.stats.days = s.day;
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
  for (const b of Object.keys(s.buffs) as Buff[])
    if (!active(s, b)) delete s.buffs[b];
  completeJobs(s);
  s.weather = random(s) < 0.2 ? '阴' : '晴';
  updatePrices(s);
  for (const w of s.worlds.filter(
    (w) => w.truth !== 'false' && w.start === s.day,
  ))
    log(s, w.publicText);
  s.phase = 'day';
  s.story = `第${s.day}日，街市渐渐醒来。昨夜产蛋${eggs}枚，完成的货物已经入库。`;
}

function addIntel(
  s: GameState,
  t: (typeof INFO_TEMPLATES)[number],
  world?: GameState['worlds'][number],
) {
  const semantic = t.semantic;
  s.intelSeen[semantic] = s.day;
  s.intelSeen[`skeleton:${t.skeleton}`] = s.day;
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
    if (active(s, 'outsider')) {
      world.clueKnown = true;
      entry.followUp = `初来乍到，伙计多说了一句：${world.clue}`;
    }
  }
  s.intel.unshift(entry);
  s.intel = s.intel.slice(0, RULES.maxIntel);
}
function refreshIntelStatuses(s: GameState) {
  for (const i of s.intel) {
    if (i.status !== 'new') continue;
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
    night: '夜间结算',
    endDay: '安排今晚',
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

export function dispatch(
  state: GameState,
  action: Action,
  expectedRevision = state.revision,
): { state: GameState; error?: string } {
  if (expectedRevision !== state.revision)
    return { state, error: '操作已更新，请勿重复提交' };
  if (state.phase === 'ended') return { state, error: '本局已经结束' };
  const s = structuredClone(state);
  try {
    switch (action.type) {
      case 'market':
        if (s.phase !== 'day' || s.event) throw Error('请先处理当前安排');
        s.phase = 'market';
        s.story =
          '州桥市。看行情免费，搬运货物才消耗体力；同一次访问可连续买卖。';
        break;
      case 'leave':
        if (s.phase !== 'market') throw Error('你不在市场');
        s.phase = 'day';
        s.story = '你收好钱袋，离开州桥市。';
        finishAction(s);
        break;
      case 'trade': {
        if (s.phase !== 'market' || s.event) throw Error('请先进入市场');
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
        const costStamina = tradeStamina(s, g, q);
        if (s.stamina < costStamina) throw Error(`搬运需要${costStamina}体力`);
        const p = quote(s, g),
          u = Math.round(q * 10);
        if (action.side === 'buy') {
          const cost = Math.ceil(p.buy * q);
          if (s.cash < cost) throw Error('现金不足');
          if (g === 'hen') {
            if (s.hens.length + q > henCapacity(s))
              throw Error('当前养殖容量不足');
            for (let i = 0; i < q; i++)
              s.hens.push({ id: s.nextId++, hunger: 0, cost: p.buy });
          } else {
            if (reserved(s) + u > capacity(s)) throw Error('仓储容量不足');
            add(s, g, u, cost, 'buy');
          }
          money(s, -cost, `买入${GOODS[g].name} ×${q}`);
          s.ledger.purchases += cost;
        } else {
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
              s.ledger.productionRevenue += Math.floor(
                (income * c.production) / u,
              );
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
        break;
      }
      case 'tea': {
        requireDay(s);
        if (s.teaDay === s.day) throw Error('今天已经听过消息');
        if (s.cash < 8) throw Error('茶钱不足');
        money(s, -8, '茶馆听消息');
        s.ledger.living += 8;
        s.teaDay = s.day;
        const candidates: typeof INFO_TEMPLATES = [];
        const eligible = INFO_TEMPLATES.filter(
          (t) =>
            s.day - (s.intelSeen[t.semantic] ?? -99) >= 20 &&
            s.day - (s.intelSeen[`skeleton:${t.skeleton}`] ?? -99) >= 7,
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
        let heardMarket = false;
        for (const t of candidates) {
          const w = heardMarket ? undefined : s.worlds.find(
            (x) => !x.heard && x.expected >= s.day && x.expected <= s.day + 14 &&
              s.day - (s.intelSeen[`market:${x.family}`] ?? -99) >= 7,
          );
          if (w) {
            heardMarket = true;
            s.intelSeen[`market:${w.family}`] = s.day;
          }
          addIntel(s, t, w);
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
        if (asking ? entry.asked : entry.visited)
          throw Error('这次核对已经做过');
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
        s.story = entry.followUp;
        break;
      }
      case 'short':
      case 'heavy': {
        requireDay(s);
        if (s.daily.work >= RULES.maxWorkPerDay)
          throw Error('今日已做满两次短工或重活');
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
        if (s.daily.rest) throw Error('今天已经休息过');
        s.daily.rest = 1;
        s.stamina = Math.min(staminaMax(s), s.stamina + RULES.restStamina);
        delete s.buffs.tired;
        s.story =
          '你坐下歇脚，恢复25体力。今天还可以做别的事，但不能靠休息无限劳动。';
        finishAction(s, false);
        break;
      case 'snack':
        requireDay(s);
        if (s.daily.snack) throw Error('今天已经加餐过');
        if (s.cash < 6) throw Error('加餐需要6文');
        money(s, -6, '加餐');
        s.ledger.living += 6;
        s.daily.snack = 1;
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
        if (
          HOUSING[s.housing.id].slots <=
          s.equipment.filter((e) => e.installed).length
        )
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
                  b.good === g && (b.expires === null || b.expires >= s.day),
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
          readyDay: s.day + r.duration,
          inputCost,
          outputUnits,
          status: r.duration ? 'queued' : 'ready',
        };
        s.jobs.push(job);
        if (r.duration) eq.jobId = job.id;
        else add(s, r.output, outputUnits, inputCost, 'production', s.day);
        s.story = r.duration
          ? `${r.name}已开工，${r.duration}夜后完成。原料和成品仓位都已锁定。`
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
          h.slots < s.equipment.filter((e) => e.installed).length ||
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
        s.story =
          '已经退租。设备封存、在制品暂停；货物保留，超出容量时只能先卖货。';
        break;
      case 'maintain': {
        requireDay(s);
        if (!s.housing.maintenanceSuspended) throw Error('住宅维护正常');
        const cost = HOUSING[s.housing.id].upkeep;
        money(s, -cost, '补缴住宅维护');
        s.ledger.housing += cost;
        s.housing.maintenanceSuspended = false;
        s.story = '住宅维护恢复，可以重新开工。';
        break;
      }
      case 'endDay':
        requireDay(s);
        s.phase = 'night';
        s.story = '天色渐暗。请统一安排晚饭、住宿和喂鸡，夜间会一次结算。';
        break;
      case 'night':
        settleNight(s, action);
        break;
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
        const staminaCost = (c.cost.stamina ?? 0) + (c.cost.ap ?? 0) * 10;
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
    if (
      actionEnergy(state, action) > 0 &&
      state.stamina >= 10 &&
      state.stamina - actionEnergy(state, action) < 10
    ) {
      s.health -= 2;
      s.buffs.tired = s.day + 1;
      log(s, '体力低于10，健康−2，进入劳累。');
    }
    s.jobs = s.jobs
      .filter((j) => j.status === 'queued')
      .concat(s.jobs.filter((j) => j.status !== 'queued').slice(-20));
    if (s.health <= 0 && s.phase !== 'ended') {
      s.phase = 'ended';
      s.ending = 'death';
      s.deathCause = '健康耗尽';
    }
    s.health = clamp(s.health, 0, 100);
    s.stamina = clamp(s.stamina, 0, staminaMax(s));
    s.stats.peakAssets = Math.max(s.stats.peakAssets, assets(s));
    s.stats.maxHens = Math.max(s.stats.maxHens, s.hens.length);
    refreshIntelStatuses(s);
    s.revision++;
    s.lastResponse = operationResponse(state, s, action);
    return { state: s };
  } catch (e) {
    return { state, error: e instanceof Error ? e.message : '操作失败' };
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
      s.version === 2 &&
      s.rules === RULES.version &&
      s.ledger &&
      !('purchases' in s.ledger)
    ) {
      // Old totals double-counted costs and cannot be reconstructed from bounded logs.
      s.ledger = { ...emptyLedger(), sinceDay: s.day };
      if (s.housing) s.housing.maintenanceSuspended ??= false;
      s.intel = s.intel.filter((i) =>
        INFO_TEMPLATES.some((t) => t.id === i.templateId),
      );
      s.story =
        '旧局已保留，修正后的分类账从本日重新记账；历史资产和进度不变。';
    }
    s.intel = s.intel.filter(
      (i) => i.reportVersion === 2 || i.worldId !== undefined,
    );
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
      s.version !== 2 ||
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
      !['day', 'market', 'night', 'ended'].includes(s.phase)
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

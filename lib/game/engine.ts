import { GOODS, GOOD_IDS, RULES, WORLD_FAMILIES, BUFFS } from './config.ts';
import { EVENTS, out, option, decline } from './content.ts';
import type {
  Action,
  Batch,
  Buff,
  Effect,
  EventInstance,
  GameState,
  Good,
  Price,
  ScheduledFollowUp,
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
export function quantity(s: GameState, g: Good) {
  return g === 'hen'
    ? s.hens.length
    : s.batches.filter((b) => b.good === g).reduce((a, b) => a + b.units, 0) /
        10;
}
export function capacity(s: GameState) {
  return s.rented ? RULES.homeCapacity : RULES.capacity;
}
export function occupied(s: GameState) {
  return s.batches.reduce((a, b) => a + b.units, 0);
}
export function active(s: GameState, b: Buff) {
  return (s.buffs[b] ?? 0) >= s.day;
}
export function quote(s: GameState, g: Good): Price {
  const p = s.prices[g];
  return {
    sell: p.sell,
    buy:
      g === 'grain' && active(s, 'regular')
        ? Math.max(p.sell + 1, Math.round(p.buy * 0.95))
        : p.buy,
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
}
function money(s: GameState, amount: number, text: string) {
  const actual = Math.max(-s.cash, Math.round(amount));
  s.cash += actual;
  log(s, text, actual);
}
function add(
  s: GameState,
  g: Good,
  units: number,
  cost = 0,
  origin: Batch['origin'] = 'gift',
  born = s.day,
) {
  const room = Math.max(0, capacity(s) - occupied(s));
  const accepted = Math.min(
    units,
    g === 'grain' ? room : Math.floor(room / 10) * 10,
  );
  if (accepted > 0)
    s.batches.push({
      id: s.nextId++,
      good: g,
      units: accepted,
      cost: Math.round((cost * accepted) / units),
      origin,
      expires: GOODS[g].life ? born + GOODS[g].life! - 1 : null,
    });
  if (accepted < units)
    log(
      s,
      '行囊装不下，多余货物记为损耗。',
      0,
      `${GOODS[g].name}损耗 ${(units - accepted) / 10}`,
    );
  return accepted;
}
function consume(s: GameState, g: Good, units: number) {
  let left = units,
    cost = 0,
    production = 0,
    productionCost = 0;
  s.batches.sort(
    (a, b) => (a.expires ?? 999) - (b.expires ?? 999) || a.id - b.id,
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
  for (let expected = 2; expected <= 30; expected += 2) {
    const f =
      expected === 2
        ? WORLD_FAMILIES[1]
        : expected === 4
          ? WORLD_FAMILIES[0]
          : WORLD_FAMILIES[integer(s, 0, 5)];
    const roll = random(s);
    const truth =
      roll < 0.5
        ? 'normal'
        : roll < 0.7
          ? 'delay'
          : roll < 0.85
            ? 'small'
            : 'false';
    const source = integer(s, 0, 2);
    s.worlds.push({
      id: s.nextId++,
      family: f.id,
      name: f.name,
      good: f.good,
      expected,
      start: expected + (truth === 'delay' ? integer(s, 1, 3) : 0),
      duration: integer(s, 2, 4),
      factor:
        truth === 'false'
          ? 1
          : 1 +
            (f.factor - 1) * (truth === 'small' ? 0.25 : 0.8 + random(s) * 0.4),
      truth,
      publicText: f.publicText,
      heard: false,
      clueKnown: false,
      source: ['跑码头的茶客', '邻桌的货商', '街口的闲谈'][source],
      clue:
        truth === 'normal'
          ? '有人见过相关货单，但执行规模还不清楚。'
          : truth === 'delay'
            ? '有关的人说正在安排，日期还没有定稳。'
            : truth === 'small'
              ? '有人见过零星货物，数量似乎没有传得那么多。'
              : '追问具体出处，几个人的说法对不上。',
    });
  }
}
export function updatePrices(s: GameState) {
  if (s.day >= s.trendUntil) {
    for (const g of GOOD_IDS) s.trend[g] = 0.82 + random(s) * 0.36;
    s.trendUntil = s.day + integer(s, 3, 5);
  }
  for (const g of GOOD_IDS) {
    const base = GOODS[g].base;
    let factor = 1;
    for (const w of s.worlds)
      if (
        w.good === g &&
        w.truth !== 'false' &&
        s.day >= w.start &&
        s.day < w.start + w.duration
      )
        factor *= w.factor;
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
  s.history = s.history.slice(-7);
}
export function newGame(seed: number): GameState {
  const s: GameState = {
    version: 1,
    rules: RULES.version,
    seed: seed >>> 0,
    rng: seed >>> 0,
    revision: 0,
    nextId: 1,
    day: 1,
    phase: 'day',
    cash: 800,
    health: 100,
    stamina: 80,
    reputation: 0,
    ap: 2,
    rented: false,
    coop: false,
    teaDay: 0,
    encounterDay: 0,
    weather: '晴',
    batches: [],
    hens: [],
    buffs: { outsider: 3 },
    prices: {} as Record<Good, Price>,
    history: [],
    trend: {} as Record<Good, number>,
    trendUntil: 4,
    worlds: [],
    event: null,
    followups: [],
    relations: {},
    seen: [],
    cooldowns: {},
    familyCounts: {},
    logs: [],
    story:
      '你在东京城外醒来。手机没有信号，手表却亮着：三十日内，积累三贯，即可归航。兜里的八百文轻轻碰响，远处有人叫卖刚出炉的炊饼。',
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
    },
  };
  for (const g of GOOD_IDS) {
    s.prices[g] = { buy: GOODS[g].base, sell: GOODS[g].firstSell };
    s.trend[g] = 1;
  }
  add(s, 'bread', 20);
  add(s, 'grain', 20);
  makeWorlds(s);
  s.history.push({ day: 1, prices: structuredClone(s.prices) });
  log(s, '你带着800文、两个炊饼和两份粟米来到汴梁。');
  return s;
}
function followupEvent(s: GameState, f: ScheduledFollowUp): EventInstance {
  const isWidow = f.chain === 'widow';
  const title = isWidow ? '故人捎来口信' : '码头又见';
  const intro = `${f.person}认出了你，提起第${f.source}日你帮忙的事。`;
  const choices =
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
      : f.branch === 'work'
        ? [
            option(
              'accept',
              isWidow ? '接受引荐' : '帮忙搬货',
              isWidow
                ? '没有额外成本；介绍认识粮商。'
                : '消耗1行动点、20体力；约定报酬70文。',
              isWidow ? {} : { ap: 1, stamina: 20 },
              [
                out(
                  1,
                  isWidow
                    ? '粮商听了经过，愿意给你五日粟米熟客价。'
                    : '阿成照约定付了70文，你们在码头道别。',
                  isWidow ? { buff: 'regular' } : { cash: 70 },
                ),
              ],
            ),
            decline,
          ]
        : [
            option(
              'accept',
              '再帮一回',
              '支付15文；对方没有承诺回报。',
              { cash: 15 },
              [
                out(6, `${f.person}道谢后离开。这次帮助没有带来额外收益。`, {
                  help: true,
                  reputation: 1,
                }),
                out(4, `${f.person}过意不去，分了一块炊饼给你。`, {
                  good: 'bread',
                  units: 10,
                  help: true,
                  reputation: 1,
                }),
              ],
            ),
            decline,
          ];
  return {
    id: s.nextId++,
    family: 'followup',
    variant: f.branch,
    person: f.person,
    title,
    text:
      intro +
      (f.branch === 'gift'
        ? '这回带来了一点心意。'
        : f.branch === 'work'
          ? '这回有个机会，问你是否愿意。'
          : '这回又遇到一件小难事。'),
    clue: '是你先前认识的人，你认得对方。',
    hiddenFact: f.branch,
    inspection: '你们核对了旧事，对方确实是那个人。',
    inspected: false,
    choices,
  };
}
export function maybeEncounter(s: GameState, force = false) {
  if (s.event || s.encounterDay === s.day || s.day === 1) return;
  const due = s.followups.find(
    (f) => f.due <= s.day && s.relations[f.chain] === f.source,
  );
  if (due) {
    s.followups = s.followups.filter((f) => f !== due);
    s.event = followupEvent(s, due);
  } else {
    if (!force && random(s) > 0.48) return;
    const eligible = EVENTS.filter(
      (f) =>
        s.day - (s.cooldowns[f.id] ?? -99) >= RULES.cooldown &&
        f.variants.some((v) => !s.seen.includes(`${f.id}:${v.id}`)),
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
      (v) => !s.seen.includes(`${family.id}:${v.id}`),
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
    s.seen.push(`${family.id}:${v.id}`);
    s.cooldowns[family.id] = s.day;
    s.familyCounts[family.id] = (s.familyCounts[family.id] ?? 0) + 1;
  }
  s.encounterDay = s.day;
  s.stats.events++;
  log(s, `路遇：${s.event.title}。`);
}
function effect(s: GameState, e: Effect, person: string, acquisitionCost = 0) {
  if (e.cash) money(s, e.cash, '遭遇收支');
  if (e.good && e.units) {
    add(s, e.good, e.units, acquisitionCost, acquisitionCost ? 'buy' : 'gift');
    log(s, '遭遇带来货物变化。', 0, `${GOODS[e.good].name} +${e.units / 10}`);
  }
  s.health = clamp(s.health + (e.health ?? 0), 0, 100);
  s.stamina = clamp(s.stamina + (e.stamina ?? 0), 0, 100);
  s.reputation += e.reputation ?? 0;
  if (e.health) log(s, `健康 ${e.health > 0 ? '+' : ''}${e.health}`);
  if (e.stamina) log(s, `体力 ${e.stamina > 0 ? '+' : ''}${e.stamina}`);
  if (e.reputation) log(s, `名声 +${e.reputation}`);
  if (e.buff) {
    s.buffs[e.buff] =
      s.day + (e.buff === 'regular' ? 4 : e.buff === 'cold' ? 1 : 0);
    log(s, `获得「${BUFFS[e.buff].name}」：${BUFFS[e.buff].detail}`);
  }
  if (e.help) s.stats.helped++;
  if (
    e.chain &&
    s.followups.length < 2 &&
    !s.followups.some((f) => f.chain === e.chain)
  ) {
    s.relations[e.chain] = s.day;
    const branch = pickWeighted(s, [
      { weight: 4, b: 'gift' },
      { weight: s.reputation >= 3 ? 4 : 2, b: 'work' },
      { weight: 2, b: 'request' },
    ]).b as ScheduledFollowUp['branch'];
    s.followups.push({
      chain: e.chain,
      person,
      due: s.day + integer(s, 2, 5),
      branch,
      source: s.day,
    });
  }
}
function requireDay(s: GameState) {
  if (s.phase !== 'day' || s.event)
    throw Error('请先结束当前访问或处理眼前的遭遇');
}
function spendAP(s: GameState, n = 1) {
  if (s.ap < n) throw Error('今日行动点不足');
  s.ap -= n;
}
function finishAction(s: GameState, encounter = true) {
  if (encounter) maybeEncounter(s);
  if (!s.ap) s.phase = 'night';
}
export function nightPreview(
  s: GameState,
  a: Extract<Action, { type: 'night' }>,
) {
  if (
    !['bread', 'egg', 'grain', 'diner', 'none'].includes(a.meal) ||
    !['inn', 'temple', 'street', 'home'].includes(a.bed)
  )
    throw Error('请选择有效的晚饭与住宿');
  if (!Number.isInteger(a.feed) || a.feed < 0 || a.feed > s.hens.length)
    throw Error('喂养数量不正确');
  if (a.bed === 'home' && !s.rented) throw Error('尚未租房');
  const cash = (a.meal === 'diner' ? 18 : 0) + (a.bed === 'inn' ? 30 : 0);
  const grain = (a.meal === 'grain' ? 10 : 0) + a.feed * RULES.feed;
  if (s.cash < cash) throw Error('现金不足以支付本次晚饭和住宿');
  if (quantity(s, 'grain') * 10 < grain)
    throw Error('粟米不足，晚饭与喂鸡共用同一份库存');
  if (a.meal === 'bread' && quantity(s, 'bread') < 1) throw Error('没有炊饼');
  if (a.meal === 'egg' && quantity(s, 'egg') < 2) throw Error('需要两枚鸡蛋');
  return {
    cash,
    grain: grain / 10,
    food: a.meal === 'bread' ? '炊饼 −1' : a.meal === 'egg' ? '鸡蛋 −2' : '',
    unfed: s.hens.slice(a.feed).map((h) => h.id),
  };
}
function settleNight(s: GameState, a: Extract<Action, { type: 'night' }>) {
  if (s.phase !== 'night' || s.event) throw Error('现在不能结算夜晚');
  const p = nightPreview(s, a);
  money(s, -p.cash, '晚饭与住宿');
  if (a.meal === 'bread') consume(s, 'bread', 10);
  if (a.meal === 'egg') consume(s, 'egg', 20);
  if (a.meal === 'grain') consume(s, 'grain', 10);
  if (a.meal !== 'none')
    log(
      s,
      '吃过晚饭。',
      0,
      p.food || (a.meal === 'grain' ? '粟米 −1' : '食肆用餐'),
    );
  const feedCost = a.feed ? consume(s, 'grain', a.feed * RULES.feed).cost : 0;
  s.stats.feedCost += feedCost;
  if (a.feed)
    log(
      s,
      `喂养${a.feed}只母鸡；饲料批次成本${feedCost}文。`,
      0,
      `粟米 −${a.feed * 0.2}`,
    );
  if (a.meal === 'none') s.health -= 8;
  if (a.bed === 'street') s.health -= 3;
  if (active(s, 'cold')) s.health -= 2;
  if (a.meal !== 'none' && ['inn', 'home'].includes(a.bed)) s.health += 2;
  s.health = clamp(s.health, 0, 100);
  s.stamina = ['inn', 'home'].includes(a.bed)
    ? 100
    : Math.min(100, s.stamina + (a.bed === 'temple' ? 35 : 20));
  if (a.meal === 'none') s.stamina -= 10;
  if (a.meal === 'diner' || active(s, 'warm')) s.stamina += 5;
  s.stamina = clamp(s.stamina, 0, 100);
  const theft = a.bed === 'temple' ? 0.1 : a.bed === 'street' ? 0.2 : 0;
  if (theft && random(s) < theft) {
    const loss = Math.min(50, Math.floor(s.cash * 0.1));
    money(
      s,
      -loss,
      loss ? '夜间有人摸走了部分铜钱。' : '夜里有人翻动钱袋，没有钱可偷。',
    );
  }
  log(s, `夜间结算：健康${s.health}，体力${s.stamina}。`);
  if (s.health <= 0) {
    s.ending = 'death';
    s.phase = 'ended';
    s.deathCause =
      a.meal === 'none'
        ? '饥饿与夜间消耗'
        : active(s, 'cold')
          ? '风寒与露宿消耗'
          : '露宿消耗';
    s.story = '城里的叫卖声渐渐远了。你的旅程在这一夜结束。';
    return;
  }
  let eggs = 0,
    dead = 0;
  s.hens = s.hens.filter((h, i) => {
    if (i < a.feed) {
      h.hunger = 0;
      if (random(s) < (s.coop ? RULES.coopChance : RULES.eggChance)) eggs++;
    } else h.hunger++;
    if (h.hunger >= 3) {
      dead++;
      return false;
    }
    return true;
  });
  if (eggs) {
    add(s, 'egg', eggs * 10, feedCost, 'production', s.day + 1);
    s.stats.eggs += eggs;
  }
  log(
    s,
    `母鸡产蛋${eggs}枚${dead ? `，${dead}只因连续断粮死亡` : ''}。`,
    0,
    eggs ? `鸡蛋 +${eggs}` : '',
  );
  for (const b of s.batches.filter(
    (b) => b.expires !== null && b.expires <= s.day,
  ))
    log(s, '食物过期，已丢弃。', 0, `${GOODS[b.good].name} −${b.units / 10}`);
  s.batches = s.batches.filter((b) => b.expires === null || b.expires > s.day);
  if (s.stats.lowDay && s.day >= s.stats.lowDay) s.stats.survivedLow = true;
  if (s.day === RULES.days) {
    s.phase = 'last';
    s.story = '第三十夜，手表发出最后一次微光。现在决定是否归航。';
    return;
  }
  s.day++;
  s.ap = 2;
  s.phase = 'day';
  for (const b of Object.keys(s.buffs) as Buff[])
    if (!active(s, b)) delete s.buffs[b];
  s.weather = s.worlds.some(
    (w) =>
      w.family === 'rain' &&
      w.truth !== 'false' &&
      s.day >= w.start &&
      s.day < w.start + w.duration,
  )
    ? '雨'
    : random(s) < 0.2
      ? '阴'
      : '晴';
  updatePrices(s);
  const news = s.worlds.filter((w) => w.truth !== 'false' && w.start === s.day);
  for (const w of news) log(s, w.publicText);
  s.story = `第${s.day}日，${s.weather === '雨' ? '檐下滴着水，街上的脚步慢了些。' : '街市渐渐醒来，你又有两次行动的机会。'}昨夜产蛋${eggs}枚。${news.map((w) => w.publicText).join('')}`;
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
        requireDay(s);
        spendAP(s);
        s.phase = 'market';
        s.story =
          '州桥市。货主摊开货物，报的是今天的价。同一次访问内可以继续买卖，离开才结束。';
        break;
      case 'leave':
        if (s.phase !== 'market') throw Error('你不在市场');
        s.phase = 'day';
        s.story = '你收好钱袋，离开州桥市。';
        finishAction(s);
        break;
      case 'trade': {
        if (s.phase !== 'market' || s.event)
          throw Error('先花一个行动点进入市场');
        if (
          !GOOD_IDS.includes(action.good) ||
          !['buy', 'sell'].includes(action.side)
        )
          throw Error('无效商品或交易方向');
        const q = action.quantity,
          g = action.good;
        if (
          !Number.isFinite(q) ||
          q <= 0 ||
          q > 100000 ||
          Math.abs(q * 10 - Math.round(q * 10)) > 1e-8 ||
          (g !== 'grain' && !Number.isInteger(q))
        )
          throw Error('数量须为正数；仅粟米支持一位小数');
        const p = quote(s, g),
          u = Math.round(q * 10);
        if (action.side === 'buy') {
          const cost = Math.ceil(p.buy * q);
          if (cost > s.cash) throw Error('现金不足');
          if (g === 'hen') {
            if (s.hens.length + q > (s.coop ? 12 : 3))
              throw Error('养鸡位置不足');
            for (let i = 0; i < q; i++)
              s.hens.push({ id: s.nextId++, hunger: 0, cost: p.buy });
          } else {
            if (occupied(s) + u > capacity(s)) throw Error('行囊容量不足');
            add(s, g, u, cost, 'buy');
          }
          money(s, -cost, `买入${GOODS[g].name} ×${q}`);
          log(s, '货物入账', 0, `${GOODS[g].name} +${q}`);
        } else {
          if (quantity(s, g) < q) throw Error('货物不足');
          const income = Math.floor(p.sell * q);
          if (g === 'hen') {
            const cost = s.hens
              .splice(0, q)
              .reduce((sum, h) => sum + h.cost, 0);
            s.stats.profit += income - cost;
            s.stats.maxProfit = Math.max(s.stats.maxProfit, income - cost);
          } else {
            const c = consume(s, g, u);
            if (c.production) {
              s.stats.eggRevenue += Math.floor((income * c.production) / u);
              s.stats.productionCostSold += c.productionCost;
            }
            if (c.production < u) {
              const profit =
                Math.floor((income * (u - c.production)) / u) -
                (c.cost - c.productionCost);
              s.stats.profit += profit;
              s.stats.maxProfit = Math.max(s.stats.maxProfit, profit);
            }
          }
          money(s, income, `卖出${GOODS[g].name} ×${q}`);
          log(s, '货物出账', 0, `${GOODS[g].name} −${q}`);
        }
        s.stats.trades++;
        s.story = s.logs.at(-2)!.text;
        break;
      }
      case 'tea': {
        requireDay(s);
        if (s.teaDay === s.day) throw Error('今天已经听过消息');
        if (s.cash < 8) throw Error('茶钱不足');
        spendAP(s);
        money(s, -8, '茶馆听消息');
        s.teaDay = s.day;
        const candidates = s.worlds
          .filter(
            (w) => w.expected >= s.day && w.expected <= s.day + 6 && !w.heard,
          )
          .slice(0, 3);
        candidates.forEach((w) => {
          w.heard = true;
          w.clueKnown = active(s, 'outsider') || s.reputation >= 3;
        });
        s.story =
          '你端着一碗热茶，听各桌人谈天。' +
          (candidates.length
            ? '几条说法已记入情报簿。消息有出处，也有没说清的地方。'
            : '今天没听到新的消息。茶客反复谈着旧事。');
        finishAction(s);
        break;
      }
      case 'short':
      case 'heavy': {
        requireDay(s);
        const heavy = action.type === 'heavy',
          cost =
            (heavy ? RULES.heavyEnergy : RULES.shortEnergy) +
            (active(s, 'tired') ? 5 : 0);
        if (s.stamina < cost) throw Error(`体力不足，需要${cost}`);
        if (heavy && s.health < 40) throw Error('重活需要健康至少40');
        spendAP(s);
        s.stamina -= cost;
        const wage = heavy ? RULES.heavyWage : RULES.shortWage;
        money(s, wage, '码头劳动所得');
        s.stats.workIncome += wage;
        s.story = '货物一包包抬上岸。工头点好铜钱交给你，今天的工钱已到手。';
        finishAction(s);
        break;
      }
      case 'rest':
        requireDay(s);
        spendAP(s);
        s.stamina = Math.min(100, s.stamina + 30);
        delete s.buffs.tired;
        s.story = '你找了个安静角落歇脚，腿脚渐渐缓过来。体力恢复30，上限100。';
        log(s, s.story);
        finishAction(s, false);
        break;
      case 'rent':
      case 'coop': {
        requireDay(s);
        const renting = action.type === 'rent',
          cost = renting ? RULES.rent : RULES.coop;
        if (renting ? s.rented : s.coop) throw Error('已经拥有这项资产');
        if (!renting && !s.rented) throw Error('先租住房屋才能建鸡舍');
        if (s.cash < cost) throw Error('现金不足');
        spendAP(s);
        money(s, -cost, renting ? '租房至本局结束' : '建造鸡舍');
        if (renting) s.rented = true;
        else s.coop = true;
        s.story = renting
          ? '小屋的门闩合上。接下来的日子，你终于有自己的落脚处。'
          : '木匠交付了鸡舍。母鸡有了地方安顿，最多可养十二只。';
        finishAction(s, false);
        break;
      }
      case 'endDay':
        requireDay(s);
        s.ap = 0;
        s.phase = 'night';
        s.story = '天色渐暗，该安排今晚的饭食与落脚处了。';
        break;
      case 'night':
        settleNight(s, action);
        break;
      case 'inspect': {
        if (!s.event) throw Error('没有待查问的遭遇');
        if (s.event.inspected) throw Error('已经查问过');
        if (s.cash < 5) throw Error('查问需要5文');
        money(s, -5, '请附近人帮忙核对经过');
        s.event.inspected = true;
        log(s, s.event.inspection);
        break;
      }
      case 'choice': {
        const e = s.event;
        if (!e || e.id !== action.eventId) throw Error('这个遭遇已经处理');
        const c = e.choices.find((c) => c.id === action.id);
        if (!c) throw Error('无效选择');
        if (
          s.cash < (c.cost.cash ?? 0) ||
          s.ap < (c.cost.ap ?? 0) ||
          s.stamina < (c.cost.stamina ?? 0)
        )
          throw Error('资源不足，请选择其他行动或离开');
        s.ap -= c.cost.ap ?? 0;
        s.stamina -= c.cost.stamina ?? 0;
        if (c.cost.cash) money(s, -c.cost.cash, c.label);
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
        if (!s.ap) s.phase = 'night';
        break;
      }
      case 'return':
        if (s.event) throw Error('请先处理遭遇');
        if (s.cash < RULES.goal) throw Error('归航需要3000文现金');
        s.beforeReturn = s.cash;
        money(s, -RULES.goal, '支付归航费用');
        s.ending = 'return';
        s.phase = 'ended';
        s.story =
          '手表的光映亮你的掌心。汴梁的叫卖渐渐退去，你又听见了熟悉的车流声。你回来了。';
        break;
      case 'stay':
        if (s.phase !== 'last') throw Error('尚未到最后期限');
        s.ending = 'stay';
        s.phase = 'ended';
        s.story = s.rented
          ? '手表暗了下去。你把小屋的钥匙收好，决定认真过这里的日子。'
          : '手表暗了下去。城门依旧开着，你还活着，明天的路要继续走。';
        break;
      default:
        throw Error('未知操作');
    }
    if (s.health <= 0 && s.phase !== 'ended') {
      s.phase = 'ended';
      s.ending = 'death';
      s.deathCause = '健康耗尽';
    }
    if (s.health > 0 && s.health < 10 && !s.stats.lowDay)
      s.stats.lowDay = s.day;
    s.stats.peakAssets = Math.max(s.stats.peakAssets, assets(s));
    s.stats.maxHens = Math.max(s.stats.maxHens, s.hens.length);
    s.revision++;
    return { state: s };
  } catch (e) {
    return { state, error: e instanceof Error ? e.message : '操作失败' };
  }
}
export function rumorStatus(s: GameState, w: GameState['worlds'][number]) {
  if (s.day < w.expected) return '仍未证实';
  if (w.truth !== 'false' && s.day >= w.start) return '出现相关公开事件';
  if (s.day > w.expected + 3) return '所传时限内未兑现';
  return '仍未证实';
}
export function achievements(s: GameState) {
  return [
    ['第一笔买卖', s.stats.maxProfit > 0],
    ['小有眼光', s.stats.maxProfit >= 100],
    ['商路初成', s.stats.profit >= 1000],
    ['第一枚蛋', s.stats.eggs > 0],
    ['蛋篮满满', s.stats.eggs >= 30],
    ['有处安身', s.rented],
    ['鸡舍落成', s.coop],
    ['街坊人情', s.stats.helped >= 3],
    ['命悬一线', s.stats.survivedLow],
    ['归去来兮', s.ending === 'return'],
  ] as [string, boolean][];
}
export function readSave(raw: string): GameState {
  let s: GameState;
  try {
    s = JSON.parse(raw);
    const model = newGame(0);
    model.buffs = {};
    const shape = (value: unknown, template: unknown): boolean => {
      if (template === null) return true;
      if (Array.isArray(template)) return Array.isArray(value);
      if (typeof template === 'object')
        return (
          !!value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          Object.entries(template).every(([k, v]) =>
            shape((value as Record<string, unknown>)[k], v),
          )
        );
      return (
        typeof value === typeof template &&
        (typeof value !== 'number' || Number.isFinite(value))
      );
    };
    const whole = (n: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
      Number.isSafeInteger(n) && n >= min && n <= max;
    const text = (t: unknown) => typeof t === 'string';
    if (
      !shape(s, model) ||
      !whole(s.cash) ||
      !whole(s.ap, 0, 2) ||
      !whole(s.health, 0, 100) ||
      !whole(s.stamina, 0, 100) ||
      !whole(s.rng, 0, 4294967295) ||
      !whole(s.revision) ||
      !whole(s.nextId, 1)
    )
      throw Error();
    if (
      !s.batches.every(
        (b) =>
          whole(b.id, 1) &&
          GOOD_IDS.includes(b.good) &&
          b.good !== 'hen' &&
          whole(b.units, 1) &&
          (b.good === 'grain' || b.units % 10 === 0) &&
          whole(b.cost) &&
          (b.expires === null || whole(b.expires, 1, 40)) &&
          ['buy', 'gift', 'production'].includes(b.origin),
      )
    )
      throw Error();
    if (
      !s.hens.every(
        (h) => whole(h.id, 1) && whole(h.hunger, 0, 2) && whole(h.cost),
      ) ||
      s.hens.length > (s.coop ? 12 : 3) ||
      occupied(s) > capacity(s) ||
      (s.coop && !s.rented)
    )
      throw Error();
    if (
      !s.history.every(
        (h) =>
          whole(h.day, 1, 30) &&
          GOOD_IDS.every(
            (g) =>
              whole(h.prices?.[g]?.buy, 1) &&
              whole(h.prices?.[g]?.sell, 1) &&
              h.prices[g].buy > h.prices[g].sell,
          ),
      )
    )
      throw Error();
    if (
      !GOOD_IDS.every(
        (g) =>
          whole(s.prices[g].buy, 1) &&
          whole(s.prices[g].sell, 1) &&
          s.prices[g].buy > s.prices[g].sell,
      )
    )
      throw Error();
    if (
      !s.worlds.every(
        (w) =>
          whole(w.id, 1) &&
          WORLD_FAMILIES.some((f) => f.id === w.family) &&
          text(w.name) &&
          GOOD_IDS.includes(w.good) &&
          whole(w.start, 1, 34) &&
          whole(w.expected, 1, 30) &&
          whole(w.duration, 2, 4) &&
          Number.isFinite(w.factor) &&
          w.factor > 0 &&
          ['normal', 'delay', 'small', 'false'].includes(w.truth) &&
          text(w.publicText) &&
          typeof w.heard === 'boolean' &&
          typeof w.clueKnown === 'boolean' &&
          text(w.source) &&
          text(w.clue),
      )
    )
      throw Error();
    if (
      !s.logs.every(
        (l) =>
          whole(l.id, 1) &&
          whole(l.day, 1, 30) &&
          text(l.text) &&
          Number.isSafeInteger(l.cash) &&
          text(l.items),
      )
    )
      throw Error();
    if (
      !s.seen.every(text) ||
      !Object.entries(s.buffs).every(
        ([b, n]) => b in BUFFS && whole(n!, 1, 40),
      ) ||
      ![s.cooldowns, s.familyCounts, s.relations].every((d) =>
        Object.values(d).every((v) => whole(v)),
      )
    )
      throw Error();
    if (
      !s.followups.every(
        (f) =>
          ['widow', 'porter'].includes(f.chain) &&
          text(f.person) &&
          whole(f.due, 1, 35) &&
          whole(f.source, 1, 30) &&
          ['gift', 'work', 'request'].includes(f.branch),
      ) ||
      s.followups.length > 2
    )
      throw Error();
    if (s.event) {
      const e = s.event;
      if (
        !whole(e.id, 1) ||
        ![
          e.family,
          e.variant,
          e.person,
          e.title,
          e.text,
          e.clue,
          e.hiddenFact,
          e.inspection,
        ].every(text) ||
        typeof e.inspected !== 'boolean' ||
        !Array.isArray(e.choices) ||
        !e.choices.length
      )
        throw Error();
      if (
        !e.choices.every(
          (c) =>
            text(c.id) &&
            text(c.label) &&
            text(c.hint) &&
            c.cost &&
            Object.values(c.cost).every((v) => whole(v)) &&
            Array.isArray(c.outcomes) &&
            c.outcomes.length > 0 &&
            c.outcomes.every(
              (o) =>
                Number.isFinite(o.weight) &&
                o.weight > 0 &&
                text(o.text) &&
                o.effect &&
                Object.entries(o.effect).every(([k, v]) =>
                  ['cash', 'health', 'stamina', 'reputation', 'units'].includes(
                    k,
                  )
                    ? Number.isSafeInteger(v)
                    : k === 'good'
                      ? GOOD_IDS.includes(v as Good) && v !== 'hen'
                      : k === 'buff'
                        ? (v as string) in BUFFS
                        : k === 'chain'
                          ? ['widow', 'porter'].includes(v as string)
                          : k === 'help'
                            ? typeof v === 'boolean'
                            : false,
                ),
            ),
        )
      )
        throw Error();
    }
    if (
      !['return', 'death', 'stay', null].includes(s.ending) ||
      (s.phase === 'ended') !== (s.ending !== null)
    )
      throw Error();
  } catch {
    throw Error('存档损坏或版本不兼容，原存档未被覆盖。');
  }
  if (
    !s ||
    s.version !== 1 ||
    s.rules !== RULES.version ||
    !Number.isInteger(s.day) ||
    s.day < 1 ||
    s.day > 30 ||
    !Number.isFinite(s.cash) ||
    s.cash < 0 ||
    !Array.isArray(s.batches) ||
    !Array.isArray(s.worlds) ||
    !Array.isArray(s.logs) ||
    !Array.isArray(s.hens) ||
    !s.stats ||
    !s.prices ||
    !Number.isInteger(s.rng) ||
    !['day', 'market', 'night', 'last', 'ended'].includes(s.phase)
  )
    throw Error('存档损坏或版本不兼容，原存档未被覆盖。');
  return s as GameState;
}

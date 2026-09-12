import { HOUSING } from './config.ts';
import type { CommerceState, CustomerId, GameState, Good } from './types.ts';

export const CUSTOMER_IDS: CustomerId[] = [
  'baker',
  'clothier',
  'innkeeper',
  'eggSeller',
  'merchant',
  'ferryman',
];
export const ORDER_RULES = {
  normalMarkup: 1.25,
  highRiskMarkup: 1.3,
  depositRate: 0.2,
  sizes: [1, 3, 8],
} as const;
export const CUSTOMER_DECLINES: Record<CustomerId, string> = {
  baker: '孙娘点点头：“接得稳再接，饭点不能赌。我另找人问问，往后有余力再来。”',
  clothier:
    '杜掌柜收回尺码单：“这批布我另作安排。你肯提前说清楚，日后仍有生意可谈。”',
  innkeeper: '何叔看看酒窖：“缸还没空出来，就先顾好旧活。这桌酒我找别家备。”',
  eggSeller:
    '陈婆把空筐提回去：“鸡下多少蛋，心里有数才好。你先把自家的鸡养稳。”',
  merchant: '沈九笑着折起契约：“没把握便不押本钱。行商路长，下一回还有机会。”',
  ferryman:
    '周嫂在清单上换了名字：“早点说就来得及。船还没走，我再问问街口的铺子。”',
};
export const CUSTOMERS: Record<
  CustomerId,
  {
    name: string;
    industry: string;
    stories: [string, string, string, string];
    failure: string;
  }
> = {
  baker: {
    name: '饼铺孙娘',
    industry: '食品',
    stories: [
      '孙娘把一块干净笼布叠在柜边：“隔壁义塾添了学生，午间的饼不够分。我想找个能按时送货的人，孩子们等不得。”',
      '孙娘核清你按单送来的货，随即招呼伙计开灶，又把义塾的名单递来：“今日一个没落下。以后有这份活，我会先问你。”',
      '收铺时，孙娘留了一碗面汤。她说当年也是靠一笼饼在汴梁站稳脚跟，随后将大户的宴席供货单放到你面前：“这回，你来掌勺。”',
      '义塾散学时，孙娘请孩子们把新写的字贴在铺门上。她把你的名字也添进供货人的名册：“以后有大批备饭，我提前来商量。忙不过来就直说，熟人更要互相留余地。”',
    ],
    failure:
      '孙娘提前借了隔壁的灶补货：“孩子的饭不能误。下次先算好时辰，做得出来再应承。”',
  },
  clothier: {
    name: '布庄杜掌柜',
    industry: '纺织',
    stories: [
      '杜掌柜沿着尺子理平布边，说城西裁缝要赶制一批春衫。布色可以商量，尺寸和交期却不能少一分。',
      '裁缝核过你送来的用料，清单上的数量一样不少。杜掌柜给你记了一笔信誉：“账上守信，比嘴上说得好听有用。”',
      '布庄换季盘库，杜掌柜请你一同看样。他替你引见做嫁衣的绣娘，愿将用料更贵、交期更紧的整批丝绸托给你。',
      '杜掌柜邀你见证徒弟第一次独立裁衣。散席时，他拿出积年的布样册，讲明哪些布该趁季节出手、哪些值得慢慢等。此后遇到整批来货，他愿先与你一道验看。',
    ],
    failure:
      '杜掌柜收起那张尺码单：“裁缝已经另找货了。损失依契约结清，以后小单做稳，再谈大单。”',
  },
  innkeeper: {
    name: '酒楼何叔',
    industry: '酿造',
    stories: [
      '何叔正擦着一排空酒坛：“下旬有商队包桌，客人爱喝什么尚未问清，酒却得提前备。愿意接活，就看清坛数和日子。”',
      '席间客人又要添酒，何叔从你送来的那批里抱出两坛，才没断了酒兴。散席后，他把约定的货钱一文不少交给你。',
      '何叔领你看酒窖，指着留空的一排木架：“往后这几格给你留。宴席单报酬高，可耽搁一夜，满楼客人都要等。”',
      '何叔把新酒单递给你，空出一栏让你写意见。他说酒楼也有冷清的时候，往后大席备货提前商量，既给客人留体面，也给供货的人留周转的本钱。',
    ],
    failure:
      '何叔临时向别家借酒，酒楼的席面才接上。他没有多讨钱，只按这单约定结清后果，嘱你别把尚未出缸的酒算作现货。',
  },
  eggSeller: {
    name: '鸡行陈婆',
    industry: '养殖',
    stories: [
      '陈婆把鸡蛋一枚枚照过光：“食肆每日都要鲜蛋，最怕这一日多、下一日断。你若有余蛋，可以先供一小筐。”',
      '送来的蛋壳完整，陈婆在筐底添了一层稻草：“货备得齐，也懂得送。赶集那天我给你留一处落筐的地方。”',
      '天还没亮，陈婆已经替你留好新筐。她愿把几家食肆的用量合成一张大单，却再三提醒雨天也不能断粮断料。',
      '陈婆把赶集的凳子挪出半边，请你坐下喝茶。她说如今有人能接住大宗鲜货，自己终于敢少跑一趟远路；遇上急着出手的货，会先把数量和鲜度告诉你。',
    ],
    failure:
      '陈婆拿空筐敲了敲柜沿：“今日食肆另买了蛋。鸡不会照着契约下蛋，留些余量才稳妥。”',
  },
  merchant: {
    name: '行商沈九',
    industry: '贸易',
    stories: [
      '沈九将渡口货单摊开，茶叶和药材各有买主。他不催你应下，只让你先看市价：“同一张单，买在不同日子，盈亏便不同。”',
      '沈九核过封口，赞你没有用欠份的包袱凑数。他告诉你下一趟会收别样货，先前的报价却仍按契约兑现。',
      '商队启程前，沈九给你留了一枚木签：“拿它来，伙计会给你看大宗收购单。别只看报酬，压在路上的本钱也算钱。”',
      '沈九返城后先到你门前，把货签和家书分成两叠。他邀你一道验下一船整批货，笑说这些年最难得的不是见过好价，而是有人肯把坏消息也及时说清。',
    ],
    failure:
      '沈九已换了收货人，仍把旧契约留给你核对：“行情变了是常事，接了单便要算上退路。”',
  },
  ferryman: {
    name: '船队周嫂',
    industry: '混合',
    stories: [
      '周嫂在河边点着船工的饭包。出航要吃食、布料和茶，她宁愿交给一位可靠的人备齐，也不想临开船四处找货。',
      '船工解开你的货包，吃食和用料分得清楚。周嫂将清单折好：“省下这半个时辰，我们就能赶上早潮。”',
      '新来的两艘船也请周嫂代办补给。她想把整队的供货交给你，却把每样货的数量重新念了一遍，确认你都听清了。',
      '周嫂请你在船工的名册旁写下收货时辰。她说下一趟大宗补给会提前递信，临时改期也一定相告。渡船启程时，有人从船头朝你挥手，喊的是你的名字。',
    ],
    failure:
      '周嫂让船先走了，没收齐的货只能留待下次。她按契约结清损失，没有让一船人的生计无限等下去。',
  },
};

export interface OrderTemplate {
  id: string;
  customer: CustomerId;
  title: string;
  text: string;
  goods: Partial<Record<Good, number>>;
  milestone?: string;
}
export const ORDER_TEMPLATES: OrderTemplate[] = [
  {
    id: 'school-bread',
    customer: 'baker',
    title: '义塾午饭',
    text: '午间开饭前需备足炊饼，交来的须是未过期成品。',
    goods: { bread: 10 },
  },
  {
    id: 'mill-flour',
    customer: 'baker',
    title: '磨坊代供',
    text: '孙娘的磨盘要检修，先收一袋面粉，免得耽误开灶。',
    goods: { flour: 8 },
  },
  {
    id: 'pickle-meal',
    customer: 'baker',
    title: '工棚配饭',
    text: '工棚订了咸蛋配饼，两个品类须一次送齐。',
    goods: { saltedEgg: 6, bread: 5 },
  },
  {
    id: 'banquet-bread',
    customer: 'baker',
    title: '邻里宴饼',
    text: '整条巷子凑钱开宴，孙娘要提前核清炊饼与面粉。',
    goods: { bread: 15, flour: 5 },
    milestone: 'firstSale',
  },
  {
    id: 'spring-cloth',
    customer: 'clothier',
    title: '裁缝春衫',
    text: '裁缝按布匹安排活计，约定的整批麻布不得缺份。',
    goods: { cloth: 4 },
  },
  {
    id: 'thread-repair',
    customer: 'clothier',
    title: '补衣用线',
    text: '修补铺忙不过来，向布庄借调一批麻线。',
    goods: { thread: 8 },
  },
  {
    id: 'silk-wedding',
    customer: 'clothier',
    title: '嫁衣选料',
    text: '绣娘已定好工期，先收生丝和丝绸各一份清单。',
    goods: { silk: 2, silkRaw: 2 },
  },
  {
    id: 'cloth-rolls',
    customer: 'clothier',
    title: '整批绸缎',
    text: '杜掌柜将熟客的大宗单交来，收货时逐匹验数。',
    goods: { silk: 4 },
    milestone: 'skill',
  },
  {
    id: 'wine-caravan',
    customer: 'innkeeper',
    title: '商队包席',
    text: '包席日子已定，须提前安排酿缸，未出缸的酒不能交货。',
    goods: { wine: 4 },
  },
  {
    id: 'wine-refill',
    customer: 'innkeeper',
    title: '酒窖补坛',
    text: '酒楼余酒不多，何叔想在新客到来前补足一排。',
    goods: { wine: 6 },
  },
  {
    id: 'wine-night',
    customer: 'innkeeper',
    title: '夜席备酒',
    text: '夜席需要酒与柴薪，酒窖和后厨一道收货。',
    goods: { wine: 3, firewood: 5 },
  },
  {
    id: 'wine-house',
    customer: 'innkeeper',
    title: '楼上雅宴',
    text: '雅宴席面繁多，何叔只把整批酒托给有固定家业的供货人。',
    goods: { wine: 10 },
    milestone: 'home',
  },
  {
    id: 'egg-diner',
    customer: 'eggSeller',
    title: '食肆鲜蛋',
    text: '食肆的蛋羹每日现做，陈婆要收新鲜且完整的一筐蛋。',
    goods: { egg: 12 },
  },
  {
    id: 'egg-pastry',
    customer: 'eggSeller',
    title: '点心铺添蛋',
    text: '点心铺赶制糕点，比平日多订一筐鸡蛋。',
    goods: { egg: 18 },
  },
  {
    id: 'egg-road',
    customer: 'eggSeller',
    title: '行路咸蛋',
    text: '远行的客人要耐放的咸蛋，陈婆不收尚在腌缸里的货。',
    goods: { saltedEgg: 9 },
  },
  {
    id: 'egg-regular',
    customer: 'eggSeller',
    title: '三铺合筐',
    text: '几间食肆合并要货，陈婆替守信的供货人接下这单。',
    goods: { egg: 24, saltedEgg: 6 },
    milestone: 'firstOrder',
  },
  {
    id: 'tea-pier',
    customer: 'merchant',
    title: '渡口收茶',
    text: '沈九替外地茶铺收茶，封好包后按合同价结钱。',
    goods: { tea: 4 },
  },
  {
    id: 'herb-route',
    customer: 'merchant',
    title: '药铺补货',
    text: '往北的车队顺路送药材，车队启程前要收齐约定数目。',
    goods: { herb: 6 },
  },
  {
    id: 'silk-route',
    customer: 'merchant',
    title: '织坊原丝',
    text: '外地织坊缺生丝，沈九愿先定价，待你择机采购。',
    goods: { silkRaw: 4 },
  },
  {
    id: 'merchant-bundle',
    customer: 'merchant',
    title: '大宗封包',
    text: '茶叶与药材分包同行，熟客才可接取这份整单。',
    goods: { tea: 6, herb: 6 },
    milestone: 'customer',
  },
  {
    id: 'boat-meal',
    customer: 'ferryman',
    title: '早潮饭包',
    text: '船工上船便开饭，炊饼与咸蛋须同时备齐。',
    goods: { bread: 10, saltedEgg: 3 },
  },
  {
    id: 'boat-supplies',
    customer: 'ferryman',
    title: '船头补给',
    text: '帆布补缝、煮水和饮茶各有用途，不要漏下其中一项。',
    goods: { cloth: 2, firewood: 4, tea: 2 },
  },
  {
    id: 'boat-workers',
    customer: 'ferryman',
    title: '码头换班',
    text: '周嫂替两班船工统一采办，饭食和夜里热茶一同交货。',
    goods: { bread: 8, tea: 3 },
  },
  {
    id: 'boat-fleet',
    customer: 'ferryman',
    title: '整队启航',
    text: '整队启航前最后一次补给，周嫂只找经营稳定的人承接。',
    goods: { cloth: 4, tea: 4, saltedEgg: 6 },
    milestone: 'steady',
  },
];
export const MILESTONES = [
  {
    id: 'firstSale',
    name: '第一炉生意',
    requirement: '生产并售出自产货物',
    reward: '解锁「邻里宴饼」订单',
  },
  {
    id: 'firstOrder',
    name: '如约交货',
    requirement: '完成首个订单',
    reward: '解锁「三铺合筐」订单',
  },
  {
    id: 'steady',
    name: '三日有盈',
    requirement: '连续3日经营毛利为正',
    reward: '解锁「整队启航」订单',
  },
  {
    id: 'skill',
    name: '手艺渐熟',
    requirement: '任一手艺达到熟练',
    reward: '解锁「整批绸缎」订单',
  },
  {
    id: 'home',
    name: '汴梁有家',
    requirement: '首次购置住宅',
    reward: '解锁「楼上雅宴」订单',
  },
  {
    id: 'customer',
    name: '街坊信得过',
    requirement: '任一客户关系达到3',
    reward: '解锁「大宗封包」和高风险订单',
  },
] as const;

export function businessProfit(s: GameState) {
  return (
    s.ledger.tradeRevenue +
    s.ledger.productionRevenue -
    s.ledger.tradeCost -
    s.ledger.productionCost
  );
}
export function newCommerce(
  s: Pick<GameState, 'seed' | 'day' | 'ledger'>,
): CommerceState {
  return {
    rng: (s.seed ^ 0x91e10da5) >>> 0,
    enabledDay: Math.max(4, s.day + 1),
    generatedDay: 0,
    orders: [],
    relations: Object.fromEntries(CUSTOMER_IDS.map((id) => [id, 0])) as Record<
      CustomerId,
      number
    >,
    customers: {},
    seen: {},
    completed: 0,
    failed: 0,
    milestones: {},
    positiveDays: 0,
    profitAtDawn: businessProfit(s as GameState),
    profitSinceDay: s.day,
  };
}
function random(c: CommerceState) {
  c.rng = (Math.imul(c.rng, 1664525) + 1013904223) >>> 0;
  return c.rng / 4294967296;
}
export const FESTIVALS: { name: string; goods: Good[]; detail: string }[] = [
  {
    name: '百味小集',
    goods: ['bread', 'flour', 'egg', 'saltedEgg'],
    detail: '食摊齐聚，食品用量增加。',
  },
  {
    name: '布帛交易会',
    goods: ['thread', 'cloth', 'silk'],
    detail: '裁缝与布商看样订货，布帛需求增加。',
  },
  {
    name: '河畔茶酒会',
    goods: ['wine', 'tea'],
    detail: '河畔摆席，酒与茶的需求增加。',
  },
];
export function festivalOn(day: number) {
  const cycle = Math.floor(day / 15);
  return cycle >= 1 && day % 15 < 3
    ? { ...FESTIVALS[(cycle - 1) % 3], start: cycle * 15, end: cycle * 15 + 2 }
    : null;
}
export function publicCalendar(s: GameState) {
  const current = festivalOn(s.day);
  const next = Math.ceil((s.day + 1) / 15) * 15;
  return [
    current,
    next - s.day <= 7
      ? { ...FESTIVALS[(next / 15 - 1) % 3], start: next, end: next + 2 }
      : null,
  ].filter((x) => x !== null);
}
export function updateMilestones(s: GameState) {
  const c = s.commerce;
  const checks: Record<string, boolean> = {
    firstSale: s.ledger.productionRevenue > 0,
    firstOrder: c.completed > 0,
    steady: c.positiveDays >= 3,
    skill: Object.values(s.skills).some((v) => v >= 2),
    home: HOUSING[s.housing.id].kind === 'owned',
    customer: Object.values(c.relations).some((v) => v >= 3),
  };
  for (const m of MILESTONES)
    if (checks[m.id] && !c.milestones[m.id]) c.milestones[m.id] = s.day;
}
export function generateOrders(s: GameState) {
  const c = s.commerce;
  if (s.day < c.enabledDay || c.generatedDay === s.day) return;
  c.generatedDay = s.day;
  // Offers last one day; accepted contracts retain their original deadlines.
  c.orders = [
    ...c.orders.filter((o) => o.status === 'accepted'),
    ...c.orders
      .filter(
        (o) =>
          o.status === 'delivered' ||
          o.status === 'failed' ||
          o.status === 'declined',
      )
      .slice(-30),
  ];
  const eligible = ORDER_TEMPLATES.filter(
    (t) =>
      (!t.milestone || c.milestones[t.milestone]) &&
      s.day - (c.seen[t.id] ?? -99) >= 7,
  )
    .map((t) => ({
      t,
      score:
        random(c) +
        (publicCalendar(s).some((f) =>
          Object.keys(t.goods).some((g) => f.goods.includes(g as Good)),
        )
          ? 0.35
          : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const wealth =
    s.cash +
    s.batches.reduce((n, b) => n + (b.units * s.prices[b.good].sell) / 10, 0);
  const developed =
    Object.values(s.skills).some((v) => v >= 2) || c.completed >= 5;
  const scale =
    wealth >= 10000 && (developed || HOUSING[s.housing.id].slots >= 4)
      ? ORDER_RULES.sizes[2]
      : wealth >= 2500 || developed
        ? ORDER_RULES.sizes[1]
        : ORDER_RULES.sizes[0];
  for (const { t } of eligible.slice(0, 3)) {
    const highRisk = c.relations[t.customer] >= 3 && random(c) < 0.35;
    const baseUnits = Object.values(t.goods).reduce((n, q) => n + q!, 0);
    const carryingLimit =
      (s.health >= 70 ? 100 : s.health >= 40 ? 80 : 60) - 10;
    const feasibleScale = Math.min(
      scale,
      Math.max(
        1,
        Math.floor(
          Math.min(carryingLimit, HOUSING[s.housing.id].capacity / 10) /
            baseUnits,
        ),
      ),
    );
    const goods = Object.fromEntries(
      Object.entries(t.goods).map(([g, q]) => [g, q! * feasibleScale]),
    );
    const prices = Object.fromEntries(
      Object.keys(goods).map((g) => [
        g,
        Math.round(
          s.prices[g as Good].sell *
            (highRisk ? ORDER_RULES.highRiskMarkup : ORDER_RULES.normalMarkup),
        ),
      ]),
    );
    const price = Object.entries(goods).reduce(
      (n, [g, q]) => n + q * prices[g],
      0,
    );
    c.orders.push({
      id: s.nextId++,
      templateId: t.id,
      customer: t.customer,
      title: t.title,
      description: t.text,
      goods,
      prices,
      price,
      deposit: highRisk ? Math.ceil(price * 0.2) : 0,
      highRisk,
      postedDay: s.day,
      deadlineAt:
        (s.day -
          1 +
          (highRisk
            ? 3 + Math.floor(random(c) * 2)
            : 4 + Math.floor(random(c) * 3))) *
          1440 +
        1200,
      status: 'offered',
      settledDay: null,
    });
    c.seen[t.id] = s.day;
  }
}
export function orderTerms(o: GameState['commerce']['orders'][number]) {
  return `${o.id}:${o.price}:${o.deposit}:${o.deadlineAt}`;
}
export function returnTerms(s: GameState) {
  return s.commerce.orders
    .filter((o) => o.status === 'accepted')
    .map(orderTerms)
    .join('|');
}
export function orderReserved(s: GameState, good: Good) {
  return s.commerce.orders
    .filter((o) => o.status === 'accepted')
    .reduce((n, o) => n + (o.goods[good] ?? 0), 0);
}
export function customerStage(s: GameState, id: CustomerId) {
  const c = s.commerce.customers[id];
  return !c?.met
    ? 0
    : s.commerce.relations[id] >= 10
      ? 4
      : s.commerce.relations[id] >= 3
        ? 3
        : c.lastOutcome === 'delivered'
          ? 2
          : 1;
}
export function milestoneProgress(s: GameState, id: string) {
  if (s.commerce.milestones[id]) return '已达成';
  if (id === 'steady')
    return `${s.commerce.positiveDays}/3日（第${s.commerce.profitSinceDay}日起累计）`;
  if (id === 'customer')
    return `${Math.max(0, ...Object.values(s.commerce.relations))}/3关系`;
  if (id === 'skill') return `${Math.max(...Object.values(s.skills))}/2级`;
  return '进行中';
}
export function customerOpportunity(s: GameState) {
  return CUSTOMER_IDS.find(
    (id) =>
      !s.commerce.customers[id]?.met &&
      !s.intel.some((i) => i.customerId === id),
  );
}
export function validCommerce(s: GameState): boolean {
  const c = s.commerce;
  if (
    !c ||
    !Number.isInteger(c.rng) ||
    c.rng < 0 ||
    c.rng > 4294967295 ||
    !Number.isSafeInteger(c.enabledDay) ||
    !Number.isSafeInteger(c.generatedDay) ||
    !Number.isSafeInteger(c.completed) ||
    c.completed < 0 ||
    !Number.isSafeInteger(c.failed) ||
    c.failed < 0 ||
    !Number.isSafeInteger(c.positiveDays) ||
    c.positiveDays < 0 ||
    !Number.isFinite(c.profitAtDawn) ||
    !Number.isSafeInteger(c.profitSinceDay) ||
    !Array.isArray(c.orders) ||
    c.orders.length > 35 ||
    c.orders.filter((o) => o.status === 'accepted').length > 2 ||
    !c.customers ||
    !c.relations ||
    !c.milestones ||
    !c.seen
  )
    return false;
  if (
    !CUSTOMER_IDS.every(
      (id) =>
        Number.isInteger(c.relations[id]) &&
        c.relations[id] >= -5 &&
        c.relations[id] <= 10,
    )
  )
    return false;
  if (
    Object.entries(c.customers).some(
      ([id, v]) =>
        !CUSTOMER_IDS.includes(id as CustomerId) ||
        !v ||
        typeof v.met !== 'boolean' ||
        !Number.isInteger(v.visited) ||
        v.visited < 0 ||
        v.visited > CUSTOMERS[id as CustomerId].stories.length ||
        ![null, 'delivered', 'failed'].includes(v.lastOutcome),
    )
  )
    return false;
  if (
    Object.entries(c.milestones).some(
      ([id, day]) =>
        !MILESTONES.some((m) => m.id === id) ||
        !Number.isSafeInteger(day) ||
        day < 1 ||
        day > s.day,
    )
  )
    return false;
  if (
    Object.values(c.seen).some((day) => !Number.isSafeInteger(day) || day < 1)
  )
    return false;
  if (new Set(c.orders.map((o) => o.id)).size !== c.orders.length) return false;
  for (const o of c.orders) {
    if (
      !Number.isSafeInteger(o.id) ||
      !CUSTOMER_IDS.includes(o.customer) ||
      !ORDER_TEMPLATES.some((t) => t.id === o.templateId) ||
      typeof o.title !== 'string' ||
      typeof o.description !== 'string' ||
      !Number.isSafeInteger(o.price) ||
      o.price < 1 ||
      !Number.isSafeInteger(o.deposit) ||
      o.deposit < 0 ||
      typeof o.highRisk !== 'boolean' ||
      o.deposit !== (o.highRisk ? Math.ceil(o.price * 0.2) : 0) ||
      !Number.isSafeInteger(o.postedDay) ||
      !Number.isSafeInteger(o.deadlineAt) ||
      o.deadlineAt <= o.postedDay * 1440 ||
      ![
        'offered',
        'accepted',
        'delivered',
        'failed',
        'expired',
        'declined',
      ].includes(o.status) ||
      !o.goods ||
      !o.prices ||
      Object.keys(o.goods).length < 1 ||
      Object.keys(o.goods).length > 3
    )
      return false;
    const entries = Object.entries(o.goods);
    if (
      entries.some(
        ([g, q]) =>
          !(g in s.prices) ||
          !Number.isSafeInteger(q) ||
          q! < 1 ||
          !Number.isSafeInteger(o.prices[g as Good]) ||
          o.prices[g as Good]! < 1,
      )
    )
      return false;
    if (
      entries.reduce((n, [g, q]) => n + q! * o.prices[g as Good]!, 0) !==
      o.price
    )
      return false;
    if (
      o.settledDay !== null &&
      (!Number.isSafeInteger(o.settledDay) || o.settledDay < o.postedDay)
    )
      return false;
  }
  const frozen = c.orders
    .filter((o) => o.status === 'accepted')
    .reduce((n, o) => n + o.deposit, 0);
  return (
    [
      s.ledger.depositsPaid,
      s.ledger.depositsReturned,
      s.ledger.depositLosses,
    ].every((n) => Number.isSafeInteger(n) && n >= 0) &&
    s.ledger.depositsPaid -
      s.ledger.depositsReturned -
      s.ledger.depositLosses ===
      frozen
  );
}

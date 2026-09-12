import type {
  Buff,
  EquipmentKind,
  Good,
  HousingId,
  Recipe,
  SkillId,
} from './types.ts';

export const RULES = {
  version: '2.0-long-game',
  initialCash: 800,
  tradeStaminaPerUnit: 1,
  shortWage: 25,
  heavyWage: 40,
  shortEnergy: 25,
  heavyEnergy: 40,
  maxWorkPerDay: 2,
  lessonStamina: 20,
  snackStamina: 15,
  restStamina: 25,
  maxLogs: 80,
  maxIntel: 120,
  feed: 2,
  eggChance: 0.7,
  coopChance: 0.8,
} as const;

export const GOODS: Record<
  Good,
  {
    name: string;
    base: number;
    firstSell: number;
    unit: string;
    life?: number;
    category: string;
  }
> = {
  grain: {
    name: '粟米',
    base: 21,
    firstSell: 18,
    unit: '份',
    category: '粮食',
  },
  wheat: {
    name: '小麦',
    base: 26,
    firstSell: 22,
    unit: '份',
    category: '粮食',
  },
  flour: {
    name: '面粉',
    base: 44,
    firstSell: 37,
    unit: '份',
    category: '食品',
  },
  salt: { name: '盐', base: 18, firstSell: 15, unit: '份', category: '食品' },
  firewood: {
    name: '柴薪',
    base: 12,
    firstSell: 10,
    unit: '捆',
    category: '燃料',
  },
  hemp: { name: '原麻', base: 31, firstSell: 26, unit: '份', category: '纺织' },
  thread: {
    name: '麻线',
    base: 66,
    firstSell: 56,
    unit: '份',
    category: '纺织',
  },
  silkRaw: {
    name: '生丝',
    base: 168,
    firstSell: 143,
    unit: '份',
    category: '纺织',
  },
  silk: {
    name: '丝绸',
    base: 330,
    firstSell: 281,
    unit: '匹',
    category: '纺织',
  },
  bread: {
    name: '炊饼',
    base: 30,
    firstSell: 25,
    unit: '个',
    life: 3,
    category: '食品',
  },
  hen: {
    name: '母鸡',
    base: 126,
    firstSell: 108,
    unit: '只',
    category: '养殖',
  },
  egg: {
    name: '鸡蛋',
    base: 15,
    firstSell: 12,
    unit: '枚',
    life: 5,
    category: '食品',
  },
  saltedEgg: {
    name: '咸蛋',
    base: 29,
    firstSell: 25,
    unit: '枚',
    life: 10,
    category: '食品',
  },
  cloth: {
    name: '麻布',
    base: 112,
    firstSell: 95,
    unit: '匹',
    category: '纺织',
  },
  tea: {
    name: '茶叶',
    base: 174,
    firstSell: 149,
    unit: '份',
    category: '贸易',
  },
  wine: { name: '酒', base: 128, firstSell: 109, unit: '坛', category: '酿造' },
  herb: {
    name: '药材',
    base: 113,
    firstSell: 97,
    unit: '包',
    category: '药材',
  },
};
export const GOOD_IDS = Object.keys(GOODS) as Good[];

export const BUFFS: Record<Buff, { name: string; detail: string }> = {
  outsider: { name: '异乡人', detail: '初到汴梁，听到消息后记得追问出处' },
  regular: { name: '粮商熟客', detail: '购买粟米九五折，仍保留买卖差价' },
  tired: { name: '劳累', detail: '劳动和生产体力成本 +5' },
  cold: { name: '风寒', detail: '夜间健康 −2；持续两夜' },
  warm: { name: '热饭余温', detail: '本次夜间体力恢复 +5' },
};

export const SKILLS: Record<
  SkillId,
  { name: string; teacher: string; detail: string }
> = {
  husbandry: {
    name: '饲养',
    teacher: '鸡行陈师傅',
    detail: '鸡舍产蛋率提高，饲料更省',
  },
  food: {
    name: '食品加工',
    teacher: '饼铺孙娘',
    detail: '面粉、炊饼与咸蛋批量更大',
  },
  textile: {
    name: '纺织',
    teacher: '织坊杜娘',
    detail: '麻线、麻布与丝绸耗料下降',
  },
  brewing: {
    name: '酿造',
    teacher: '酒坊何叔',
    detail: '原料消耗下降，精通后批量产出增加',
  },
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const SKILL_LEVELS = ['未入门', '入门', '熟练', '精通'];
export const LESSON_COST = [80, 220, 520];
export const XP_TO_LEVEL = [0, 3, 10, 24];

export const HOUSING: Record<
  HousingId,
  {
    name: string;
    kind: 'temporary' | 'rent' | 'owned';
    cost: number;
    upkeep: number;
    capacity: number;
    slots: number;
    henCapacity: number;
    recovery: number;
    detail: string;
  }
> = {
  street: {
    name: '街头',
    kind: 'temporary',
    cost: 0,
    upkeep: 0,
    capacity: 600,
    slots: 0,
    henCapacity: 3,
    recovery: 20,
    detail: '免费，健康 −3；没有固定设备位',
  },
  room: {
    name: '租赁小屋',
    kind: 'rent',
    cost: 300,
    upkeep: 12,
    capacity: 1000,
    slots: 2,
    henCapacity: 3,
    recovery: 50,
    detail: '按日付租；2个设备位',
  },
  courtyard: {
    name: '租赁院落',
    kind: 'rent',
    cost: 800,
    upkeep: 26,
    capacity: 1800,
    slots: 4,
    henCapacity: 24,
    recovery: 65,
    detail: '按日付租；4个设备位，可扩建鸡舍',
  },
  yard: {
    name: '自有小院',
    kind: 'owned',
    cost: 6000,
    upkeep: 16,
    capacity: 2400,
    slots: 6,
    henCapacity: 40,
    recovery: 75,
    detail: '一次购买；维护费较低，6个设备位',
  },
  mansion: {
    name: '自有大宅',
    kind: 'owned',
    cost: 15000,
    upkeep: 36,
    capacity: 3600,
    slots: 8,
    henCapacity: 60,
    recovery: 85,
    detail: '一次购买；维护费与仓储最高',
  },
};
export const HOUSING_IDS = Object.keys(HOUSING) as HousingId[];

export const EQUIPMENT: Record<
  EquipmentKind,
  { name: string; cost: number; detail: string }
> = {
  coop: { name: '鸡舍', cost: 240, detail: '扩大养鸡容量并提高产蛋率' },
  mill: { name: '石磨', cost: 160, detail: '小麦磨成面粉' },
  stove: { name: '灶台', cost: 180, detail: '面粉做炊饼' },
  pickleVat: { name: '腌缸', cost: 150, detail: '鸡蛋腌成咸蛋' },
  spinningWheel: { name: '纺车', cost: 230, detail: '原麻纺成麻线' },
  loom: { name: '织机', cost: 420, detail: '麻线织麻布，生丝织丝绸' },
  brewVat: { name: '酿缸', cost: 360, detail: '粟米与柴薪酿酒' },
};
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as EquipmentKind[];

export const RECIPES: Recipe[] = [
  {
    id: 'flour',
    name: '磨面',
    industry: 'food',
    inputs: { wheat: 20 },
    output: 'flour',
    outputUnits: 20,
    stamina: 8,
    duration: 0,
    shelfLife: null,
    equipment: 'mill',
    minSkill: 1,
    batchLabel: '小麦 2份 → 面粉 2份',
  },
  {
    id: 'bread',
    name: '炊饼',
    industry: 'food',
    inputs: { flour: 20 },
    output: 'bread',
    outputUnits: 50,
    stamina: 14,
    duration: 0,
    shelfLife: 3,
    equipment: 'stove',
    minSkill: 1,
    batchLabel: '面粉 2份 → 炊饼 5个',
  },
  {
    id: 'saltedEgg',
    name: '腌咸蛋',
    industry: 'food',
    inputs: { egg: 20, salt: 10 },
    output: 'saltedEgg',
    outputUnits: 30,
    stamina: 6,
    duration: 2,
    shelfLife: 10,
    equipment: 'pickleVat',
    minSkill: 1,
    batchLabel: '鸡蛋 2枚 + 盐 1份 → 咸蛋 3枚，2夜',
  },
  {
    id: 'thread',
    name: '纺麻线',
    industry: 'textile',
    inputs: { hemp: 20 },
    output: 'thread',
    outputUnits: 20,
    stamina: 14,
    duration: 0,
    shelfLife: null,
    equipment: 'spinningWheel',
    minSkill: 1,
    batchLabel: '原麻 2份 → 麻线 2份',
  },
  {
    id: 'cloth',
    name: '织麻布',
    industry: 'textile',
    inputs: { thread: 20 },
    output: 'cloth',
    outputUnits: 20,
    stamina: 18,
    duration: 0,
    shelfLife: null,
    equipment: 'loom',
    minSkill: 1,
    batchLabel: '麻线 2份 → 麻布 2匹',
  },
  {
    id: 'silk',
    name: '织丝绸',
    industry: 'textile',
    inputs: { silkRaw: 20 },
    output: 'silk',
    outputUnits: 20,
    stamina: 65,
    duration: 0,
    shelfLife: null,
    equipment: 'loom',
    minSkill: 2,
    batchLabel: '生丝 2份 → 丝绸 2匹',
  },
  {
    id: 'wine',
    name: '酿酒',
    industry: 'brewing',
    inputs: { grain: 20, firewood: 10 },
    output: 'wine',
    outputUnits: 20,
    stamina: 8,
    duration: 3,
    shelfLife: null,
    equipment: 'brewVat',
    minSkill: 1,
    batchLabel: '粟米 2份 + 柴薪 1捆 → 酒 2坛，3夜',
  },
];
export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export const WORLD_FAMILIES: {
  id: string;
  name: string;
  good: Good;
  factor: number;
  rumor: string;
  publicText: string;
}[] = [
  {
    id: 'grain-rain',
    name: '水运受阻',
    good: 'grain',
    factor: 1.4,
    rumor: '北边连雨，运粮的船恐怕要误期。',
    publicText: '城门贴出了运粮延误的告示，粮摊重新写了价钱。',
  },
  {
    id: 'tea-ship',
    name: '江南茶船',
    good: 'tea',
    factor: 0.65,
    rumor: '江南茶船就要进城，带来的新茶似乎不少。',
    publicText: '码头卸下了江南新茶，挑夫沿河排成一列。',
  },
  {
    id: 'grain-tax',
    name: '官府征粮',
    good: 'grain',
    factor: 1.5,
    rumor: '官府可能要收一批粮食，粮商正在备货。',
    publicText: '征粮文书已经公布，州桥粮铺忙着验货。',
  },
  {
    id: 'wine-fair',
    name: '庙会备货',
    good: 'wine',
    factor: 1.5,
    rumor: '相国寺将开庙会，食肆正在打听酒价。',
    publicText: '庙会如期开张，沿街酒旗一早就挂了起来。',
  },
  {
    id: 'herb-demand',
    name: '药铺收购',
    good: 'herb',
    factor: 1.6,
    rumor: '城南药铺可能集中收购药材，不过还没开出单子。',
    publicText: '城南药铺发出了收购单，药商纷纷前来问价。',
  },
  {
    id: 'grain-arrival',
    name: '粮船抵埠',
    good: 'grain',
    factor: 0.65,
    rumor: '南边的粮船正在赶来，米行似乎有意清仓。',
    publicText: '新到粮船正在卸货，米行门前堆起了麻袋。',
  },
];

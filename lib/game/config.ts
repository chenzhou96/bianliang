import type { Good, Buff } from './types.ts';
export const RULES = {
  version: '1.0',
  goal: 3000,
  days: 30,
  rent: 300,
  coop: 240,
  capacity: 600,
  homeCapacity: 1200,
  feed: 2,
  eggChance: 0.7,
  coopChance: 0.8,
  cooldown: 4,
  shortWage: 60,
  heavyWage: 75,
  shortEnergy: 25,
  heavyEnergy: 40,
};
export const GOODS: Record<
  Good,
  { name: string; base: number; firstSell: number; unit: string; life?: number }
> = {
  grain: { name: '粟米', base: 21, firstSell: 18, unit: '份' },
  bread: { name: '炊饼', base: 10, firstSell: 7, unit: '个', life: 3 },
  hen: { name: '母鸡', base: 126, firstSell: 108, unit: '只' },
  egg: { name: '鸡蛋', base: 15, firstSell: 12, unit: '枚', life: 5 },
  cloth: { name: '麻布', base: 84, firstSell: 72, unit: '匹' },
  tea: { name: '茶叶', base: 174, firstSell: 149, unit: '份' },
  wine: { name: '酒', base: 96, firstSell: 82, unit: '坛' },
  herb: { name: '药材', base: 113, firstSell: 97, unit: '包' },
};
export const GOOD_IDS = Object.keys(GOODS) as Good[];
export const BUFFS: Record<Buff, { name: string; detail: string }> = {
  outsider: { name: '异乡人', detail: '前三日听消息时多一条交叉线索' },
  regular: { name: '粮商熟客', detail: '购买粟米九五折，仍保留买卖差价' },
  tired: { name: '劳累', detail: '额外劳动体力成本 +5' },
  cold: { name: '风寒', detail: '夜间健康 −2；持续两夜' },
  warm: { name: '热饭余温', detail: '本次夜间体力恢复 +5' },
};
export const WORLD_FAMILIES: {
  id: string;
  name: string;
  good: Good;
  factor: number;
  rumor: string;
  publicText: string;
}[] = [
  {
    id: 'rain',
    name: '水运受阻',
    good: 'grain',
    factor: 1.4,
    rumor: '北边连雨，运粮的船恐怕要误期。',
    publicText: '城门贴出了运粮延误的告示，粮摊重新写了价钱。',
  },
  {
    id: 'ship',
    name: '江南茶船',
    good: 'tea',
    factor: 0.65,
    rumor: '江南茶船就要进城，带来的新茶似乎不少。',
    publicText: '码头卸下了江南新茶，挑夫沿河排成一列。',
  },
  {
    id: 'requisition',
    name: '官府征粮',
    good: 'grain',
    factor: 1.5,
    rumor: '官府可能要收一批粮食，粮商正在备货。',
    publicText: '征粮文书已经公布，州桥粮铺忙着验货。',
  },
  {
    id: 'fair',
    name: '庙会备货',
    good: 'wine',
    factor: 1.5,
    rumor: '相国寺将开庙会，食肆正在打听酒价。',
    publicText: '庙会如期开张，沿街酒旗一早就挂了起来。',
  },
  {
    id: 'medicine',
    name: '药铺收购',
    good: 'herb',
    factor: 1.6,
    rumor: '城南药铺可能集中收购药材，不过还没开出单子。',
    publicText: '城南药铺发出了收购单，药商纷纷前来问价。',
  },
  {
    id: 'harvest',
    name: '粮船抵埠',
    good: 'grain',
    factor: 0.65,
    rumor: '南边的粮船正在赶来，米行似乎有意清仓。',
    publicText: '新到粮船正在卸货，米行门前堆起了麻袋。',
  },
];

import type { GameState, Good, CustomerId } from './types.ts';

export const FACILITIES = {
  warehouse: {
    name: '货房',
    cost: 400,
    detail: '仓储增加基础容量40%，搬运时间减少20%',
  },
  coldStorage: {
    name: '凉储间',
    cost: 600,
    detail: '按优先顺序保护20单位易腐货，寿命流逝减半',
  },
  reception: {
    name: '会客间',
    cost: 500,
    detail: '18:00—22:00邀请熟客到家中商谈',
  },
  bedroom: {
    name: '舒适卧房',
    cost: 350,
    detail: '睡眠体力恢复增加15%，仍须充分睡眠',
  },
} as const;
export type FacilityKind = keyof typeof FACILITIES;
export interface HomeAssets {
  cart: boolean;
  events: Record<string, number>;
  visits: Partial<Record<CustomerId, { count: number; at: number }>>;
  facilities: { kind: FacilityKind; installed: boolean }[];
  coldPriority: Good[];
}
export function hasFacility(s: GameState, kind: FacilityKind) {
  return (
    s.housing.id !== 'street' &&
    !s.housing.maintenanceSuspended &&
    s.home.facilities.some((f) => f.kind === kind && f.installed)
  );
}
export function usedHomeSlots(s: GameState) {
  return (
    s.equipment.filter((e) => e.installed).length +
    s.home.facilities.filter((f) => f.installed).length
  );
}

/** Each entry is a one-time conversation; revisiting read stories is free. */
export const HOME_STORIES = {
  baker: [
    '孙娘第一次坐进你家，先夸桌面收拾得干净。她说义塾添了学生，往后送粮最要紧的是守时。临走留下半张备饭单，请你留意下一次食品需求。',
    '孙娘带来一笼刚出锅的饼，说起初到汴梁时也曾连租钱都凑不齐。如今她肯把重要宴席的备货消息先说给你听，嘱你留够生活本钱再接大单。',
  ],
  clothier: [
    '杜掌柜把两块布样摊在你家桌上，一块结实，一块细软。他说客人买布各有所需，便宜并非总能卖快；换季时，他愿先让你知道要收哪一类货。',
    '杜掌柜来时带了一封绣娘的回信。信里夸上回用料整齐。他指着窗边说，做生意的人能在城里安下家，客户也更愿意把长久往来托付给你。',
  ],
  innkeeper: [
    '何叔端起家常饭，聊起酒楼收市后的账。席面热闹，真正费心的是明日还剩多少酒。他愿在下次定席时给你带个信，但客人改期也是常事。',
    '何叔把旧酒单放在桌边，讲起一次商队误期。他当时没有逼供货人赔到关门，而是分几回收齐。今日他也愿与你商量更稳妥的供货节奏。',
  ],
  eggSeller: [
    '陈婆进门先看看你放货的地方。她说鲜蛋怕磕，更怕舍不得卖；看见好价先出一筐，胜过等到临期着急。临走约你下次赶集前再碰个面。',
    '陈婆带了新编的草垫，说从前街坊替她守过几夜鸡舍。如今她也愿把食肆的新需求告诉你。小生意能做长，靠的是日复一日不误事。',
  ],
  merchant: [
    '沈九在灯下摊开渡口的货签，说南来的茶船有时被风耽搁。消息要与市价一起看。他记住了你的住处，下一趟收货前会先递来品类消息。',
    '沈九把磨旧的算盘推到你面前，让你算一笔压货七日的账。算到租钱时，两人都笑了。他说你如今有了退路，才更能从容等一笔值得做的买卖。',
  ],
  ferryman: [
    '周嫂坐下便把船工饭包的清单折好，终于能安稳吃口饭。她说出航时辰比讨价还价要紧，备货别只算货钱，也要算搬到渡口的时间。',
    '周嫂带来船工托写的谢字，说上回补给没有少一份。她问你是否愿意长久留在汴梁，又说无论哪日归乡，渡口总有人记得你送来的那包茶。',
  ],
} as const;

export const HOME_EVENTS = {
  moveRoom:
    '搬进小屋那天，隔壁邻居借来一盏灯。你终于能把货单平放在桌上，听着窗外渐远的叫卖声，慢慢算明日的账。',
  buyYard:
    '房契交到手里时，巷口卖汤的人朝你招招手，说今后这条巷子也算你的家了。院子不大，却容得下货物，也容得下往来的朋友。',
  firstHost:
    '第一位客人告辞后，桌上还留着半盏温茶。你发现住处不仅能放货和睡觉，也能让一段生意之外的交情慢慢长出来。',
  cartTrade:
    '推车的木轮第一次碾过市场石板，你省下的力气终于能留给下一桩生意。旁边的摊主笑说，这才像个打算长久做下去的商人。',
  porterDelivery:
    '脚夫把货卸齐，你照约付了运钱。以前只算进出货价，今天账上多了一项支出，也换回了一段可以自己安排的时间。',
  nightTrade:
    '夜市灯影映着新收的货包，白日吵闹的街口换了另一番生意。你摸摸钱袋，又看一眼时辰，知道这一单还得算上明日的精神。',
} as const;

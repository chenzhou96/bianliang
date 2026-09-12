import { GOODS, GOOD_IDS } from './config.ts';
import type { CustomerId, GameState, Good } from './types.ts';
import { lifeCycle } from './time.ts';

export interface PurchaseRequest {
  id: string;
  customer: CustomerId;
  good: Good;
  quantity: number;
  remaining: number;
  price: number;
  opensAt: number;
  deadline: number;
  reservedUntil: number | null;
}
export interface CargoLot {
  id: string;
  goods: Partial<Record<Good, number>>;
  price: number;
  opensAt: number;
  closesAt: number;
  shelfMinutes: number;
  bought: boolean;
  large: boolean;
}
export interface MarketOpportunities {
  cycle: number;
  requests: PurchaseRequest[];
  lots: CargoLot[];
  milestones: Record<string, number>;
  profitStreak: number;
  profitAtDawn: number;
}
export function newOpportunities(): MarketOpportunities {
  return {
    cycle: -1,
    requests: [],
    lots: [],
    milestones: {},
    profitStreak: 0,
    profitAtDawn: 0,
  };
}
const customers: CustomerId[] = [
  'baker',
  'clothier',
  'innkeeper',
  'eggSeller',
  'merchant',
  'ferryman',
];
const preferred: Record<CustomerId, Good[]> = {
  baker: ['grain', 'wheat', 'flour', 'bread'],
  clothier: ['hemp', 'thread', 'cloth', 'silkRaw'],
  innkeeper: ['wine', 'firewood', 'tea'],
  eggSeller: ['egg', 'saltedEgg'],
  merchant: ['tea', 'herb', 'silk'],
  ferryman: ['grain', 'wheat', 'bread', 'salt'],
};
function pick(seed: number, cycle: number, index: number) {
  let n =
    (seed ^
      Math.imul(cycle + 1, 2246822519) ^
      Math.imul(index + 1, 3266489917)) >>>
    0;
  n = Math.imul(n ^ (n >>> 16), 2246822519) >>> 0;
  return (n ^ (n >>> 13)) >>> 0;
}
export function requestIdentity(seed: number, cycle: number, index: number) {
  const customer = customers[(cycle * 2 + index + (seed % 6)) % 6];
  const options = preferred[customer];
  return { customer, good: options[pick(seed, cycle, index) % options.length] };
}
export const REQUEST_RULES = {
  minimumPriceFactor: 0.95,
  priceFactorSteps: 41,
  expensivePriceFactorSteps: 31,
  grainMinimum: 40,
  grainRange: 41,
  ordinaryMinimum: 12,
  ordinaryRange: 13,
  expensiveMinimum: 4,
  expensiveRange: 9,
} as const;

export function generateOpportunities(s: GameState) {
  const cycle = lifeCycle(s.clock.minute);
  if (s.marketOffers.cycle === cycle) return;
  const base = cycle * 1440;
  s.marketOffers.cycle = cycle;
  s.marketOffers.requests = s.marketOffers.requests.filter(
    (r) =>
      r.reservedUntil != null &&
      r.reservedUntil > s.clock.minute &&
      r.remaining > 0,
  );
  for (let i = 0; i < 2; i++) {
    const { customer, good } = requestIdentity(s.seed, cycle, i);
    const grain = good === 'grain' || good === 'wheat';
    const expensive = GOODS[good].base >= 100;
    const minimum = grain
      ? REQUEST_RULES.grainMinimum
      : expensive
        ? REQUEST_RULES.expensiveMinimum
        : REQUEST_RULES.ordinaryMinimum;
    const range = grain
      ? REQUEST_RULES.grainRange
      : expensive
        ? REQUEST_RULES.expensiveRange
        : REQUEST_RULES.ordinaryRange;
    const quantity = minimum + (pick(s.seed, cycle, i + 10) % range);
    s.marketOffers.requests.push({
      id: `request:${cycle}:${i}`,
      customer,
      good,
      quantity,
      remaining: quantity,
      price: Math.max(
        1,
        Math.floor(
          s.prices[good].buy *
            (REQUEST_RULES.minimumPriceFactor +
              (pick(s.seed, cycle, i + 20) %
                (expensive
                  ? REQUEST_RULES.expensivePriceFactorSteps
                  : REQUEST_RULES.priceFactorSteps)) /
                100),
        ),
      ),
      opensAt: base + 480,
      deadline: base + 1200,
      reservedUntil: null,
    });
  }
  s.marketOffers.lots = [];
  for (let i = 0; i < 3; i++) {
    const night = i > 0;
    const pool = GOOD_IDS.filter(
      (g) =>
        g !== 'hen' &&
        (!night || s.prices[g].buy < 100) &&
        !s.marketOffers.requests.some((r) => r.good === g && r.remaining),
    );
    const start = pick(s.seed, cycle, i + 30) % pool.length;
    const goods: Partial<Record<Good, number>> = {};
    const large =
      !night && Object.values(s.commerce.relations).some((r) => r >= 10);
    for (let j = 0; j < 2; j++)
      goods[pool[(start + j) % pool.length]] = night ? 1 : large ? 8 : 3;
    const retail = Object.entries(goods).reduce(
      (n, [g, q]) => n + s.prices[g as Good].buy * q!,
      0,
    );
    const resale = Object.entries(goods).reduce(
      (n, [g, q]) => n + s.prices[g as Good].sell * q!,
      0,
    );
    const discount = (5 + (pick(s.seed, cycle, i + 40) % 11)) / 100;
    const price = Math.max(resale + 1, Math.ceil(retail * (1 - discount)));
    if (price > Math.floor(retail * 0.95) || (night && price > 240)) continue;
    s.marketOffers.lots.push({
      id: `lot:${cycle}:${i}`,
      goods,
      price,
      opensAt: base + (night ? 1080 : 480),
      closesAt: base + (night ? 1440 : 1080),
      shelfMinutes: night ? 720 : 1440,
      bought: false,
      large,
    });
  }
}
export function knownDemandForecasts(s: GameState) {
  const cycle = lifeCycle(s.clock.minute) + 1;
  return [0, 1]
    .map((i) => requestIdentity(s.seed, cycle, i))
    .filter(
      (r) =>
        s.commerce.relations[r.customer] >= 3 &&
        s.commerce.customers[r.customer]?.met,
    )
    .map((r) => ({
      ...r,
      opensAt: cycle * 1440 + 480,
      deadline: cycle * 1440 + 1200,
    }));
}
export function tradeNet(s: GameState) {
  return s.ledger.tradeRevenue - s.ledger.tradeCost;
}
export const TRADE_MILESTONES: Record<string, string> = {
  firstProfit: '第一笔盈利买卖',
  thousand: '贸易净利一千文',
  cargo: '首次整批采购',
  porter: '首次脚夫交货',
  streak: '连续五日贸易盈利',
  trusted: '首位至交客户',
};
/** One-time narrative rewards; ownership is the persisted milestone timestamp. */
export const TRADE_REWARDS: Record<string, { name: string; story: string }> = {
  firstProfit: {
    name: '第一枚盈余钱',
    story:
      '收摊时，你把赚来的第一文钱单独穿在绳上。它提醒你，进价、脚程和饭钱都算清楚，剩下的才是自己的。',
  },
  thousand: {
    name: '千文旧账册',
    story:
      '账页上的盈亏终于积成一千文。你没有撕去那些亏钱的旧页：错过的行情与付过的运费，也都是这门生意的本钱。',
  },
  cargo: {
    name: '首批货签',
    story:
      '拆开整批货物后，你留下了捆绳上的货签。从今天起，眼光要顾及整批货的去处，不能只盯着其中最便宜的一件。',
  },
  porter: {
    name: '脚夫交讫牌',
    story:
      '脚夫把交讫牌递回来，说货一件不少。你第一次用银钱换回了脚力与时辰，也明白及时交货靠的不只有自己一双手。',
  },
  streak: {
    name: '五日红账笺',
    story:
      '连续五个营业日都有盈余，你把五行账目抄在一张小笺上。往后遇到大起大落，也能记得这些不急不躁的日子。',
  },
  trusted: {
    name: '熟客留名帖',
    story:
      '相熟的客人留下名帖，嘱你有合适的货便来相告。名帖背面写着家常问候；这份交情已经不只是一张买卖清单。',
  },
};
export function updateTradeMilestones(s: GameState) {
  const conditions: Record<string, boolean> = {
    thousand: tradeNet(s) >= 1000,
    streak: s.marketOffers.profitStreak >= 5,
    trusted: Object.values(s.commerce.relations).some((r) => r >= 10),
  };
  for (const [id, complete] of Object.entries(conditions))
    if (complete && s.marketOffers.milestones[id] === undefined)
      s.marketOffers.milestones[id] = s.clock.minute;
}
export function lotWeight(lot: CargoLot) {
  return Object.values(lot.goods).reduce((n, q) => n + q!, 0);
}
export function lotDescription(lot: CargoLot) {
  return Object.entries(lot.goods)
    .map(([g, q]) => `${GOODS[g as Good].name}${q}${GOODS[g as Good].unit}`)
    .join('、');
}

export function publicOpportunities(s: GameState) {
  return {
    requests: s.marketOffers.requests.filter(
      (r) => r.deadline >= s.clock.minute && r.remaining > 0,
    ),
    lots: s.marketOffers.lots.filter(
      (l) =>
        l.opensAt <= s.clock.minute &&
        l.closesAt >= s.clock.minute &&
        !l.bought,
    ),
    forecasts: knownDemandForecasts(s),
    milestones: Object.entries(s.marketOffers.milestones).map(([id, at]) => ({
      id,
      title: TRADE_MILESTONES[id],
      reward: TRADE_REWARDS[id],
      at,
    })),
  };
}

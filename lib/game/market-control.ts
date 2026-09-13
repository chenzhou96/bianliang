import type { GameState, Good } from './types.ts';
import { GOODS, GOOD_IDS } from './config.ts';

export const MARKET_METHODS = {
  promote: {
    name: '招徕买家',
    cash: 30,
    minutes: 60,
    stamina: 8,
    direction: 1,
    detail: '合法：花30文、60分钟、8体力。60%上涨5—15%，20%不变，20%反跌5%。',
  },
  import: {
    name: '联络外埠来货',
    cash: 40,
    minutes: 90,
    stamina: 10,
    direction: -1,
    detail:
      '合法：花40文、90分钟、10体力。60%下跌5—15%，20%不变，20%反涨5%。货款另付。',
  },
  rumor: {
    name: '散布紧缺消息',
    cash: 25,
    minutes: 45,
    stamina: 5,
    direction: 1,
    detail:
      '违法：花25文、45分钟、5体力。45%上涨15—30%，20%反跌10%，35%被查获：罚150文加剩余现金的20%（至多扣光现金）、声望减3、拘押12小时。',
  },
} as const;
export type MarketMethod = keyof typeof MARKET_METHODS;
export interface MarketControl {
  nextAt: number;
  jailedUntil: number;
  expenses: number;
  fines: number;
  last: string;
}
export const newMarketControl = (): MarketControl => ({
  nextAt: 0,
  jailedUntil: 0,
  expenses: 0,
  fines: 0,
  last: '',
});
export function marketMethod(id: MarketMethod) {
  if (!Object.hasOwn(MARKET_METHODS, id)) throw Error('未知行情手段');
  return MARKET_METHODS[id];
}
export function influenceCost(s: GameState, method: MarketMethod, good: Good) {
  return (
    marketMethod(method).cash -
    (method !== 'rumor' &&
    good === 'grain' &&
    (s.buffs.regular ?? 0) > s.clock.minute
      ? 5
      : 0)
  );
}
export function checkInfluence(s: GameState, method: MarketMethod, good: Good) {
  marketMethod(method);
  if (!GOOD_IDS.includes(good)) throw Error('未知商品');
  if (s.clock.minute < s.marketControl.nextAt)
    throw Error('上次奔走后须间隔48小时，不能叠加影响行情');
  if (s.cash < influenceCost(s, method, good)) throw Error('奔走费用不足');
  if (s.stamina < marketMethod(method).stamina) throw Error('奔走体力不足');
}
/** Public rules only. Outcomes are drawn at settlement, never exposed by previews. */
export function settleInfluence(
  s: GameState,
  method: MarketMethod,
  good: Good,
  roll: number,
  size: number,
) {
  const spec = marketMethod(method);
  s.marketControl.nextAt = s.clock.minute + 2880;
  const caught = method === 'rumor' && roll < 0.35;
  let factor = 1;
  if (method === 'rumor') {
    if (!caught) factor = roll < 0.8 ? 1.15 + size * 0.15 : 0.9;
  } else
    factor =
      roll < 0.6
        ? 1 + spec.direction * (0.05 + size * 0.1)
        : roll < 0.8
          ? 1
          : 1 - spec.direction * 0.05;
  const before = s.prices[good].buy;
  const price = Math.max(
    Math.ceil(GOODS[good].base * 0.5),
    Math.min(GOODS[good].base * 2, Math.round(before * factor)),
  );
  s.prices[good] = { buy: price, sell: price };
  const today = s.history.find((h) => h.day === s.day);
  if (today) today.prices[good] = { buy: price, sell: price };
  const fine = caught ? Math.min(s.cash, 150 + Math.floor(s.cash * 0.2)) : 0;
  const reputationLoss = caught ? Math.min(3, s.reputation) : 0;
  if (caught) {
    s.marketControl.jailedUntil = s.clock.minute + 720;
    s.reputation = Math.max(0, s.reputation - 3);
  }
  const text = `${spec.name}：${GOODS[good].name}牌价${before}→${price}文。${caught ? `消息被查实为虚构，罚款${fine}文，声望减少${reputationLoss}，拘押12小时；期间货物、订单与房费照常结算。` : price === before ? '奔走未能改变行情。' : (price - before) * spec.direction > 0 ? '行商跟进了你的安排。' : '对手抢先应变，行情朝预期的反方向走。'}影响仅至下次06:00重新议价，成交前请再看牌价。`;
  s.marketControl.last = text;
  return { fine, text, caught };
}
export function validMarketControl(s: GameState) {
  const c = s.marketControl;
  return (
    !!c &&
    [c.nextAt, c.jailedUntil, c.expenses, c.fines].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    ) &&
    typeof c.last === 'string' &&
    c.jailedUntil <= s.clock.minute + 720 &&
    c.nextAt <= s.clock.minute + 2880
  );
}

import { lotWeight } from './market-opportunities.ts';
import { hasFacility } from './home.ts';
import type { Action, GameState } from './types.ts';
import { transportQuote, type Venue } from './time.ts';

export function actionTiming(
  s: GameState,
  action: Action,
): { minutes: number; venue: Venue } {
  const a = action;
  switch (a.type) {
    case 'reserveRequest':
      return { minutes: 10, venue: 'customer' };
    case 'supplyRequest':
      return {
        minutes: transportQuote(
          a.quantity,
          a.transport ?? 'self',
          hasFacility(s, 'warehouse'),
        ).minutes,
        venue: 'customer',
      };
    case 'buyLot': {
      const lot = s.marketOffers.lots.find((l) => l.id === a.lotId);
      if (!lot) throw Error('货盘已失效');
      return {
        minutes: transportQuote(
          lotWeight(lot),
          a.transport ?? 'self',
          hasFacility(s, 'warehouse'),
        ).minutes,
        venue: lot.opensAt % 1440 === 1080 ? 'nightMarket' : 'market',
      };
    }
    case 'host':
      return { minutes: 60, venue: 'hosting' };
    case 'buyCart':
      return { minutes: 30, venue: 'business' };
    case 'installFacility':
      return {
        minutes: 60,
        venue: s.home.facilities.some((f) => f.kind === a.facility)
          ? 'home'
          : 'business',
      };
    case 'removeFacility':
      return { minutes: 60, venue: 'home' };
    case 'sellFacility':
      return { minutes: 30, venue: 'business' };
    case 'coldPriority':
      return { minutes: 0, venue: 'home' };
    case 'trade':
      return {
        minutes: transportQuote(
          a.quantity * (a.good === 'hen' ? 2 : 1),
          a.transport ?? 'self',
          hasFacility(s, 'warehouse'),
        ).minutes,
        venue: 'market',
      };
    case 'deliverOrder': {
      const order = s.commerce.orders.find((o) => o.id === a.orderId);
      const weight = order
        ? Object.entries(order.goods).reduce(
            (n, [g, q]) => n + q! * (g === 'hen' ? 2 : 1),
            0,
          )
        : 1;
      return {
        minutes: transportQuote(
          weight,
          a.transport ?? 'self',
          hasFacility(s, 'warehouse'),
        ).minutes,
        venue: 'customer',
      };
    }
    case 'acceptOrder':
    case 'declineOrder':
    case 'abandonOrder':
      return { minutes: 10, venue: 'customer' };
    case 'tea':
      return { minutes: 30, venue: 'tea' };
    case 'askIntel':
      return { minutes: 15, venue: 'tea' };
    case 'visitIntel':
    case 'meetCustomer':
    case 'visitCustomer':
      return { minutes: 45, venue: 'customer' };
    case 'short':
      return { minutes: 120, venue: 'business' };
    case 'heavy':
      return { minutes: 240, venue: 'business' };
    case 'learn':
      return { minutes: 120, venue: 'business' };
    case 'rest':
      return { minutes: 60, venue: 'home' };
    case 'snack':
      return { minutes: 15, venue: 'diner' };
    case 'treat':
      return { minutes: a.mode === 'fast' ? 60 : 180, venue: 'business' };
    case 'produce':
      return { minutes: 10 + 2 * a.quantity, venue: 'home' };
    case 'refill':
      return { minutes: 10 + 2 * a.quantity, venue: 'market' };
    case 'cancelProduction':
      return { minutes: 10, venue: 'home' };
    case 'install':
      return {
        minutes: 60,
        venue: s.equipment.some((e) => e.kind === a.equipment)
          ? 'home'
          : 'business',
      };
    case 'uninstall':
      return { minutes: 60, venue: 'home' };
    case 'rent':
    case 'coop':
    case 'rentHousing':
    case 'buyHousing':
    case 'sellHousing':
    case 'endLease':
      return { minutes: 60, venue: 'business' };
    case 'sellEquipment':
    case 'maintain':
      return { minutes: 30, venue: 'business' };
    case 'choice':
      if (s.event?.family === 'work' && a.id === 'accept')
        return {
          minutes: s.event.variant === 'rain' ? 240 : 120,
          venue: 'business',
        };
      return { minutes: 15, venue: 'home' };
    case 'inspect':
      return { minutes: 15, venue: 'home' };
    case 'eat':
      return { minutes: 30, venue: a.meal === 'diner' ? 'diner' : 'home' };
    case 'feed':
      return { minutes: 10 + Math.ceil(a.count / 10) * 5, venue: 'home' };
    case 'sleep':
      return { minutes: a.minutes, venue: 'home' };
    case 'wait':
      return { minutes: a.minutes, venue: 'home' };
    case 'autoFeed':
      return { minutes: 0, venue: 'home' };
    case 'market':
    case 'leave':
    case 'return':
    case 'stay':
      return { minutes: 0, venue: 'home' };
    default:
      throw Error('未知操作');
  }
}

import { lotWeight } from './market-opportunities.ts';
import { hasFacility } from './home.ts';
import type { Action, GameState } from './types.ts';
import {
  transportQuote,
  nextDailyTime,
  lifeCycle,
  OPENING_HOURS,
  canFinishAtVenue,
  type Venue,
} from './time.ts';
import { productionReadyAt } from './production-time.ts';

export function actionTiming(
  s: GameState,
  action: Action,
): { minutes: number; venue: Venue } {
  const a = action;
  switch (a.type) {
    case 'closeDay':
      return {
        minutes: closeDayPlan(s, a).finishAt - s.clock.minute,
        venue: 'home',
      };
    case 'waitUntil':
      return {
        minutes: waitTargetAt(s, a.target) - s.clock.minute,
        venue: 'home',
      };
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

/** Trading counters close after accepting paperwork, not after unloading. */
export function receptionMinutes(action: Action, duration: number) {
  return ['trade', 'buyLot', 'supplyRequest', 'deliverOrder'].includes(
    action.type,
  )
    ? 10
    : duration;
}

export function closeDayPlan(
  s: GameState,
  a: Extract<Action, { type: 'closeDay' }>,
) {
  const finishAt = nextDailyTime(s.clock.minute, 480);
  const meal =
    a.meal && s.life.ateCycle !== lifeCycle(s.clock.minute)
      ? a.meal
      : undefined;
  const mealMinutes = meal ? 30 : 0;
  const sleeping = Math.min(480, finishAt - s.clock.minute - mealMinutes);
  if (sleeping < 60)
    throw Error('距08:00已不足1小时睡眠，请等到08:00或自选睡眠');
  const idle = finishAt - s.clock.minute - mealMinutes - sleeping;
  const segments: {
    kind: 'meal' | 'idle' | 'sleep';
    startsAt: number;
    finishAt: number;
  }[] = [];
  let at = s.clock.minute;
  for (const [kind, minutes] of [
    ['meal', mealMinutes],
    ['idle', idle],
    ['sleep', sleeping],
  ] as const) {
    if (minutes) segments.push({ kind, startsAt: at, finishAt: at + minutes });
    at += minutes;
  }
  return { finishAt, meal, idle, sleeping, segments };
}

export function waitTargetAt(
  s: GameState,
  target: import('./types.ts').WaitTarget,
): number {
  const now = s.clock.minute;
  let at: number;
  if (!target || typeof target !== 'object') throw Error('请选择等待目标');
  switch (target.kind) {
    case 'morning':
      at = nextDailyTime(now, 480);
      break;
    case 'opening': {
      if (
        !['market', 'nightMarket', 'tea', 'customer', 'business'].includes(
          target.venue,
        )
      )
        throw Error('无效营业场所');
      at = nextDailyTime(now, OPENING_HOURS[target.venue][0]);
      break;
    }
    case 'production': {
      const job = s.jobs.find(
        (j) => j.id === target.jobId && j.status === 'queued',
      );
      if (!job) throw Error('该批货没有待完成的生产');
      const ready = productionReadyAt(s, job);
      if (ready === null) throw Error('设备停用，生产暂停，无法预计完工');
      at = ready;
      break;
    }
    case 'delivery': {
      const order = s.commerce.orders.find(
        (o) => o.id === target.orderId && o.status === 'accepted',
      );
      if (!order) throw Error('没有这张待交付订单');
      const action: Action = {
        type: 'deliverOrder',
        orderId: order.id,
        transport: target.transport,
      };
      const duration = actionTiming(s, action).minutes;
      at = order.deadlineAt - duration;
      // Find the latest reception before the contractual delivery deadline.
      while (
        at > now &&
        (!canFinishAtVenue(at, 10, 'customer') ||
          (target.transport === 'porter' &&
            !canFinishAtVenue(at, 10, 'porter')))
      )
        at--;
      break;
    }
    default:
      throw Error('未知等待目标');
  }
  if (!Number.isSafeInteger(at) || at <= now)
    throw Error('该目标已到达，请直接办理');
  if (at - now > 1440) throw Error('目标超过24小时，请稍后再安排');
  return at;
}

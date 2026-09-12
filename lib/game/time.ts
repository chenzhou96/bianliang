/** Continuous game time. All timestamps are minutes since day 1 at midnight. */
export const TIME_RULES = {
  dayMinutes: 1440,
  initialMinute: 480,
  dawn: 360,
  autoFeed: 330,
  maxWait: 1440,
  maxSleep: 600,
  restMinutes: 60,
  restRecovery: 20,
  debtLimit: 12,
  debtCapPenalty: 3,
  minimumStaminaCap: 30,
} as const;

export type DayPeriod = 'dawn' | 'day' | 'dusk' | 'evening' | 'late';
export type Venue =
  | 'market'
  | 'porter'
  | 'business'
  | 'tea'
  | 'customer'
  | 'nightMarket'
  | 'diner'
  | 'hosting'
  | 'home';
export const OPENING_HOURS: Record<Venue, readonly [number, number]> = {
  market: [480, 1080],
  porter: [480, 1080],
  business: [480, 1080],
  tea: [540, 1260],
  customer: [480, 1200],
  nightMarket: [1080, 1440],
  diner: [360, 1440],
  hosting: [1080, 1320],
  home: [0, 1440],
};

export interface GameClock {
  minute: number;
  awakeMinutes: number;
  sleepDebt: number;
}

export function newClock(): GameClock {
  return { minute: TIME_RULES.initialMinute, awakeMinutes: 0, sleepDebt: 0 };
}

export function validClock(value: unknown): value is GameClock {
  if (!value || typeof value !== 'object') return false;
  const c = value as GameClock;
  return (
    Number.isSafeInteger(c.minute) &&
    c.minute >= TIME_RULES.initialMinute &&
    Number.isSafeInteger(c.awakeMinutes) &&
    c.awakeMinutes >= 0 &&
    Number.isFinite(c.sleepDebt) &&
    c.sleepDebt >= 0 &&
    c.sleepDebt <= TIME_RULES.debtLimit
  );
}

export function timeOfDay(minute: number) {
  return ((minute % 1440) + 1440) % 1440;
}

export function clockDay(minute: number) {
  return Math.floor(minute / 1440) + 1;
}

export function lifeCycle(minute: number) {
  return Math.floor((minute - TIME_RULES.dawn) / 1440);
}

export function dayPeriod(minute: number): DayPeriod {
  const t = timeOfDay(minute);
  if (t < 360 || t >= 1320) return 'late';
  if (t < 480) return 'dawn';
  if (t < 1080) return 'day';
  if (t < 1200) return 'dusk';
  return 'evening';
}

export function formatClock(minute: number) {
  const t = timeOfDay(minute);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function formatMoment(minute: number) {
  return `第${clockDay(minute)}日 ${formatClock(minute)}`;
}

export function relativeMoment(minute: number, now: number) {
  const days = clockDay(minute) - clockDay(now);
  const date =
    days === 0 ? '今天' : days === 1 ? '明天' : `第${clockDay(minute)}日`;
  return `${date}${formatClock(minute)}`;
}

export function citySchedule(now: number) {
  return [
    { at: 330, text: '自动喂鸡（开启后使用存粮）' },
    { at: 360, text: '检查饮食、缴房费、母鸡产蛋，更新行情' },
    { at: 480, text: '市场、招工、学艺与房屋买卖开门' },
    { at: 540, text: '茶馆开门' },
    { at: 1080, text: '普通市场与招工收工，夜市开张，可在家待客' },
    { at: 1200, text: '熟客停止收货与接待' },
    { at: 1260, text: '茶馆打烊' },
    { at: 1320, text: '停止待客，熬夜做事更费体力' },
    { at: 0, text: '夜市与食肆打烊' },
    { at: 120, text: '继续熬夜开始损害健康，越晚越严重' },
  ]
    .map((item) => ({ ...item, at: nextDailyTime(now, item.at) }))
    .sort((a, b) => a.at - b.at);
}

export function traditionalHour(minute: number) {
  return (
    ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][
      Math.floor((timeOfDay(minute) + 60) / 120) % 12
    ] + '时'
  );
}

/** Strictly future occurrence: an event at the current minute is already settled. */
export function nextDailyTime(minute: number, at: number) {
  const candidate = Math.floor(minute / 1440) * 1440 + at;
  return candidate > minute ? candidate : candidate + 1440;
}

export function nextOpening(minute: number, venue: Venue) {
  if (venue === 'home') return minute;
  const [open, close] = OPENING_HOURS[venue];
  const t = timeOfDay(minute);
  if (t >= open && t < close) return minute;
  return t < open
    ? Math.floor(minute / 1440) * 1440 + open
    : (Math.floor(minute / 1440) + 1) * 1440 + open;
}

export function canFinishAtVenue(
  minute: number,
  duration: number,
  venue: Venue,
) {
  if (!Number.isSafeInteger(duration) || duration < 0) return false;
  if (venue === 'home') return true;
  const t = timeOfDay(minute);
  const [open, close] = OPENING_HOURS[venue];
  return t >= open && t < close && t + duration <= close;
}

export function staminaCap(health: number, debt: number) {
  const base = health >= 70 ? 100 : health >= 40 ? 80 : 60;
  return Math.max(TIME_RULES.minimumStaminaCap, base - debt * 3);
}

/** Evaluate at minute midpoints to integrate linear penalties without action rounding. */
export function exertionMultiplier(minute: number, awakeMinutes: number) {
  const t = timeOfDay(minute);
  const lateHours = t >= 1320 ? (t - 1320) / 60 : t < 360 ? (t + 120) / 60 : 0;
  const prolonged = Math.min(1, Math.max(0, (awakeMinutes - 1080) / 60) * 0.1);
  return Math.min(3, 1 + lateHours * 0.1 + prolonged);
}

export function wakingHealthLossPerMinute(
  minute: number,
  awakeMinutes: number,
) {
  const t = timeOfDay(minute);
  const lateRate = t >= 120 && t < 360 ? 1 + (t - 120) / 60 : 0;
  return (lateRate + (awakeMinutes > 1440 ? 2 : 0)) / 60;
}

export function sleepEfficiency(minute: number) {
  const t = timeOfDay(minute);
  return t >= 1320 || t < 480 ? 1 : 0.8;
}

export interface TimeProjection {
  clock: GameClock;
  healthLoss: number;
  averageExertion: number;
  recovery: number;
}

/** Pure projection; callers apply scheduled world events while committing time. */
export function projectTime(
  clock: GameClock,
  minutes: number,
  options: {
    sleeping?: boolean;
    recoveryForEightHours?: number;
    bedroom?: boolean;
  } = {},
): TimeProjection {
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < 0 ||
    minutes > TIME_RULES.maxWait
  )
    throw Error('单次时间推进须为0至1440分钟的整数');
  if (options.sleeping && (minutes < 60 || minutes > TIME_RULES.maxSleep))
    throw Error('睡眠时长须为1至10小时');
  const next = { ...clock };
  let healthLoss = 0;
  let exertion = 0;
  let recovery = 0;
  for (let i = 0; i < minutes; i++) {
    const midpoint = next.minute + 0.5;
    if (options.sleeping) {
      next.sleepDebt = Math.max(0, next.sleepDebt - 1 / 30);
      recovery +=
        ((options.recoveryForEightHours ?? 0) / 480) *
        sleepEfficiency(midpoint) *
        (options.bedroom ? 1.15 : 1);
    } else {
      healthLoss += wakingHealthLossPerMinute(
        midpoint,
        next.awakeMinutes + 0.5,
      );
      exertion += exertionMultiplier(midpoint, next.awakeMinutes + 0.5);
      next.awakeMinutes++;
      next.sleepDebt = Math.min(12, next.sleepDebt + 1 / 120);
    }
    next.minute++;
  }
  if (options.sleeping && minutes >= 240) next.awakeMinutes = 0;
  return {
    clock: next,
    healthLoss,
    averageExertion: minutes && !options.sleeping ? exertion / minutes : 1,
    recovery,
  };
}

export type Transport = 'self' | 'cart' | 'porter';
export function transportQuote(
  weight: number,
  transport: Transport,
  warehouse = false,
) {
  if (!Number.isFinite(weight) || weight <= 0) throw Error('搬运重量必须大于0');
  const rates = { self: [2, 1], cart: [1, 0.5], porter: [0.25, 0.1] } as const;
  if (!(transport in rates)) throw Error('请选择有效的搬运方式');
  const [minutes, energy] = rates[transport];
  return {
    minutes: 10 + Math.ceil(weight * minutes * (warehouse ? 0.8 : 1)),
    stamina: weight * energy,
    fee: transport === 'porter' ? Math.max(10, Math.ceil(weight)) : 0,
  };
}

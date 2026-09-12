import { TIME_RULES, nextDailyTime } from './time.ts';

/** Equal-time ordering is part of the game contract, not insertion order. */
export const EVENT_PRIORITY = {
  health: 0,
  spoilage: 10,
  housing: 20,
  production: 30,
  feeding: 30,
  market: 40,
  completion: 50,
  deadline: 60,
} as const;
export type TimelineEventKind = keyof typeof EVENT_PRIORITY;
export interface TimelineEvent {
  id: string;
  at: number;
  kind: TimelineEventKind;
}

/**
 * Build a deterministic queue for (from, through]. The engine supplies known
 * entity deadlines; this function neither reveals nor rolls future outcomes.
 */
export function timelineEvents(
  from: number,
  through: number,
  scheduled: readonly TimelineEvent[],
): TimelineEvent[] {
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(through) ||
    from < 0 ||
    through < from ||
    through - from > TIME_RULES.maxWait
  )
    throw Error('无效的时间推进范围');
  const queue: TimelineEvent[] = [];
  const ids = new Set<string>();
  for (const event of scheduled) {
    if (
      !event.id ||
      event.id.startsWith('clock:') ||
      !Number.isSafeInteger(event.at) ||
      event.at < 0 ||
      !Object.hasOwn(EVENT_PRIORITY, event.kind) ||
      ids.has(event.id)
    )
      throw Error('无效或重复的定时事项');
    ids.add(event.id);
    if (event.at > from && event.at <= through) queue.push({ ...event });
  }
  for (
    let at = nextDailyTime(from, TIME_RULES.autoFeed);
    at <= through;
    at += 1440
  )
    queue.push({ id: `clock:autofeed:${at}`, at, kind: 'feeding' });
  for (
    let at = nextDailyTime(from, TIME_RULES.dawn);
    at <= through;
    at += 1440
  ) {
    queue.push(
      { id: `clock:housing:${at}`, at, kind: 'housing' },
      { id: `clock:life:${at}`, at, kind: 'feeding' },
      { id: `clock:market:${at}`, at, kind: 'market' },
    );
  }
  return queue.sort(
    (a, b) =>
      a.at - b.at ||
      EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

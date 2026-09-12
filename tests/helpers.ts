import assert from 'node:assert/strict';
import { dispatch } from '../lib/game/engine.ts';
import { generateOpportunities } from '../lib/game/market-opportunities.ts';
import { nextDailyTime, lifeCycle } from '../lib/game/time.ts';
import type { Action, Bed, GameState } from '../lib/game/types.ts';
export function act(s: GameState, action: Action) {
  const r = dispatch(s, action);
  assert.equal(r.error, undefined, `${action.type}: ${r.error}`);
  return r.state;
}
/** Fixture clock changes keep all time-derived state consistent. */
export function setDay(s: GameState, day: number, minute = 480) {
  s.day = day;
  s.clock.minute = (day - 1) * 1440 + minute;
  s.life.lastDawn = (day - 1) * 1440 + 360;
  generateOpportunities(s);
}
export function closeDay(
  s: GameState,
  bed: Bed = s.housing.id === 'street' ? 'inn' : s.housing.id,
) {
  if (s.event)
    s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
  if (s.life.ateCycle !== lifeCycle(s.clock.minute))
    s = act(s, { type: 'eat', meal: 'diner' });
  const evening = nextDailyTime(s.clock.minute, 1320);
  if (s.clock.minute % 1440 < 1320)
    s = act(s, { type: 'wait', minutes: evening - s.clock.minute });
  s = act(s, { type: 'sleep', minutes: 480, bed });
  if (s.clock.minute % 1440 < 480)
    s = act(s, { type: 'wait', minutes: 480 - (s.clock.minute % 1440) });
  return s;
}

import type { Buff, GameState } from './types.ts';

/** Durations in real game minutes, independent of midnight and daily refresh. */
export const STATUS_DURATION: Record<Buff, number> = {
  outsider: 3 * 1440,
  regular: 5 * 1440,
  tired: 1440,
  cold: 2 * 1440,
  warm: 8 * 60,
};

export function statusActive(s: GameState, buff: Buff): boolean {
  return (s.buffs[buff] ?? 0) > s.clock.minute;
}

import type { GameState, IntelEntry } from './types.ts';

/** Public developments appear without paying to revisit the original source. */
export function knownIntel(s: GameState, i: IntelEntry) {
  const w = s.worlds.find((w) => w.id === i.worldId);
  if (w && s.day >= w.start && w.truth !== 'false')
    return { status: 'confirmed' as const, publicUpdate: w.publicText };
  if (w && s.day > w.expected + 3)
    return {
      status: 'wrong' as const,
      publicUpdate: '所传时限已过，暂未出现约定的公开动静；不再需要专程回访。',
    };
  if (!w && s.day > i.usefulUntil)
    return {
      status: 'expired' as const,
      publicUpdate: '这条旧消息已过了可追索的时限。',
    };
  return { status: 'new' as const, publicUpdate: null };
}

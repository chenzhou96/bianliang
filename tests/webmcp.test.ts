import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, maybeEncounter, newGame } from '../lib/game/engine.ts';
import { registerGameTools, publicState, type ModelContext } from '../lib/game/webmcp.ts';

void test('optional tools expose only known v2 state and reject stale actions', async () => {
  let s = newGame(123); s.day = 2; maybeEncounter(s, true);
  const visible = JSON.stringify(publicState(s));
  assert(!visible.includes('hiddenFact')); assert(!visible.includes('outcomes')); assert(!visible.includes('rng'));
  s.event = null;
  const registered = new Map<string, Parameters<ModelContext['registerTool']>[0]>(); let signal: AbortSignal | undefined;
  const cleanup = registerGameTools({ registerTool: (tool, options) => { registered.set(tool.name, tool); signal = options.signal; } }, () => s, (a, r) => { const result = dispatch(s, a, r); if (!result.error) s = result.state; return result.error ? { error: result.error } : {}; });
  assert.equal(registered.size, 2); assert.equal(registered.get('read_bianliang_game')?.annotations.readOnlyHint, true);
  const tool = registered.get('perform_bianliang_action')!; const before = s.cash;
  await tool.execute({ revision: s.revision, action: { type: 'short' } }); assert.equal(s.cash, before + 25);
  const state = structuredClone(s); const stale = await tool.execute({ revision: 0, action: { type: 'short' } }) as { error: string }; assert(stale.error); assert.deepEqual(s, state);
  const bad = await tool.execute({}) as { error: string }; assert(bad.error); cleanup(); assert(signal?.aborted);
});

void test('unresolved city report outcomes stay private', () => {
  let s = newGame(12);
  s.worlds = [];
  s = dispatch(s, { type: 'tea' }).state;
  assert(s.intel.some(i => i.resolution));
  const visible = JSON.stringify(publicState(s));
  assert(!visible.includes('resolution'));
  assert(!visible.includes('happens'));
});

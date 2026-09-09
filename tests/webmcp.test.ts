import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch, maybeEncounter } from '../lib/game/engine.ts';
import {
  registerGameTools,
  publicState,
  type ModelContext,
} from '../lib/game/webmcp.ts';
void test('optional tools share engine, reject stale actions, hide unresolved outcomes', async () => {
  let s = newGame(123);
  s.day = 2;
  maybeEncounter(s, true);
  const visible = JSON.stringify(publicState(s));
  assert(!visible.includes('hiddenFact'));
  assert(!visible.includes('outcomes'));
  assert(!visible.includes('inspection'));
  assert(!visible.includes('rng'));
  s.event = null;
  const registered = new Map<
    string,
    Parameters<ModelContext['registerTool']>[0]
  >();
  let signal: AbortSignal | undefined;
  const cleanup = registerGameTools(
    {
      registerTool: (tool, options) => {
        registered.set(tool.name, tool);
        signal = options.signal;
      },
    },
    () => s,
    (a, r) => {
      const result = dispatch(s, a, r);
      if (!result.error) s = result.state;
      return result.error ? { error: result.error } : {};
    },
  );
  assert.equal(registered.size, 2);
  assert.equal(
    registered.get('read_bianliang_game')?.annotations.readOnlyHint,
    true,
  );
  const tool = registered.get('perform_bianliang_action')!;
  const before = s.cash;
  await tool.execute({ revision: s.revision, action: { type: 'short' } });
  assert.equal(s.cash, before + 60);
  const state = structuredClone(s);
  const stale = (await tool.execute({
    revision: 0,
    action: { type: 'short' },
  })) as { error: string };
  assert(stale.error);
  assert.deepEqual(s, state);
  const bad = (await tool.execute({})) as { error: string };
  assert(bad.error);
  cleanup();
  assert(signal?.aborted);
});

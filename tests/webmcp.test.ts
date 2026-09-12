import { setDay } from './helpers.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, maybeEncounter, newGame } from '../lib/game/engine.ts';
import {
  registerGameTools,
  publicState,
  type ModelContext,
} from '../lib/game/webmcp.ts';

void test('optional tools expose only known v3 state and reject stale actions', async () => {
  let s = newGame(123);
  setDay(s, 2, 540);
  maybeEncounter(s, true);
  const visible = JSON.stringify(publicState(s));
  assert(!visible.includes('hiddenFact'));
  assert(!visible.includes('outcomes'));
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
  assert.equal(registered.size, 3);
  assert.equal(
    registered.get('read_bianliang_game')?.annotations.readOnlyHint,
    true,
  );
  const tool = registered.get('perform_bianliang_action')!;
  const before = s.cash;
  await tool.execute({ revision: s.revision, action: { type: 'short' } });
  assert.equal(s.cash, before + 25);
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

void test('unresolved city report outcomes stay private', () => {
  let s = newGame(12);
  s.clock.minute = 540;
  s.worlds = [];
  s = dispatch(s, { type: 'tea' }).state;
  assert(s.intel.some((i) => i.resolution));
  const visible = JSON.stringify(publicState(s));
  assert(!visible.includes('resolution'));
  assert(!visible.includes('happens'));
});

void test('public action previews share maxima and confirmation without mutating state', async () => {
  let s = newGame(21);
  s = dispatch(s, { type: 'market' }).state;
  const original = structuredClone(s);
  const registered = new Map<
    string,
    Parameters<ModelContext['registerTool']>[0]
  >();
  registerGameTools(
    {
      registerTool: (tool) => {
        registered.set(tool.name, tool);
      },
    },
    () => s,
    () => ({}),
  );
  const preview = (await registered.get('preview_bianliang_action')!.execute({
    action: { type: 'trade', good: 'grain', side: 'buy', quantity: 1 },
  })) as { maximum: number; revision: number };
  assert(preview.maximum > 0);
  assert.equal(preview.revision, s.revision);
  assert.deepEqual(s, original);
  assert(publicState(s).todayTasks);
});

void test('verification requires asking and public state masks unearned legacy clues', () => {
  let s = newGame(20260912);
  s.clock.minute = 540;
  const tea = dispatch(s, { type: 'tea' });
  assert.equal(tea.error, undefined);
  s = tea.state;
  s.event = null;
  const entry = s.intel.find((i) => i.resolution)!;
  assert(entry);
  setDay(s, entry.resolution!.due + 1, 540);
  const denied = dispatch(s, { type: 'visitIntel', id: entry.id });
  assert.match(denied.error!, /先追问出处/);
  assert.equal(denied.state, s);
  entry.followUp = 'SECRET VERIFICATION';
  entry.status = 'confirmed';
  const world = s.worlds[0];
  world.heard = true;
  world.clueKnown = true;
  world.clue = 'SECRET WORLD CLUE';
  assert(!JSON.stringify(publicState(s)).includes('SECRET'));
  const asked = dispatch(s, { type: 'askIntel', id: entry.id });
  assert.equal(asked.error, undefined);
  assert.equal(
    asked.state.intel.find((i) => i.id === entry.id)!.visited,
    undefined,
  );
  const known = publicState(asked.state) as {
    intelligence: { id: string; status: string; followUp?: string }[];
  };
  assert.equal(
    known.intelligence.find((i) => i.id === entry.id)!.status,
    'new',
  );
  const visited = dispatch(asked.state, { type: 'visitIntel', id: entry.id });
  assert.equal(visited.error, undefined);
  assert.equal(
    visited.state.intel.find((i) => i.id === entry.id)!.followUp,
    entry.resolution!.text,
  );
});

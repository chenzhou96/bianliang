import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  maybeEncounter,
  readSave,
} from '../lib/game/engine.ts';
import { STORIES } from '../lib/game/stories.ts';
import { discoverStory } from '../lib/game/story-engine.ts';
import { setDay } from './helpers.ts';

await test('情报冷却从实际听完时刻累计，不按午夜截短', () => {
  const s = newGame(41);
  setDay(s, 2, 1190);
  const r = dispatch(s, { type: 'tea' });
  assert.equal(r.error, undefined);
  assert.equal(r.state.clock.minute, 2660);
  const fresh = r.state.intel;
  assert.ok(fresh.length > 0);
  for (const i of fresh) {
    assert.equal(r.state.intelSeen[i.semantic], 2660 + 7 * 1440);
  }
  assert.deepEqual(readSave(JSON.stringify(r.state)), r.state);
});

await test('情报冷却未到期且无新内容时不扣茶钱或时间，到时可以听取', () => {
  const s = newGame(43);
  setDay(s, 2, 540);
  s.encounterDay = 2;
  for (const d of STORIES) discoverStory(s, d.id, 'tea');
  s.intelSeen = Object.fromEntries(
    s.worlds.map((w) => [`market:${w.family}`, s.clock.minute + 1]),
  );
  const original = structuredClone(s);
  const early = dispatch(s, { type: 'tea' });
  assert.match(early.error ?? '', /没有新消息/);
  assert.deepEqual(early.state, original);
  const waited = dispatch(s, { type: 'wait', minutes: 1 });
  const ready = dispatch(waited.state, { type: 'tea' });
  assert.equal(ready.error, undefined);
  assert.equal(ready.state.intel.length, 1);
});

await test('午夜不会重置已经使用的生活周期遭遇机会', () => {
  const s = newGame(45);
  setDay(s, 2, 1439);
  s.encounterDay = 2;
  const r = dispatch(s, { type: 'wait', minutes: 2 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.day, 3);
  maybeEncounter(r.state, true);
  assert.equal(r.state.event, null);
});

await test('人物后续跨午夜按精确到期时刻直接更新故事，不强制生成新遭遇', () => {
  const s = newGame(47);
  setDay(s, 2, 1439);
  const q = discoverStory(s, 'broken-eggs', 'encounter', 'letter');
  q.availableAt = 2881;
  const midnight = dispatch(s, { type: 'wait', minutes: 1 }).state;
  assert.equal(midnight.stories[0].status, 'waiting');
  const due = dispatch(midnight, { type: 'wait', minutes: 1 }).state;
  assert.equal(due.stories[0].status, 'active');
  assert.equal(due.event, null);
  assert.deepEqual(readSave(JSON.stringify(due)), due);
});

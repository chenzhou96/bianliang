import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  maybeEncounter,
  readSave,
} from '../lib/game/engine.ts';
import { EVENTS, INFO_TEMPLATES } from '../lib/game/content.ts';
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
    assert.equal(r.state.intelSeen[i.semantic], 2660 + 20 * 1440);
    const t = INFO_TEMPLATES.find((t) => t.id === i.templateId)!;
    assert.equal(r.state.intelSeen[`skeleton:${t.skeleton}`], 2660 + 7 * 1440);
  }
  assert.deepEqual(readSave(JSON.stringify(r.state)), r.state);
});

await test('情报冷却未到期且无新内容时不扣茶钱或时间，到时可以听取', () => {
  const s = newGame(43);
  setDay(s, 2, 540);
  s.encounterDay = 2;
  s.intelSeen = Object.fromEntries(
    INFO_TEMPLATES.map((t) => [t.semantic, s.clock.minute + 1]),
  );
  const original = structuredClone(s);
  const early = dispatch(s, { type: 'tea' });
  assert.match(early.error ?? '', /没有新消息/);
  assert.deepEqual(early.state, original);
  const waited = dispatch(s, { type: 'wait', minutes: 1 });
  const ready = dispatch(waited.state, { type: 'tea' });
  assert.equal(ready.error, undefined);
  assert.equal(ready.state.intel.length, 3);
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

await test('人物后续跨午夜仍等待精确到期时刻，不提前触发', () => {
  const s = newGame(47);
  setDay(s, 2, 1439);
  s.relations.widow = 1000;
  s.followups = [
    {
      chain: 'widow',
      person: '王婶',
      dueAt: 2881,
      source: 1000,
      branch: 'gift',
    },
  ];
  s.cooldowns = Object.fromEntries(
    ['work', 'meal', 'shelter', 'doctor'].map((id) => [id, 99999]),
  );
  // Keep every unrelated family on cooldown so only the follow-up can appear.
  for (const f of EVENTS) s.cooldowns[f.id] = 99999;
  const midnight = dispatch(s, { type: 'wait', minutes: 1 }).state;
  maybeEncounter(midnight, true);
  assert.equal(midnight.event, null);
  const due = dispatch(midnight, { type: 'wait', minutes: 1 }).state;
  maybeEncounter(due, true);
  assert.ok(due.event);
  assert.equal(due.followups.length, 0);
  assert.deepEqual(readSave(JSON.stringify(due)), due);
});

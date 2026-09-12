import { publicState } from '../lib/game/webmcp.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  active,
  dispatch,
  maybeEncounter,
  newGame,
  readSave,
} from '../lib/game/engine.ts';
import { EVENTS } from '../lib/game/content.ts';
import { STATUS_DURATION } from '../lib/game/status.ts';
import { setDay } from './helpers.ts';

await test('状态跨午夜保留，到绝对分钟立即失效并记录反馈', () => {
  const s = newGame(21);
  s.clock.minute = 1439;
  s.buffs.regular = 1441;
  let result = dispatch(s, { type: 'wait', minutes: 1 });
  assert.equal(result.error, undefined);
  assert.equal(active(result.state, 'regular'), true);
  assert.equal(
    publicState(result.state).statusEffects?.find(
      (effect) => effect.id === 'regular',
    )?.expiresAt,
    1441,
  );
  result = dispatch(result.state, { type: 'wait', minutes: 1 });
  assert.equal(result.error, undefined);
  assert.equal(active(result.state, 'regular'), false);
  assert.ok(
    !publicState(result.state).statusEffects?.some(
      (effect) => effect.id === 'regular',
    ),
  );
  assert.ok(
    result.result?.states.some((v) => v.buff === 'regular' && !v.active),
  );
  assert.deepEqual(readSave(JSON.stringify(result.state)), result.state);
});

await test('风寒按实际分钟扣健康，到期后不再扣，拆分等待结果一致', () => {
  const s = newGame(23);
  s.buffs.cold = s.clock.minute + 60;
  const whole = dispatch(s, { type: 'wait', minutes: 120 });
  assert.equal(whole.error, undefined);
  let split = s;
  for (let i = 0; i < 120; i++) {
    const result = dispatch(split, { type: 'wait', minutes: 1 });
    assert.equal(result.error, undefined);
    split = result.state;
  }
  assert.ok(Math.abs(whole.state.health - (100 - 2 / 24)) < 1e-8);
  assert.equal(split.health, whole.state.health);
  assert.equal(STATUS_DURATION.cold, 2880);
});

await test('热饭余温只在有效时段增加睡眠恢复', () => {
  const s = newGame(25);
  s.stamina = 0;
  const plain = dispatch(s, { type: 'sleep', bed: 'inn', minutes: 120 });
  s.buffs.warm = s.clock.minute + 60;
  const warmed = dispatch(s, { type: 'sleep', bed: 'inn', minutes: 120 });
  assert.equal(warmed.error, undefined);
  assert.ok(Math.abs(warmed.state.stamina - plain.state.stamina - 0.5) < 1e-8);
  assert.equal(active(warmed.state, 'warm'), false);
});

await test('遭遇冷却按绝对时点开放，未到期无法强制触发', () => {
  const s = newGame(27);
  setDay(s, 2, 480);
  s.cooldowns = Object.fromEntries(
    EVENTS.map((e) => [e.id, s.clock.minute + 60]),
  );
  maybeEncounter(s, true);
  assert.equal(s.event, null);
  const result = dispatch(s, { type: 'wait', minutes: 60 });
  assert.equal(result.error, undefined);
  maybeEncounter(result.state, true);
  assert.ok(result.state.event);
  assert.equal(
    result.state.cooldowns[result.state.event.family],
    result.state.clock.minute + 7 * 1440,
  );
});

await test('存档拒绝非法状态期限与冷却数值', () => {
  for (const value of [-1, 1.5, 'later']) {
    const s = newGame(29);
    s.buffs.cold = value as number;
    assert.throws(() => readSave(JSON.stringify(s)));
    s.buffs = {};
    s.cooldowns.work = value as number;
    assert.throws(() => readSave(JSON.stringify(s)));
  }
});

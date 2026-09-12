import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newGame, readSave } from '../lib/game/engine.ts';
import { publicState } from '../lib/game/webmcp.ts';

void test('structured feedback uses actual recovery and work costs, with immutable failures', () => {
  const s = newGame(42);
  s.stamina = 95;
  const rest = dispatch(s, { type: 'rest' });
  assert.ok(Math.abs(rest.result!.stamina - 5) < 1e-8);
  assert.equal(rest.result?.cash, 0);
  assert.equal(rest.state.operationHistory.length, 1);
  const failed = dispatch(rest.state, { type: 'rest' }, 0);
  assert(failed.error);
  assert.equal(failed.result?.success, false);
  assert.equal(failed.result?.stamina, 0);
  assert.equal(failed.state, rest.state);
  const tired = structuredClone(rest.state);
  tired.buffs.tired = tired.clock.minute + 1440;
  const work = dispatch(tired, { type: 'short' });
  assert.ok(Math.abs(work.result!.stamina + 30) < 1e-8);
  assert.equal(work.result?.cash, 25);
  assert.equal(work.result?.workRemaining, null);
  assert.equal(
    dispatch(work.state, { type: 'short' }, 0).result?.success,
    false,
  );
});

void test('navigation preserves results and sale feedback reconciles inventory and ledger', () => {
  let s = dispatch(newGame(7), { type: 'market' }).state;
  const bought = dispatch(s, {
    type: 'trade',
    good: 'herb',
    quantity: 1,
    side: 'buy',
  });
  assert.deepEqual(bought.result?.items, [{ good: 'herb', quantity: 1 }]);
  assert.equal(bought.result?.cash, -113);
  const sale = dispatch(bought.state, {
    type: 'trade',
    good: 'herb',
    quantity: 1,
    side: 'sell',
  });
  assert.deepEqual(sale.result?.sale, { revenue: 97, cost: 113, profit: -16 });
  s = dispatch(sale.state, { type: 'leave' }).state;
  assert.deepEqual(s.operationHistory, sale.state.operationHistory);
  assert.equal(s.lastResponse, sale.state.lastResponse);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  assert.deepEqual(publicState(s).lastOperation, sale.result);
});

void test('production feedback records inputs, output and earned experience, never cancelled XP', () => {
  let s = newGame(8);
  s.housing.id = 'room';
  s.skills.food = 1;
  s.equipment = [{ id: 901, kind: 'mill', installed: true, jobId: null }];
  const made = dispatch(s, { type: 'produce', recipeId: 'flour', quantity: 1 });
  assert.equal(made.error, undefined);
  assert.deepEqual(made.result?.items, [
    { good: 'wheat', quantity: -2 },
    { good: 'flour', quantity: 2 },
  ]);
  assert(made.result?.skills.some((k) => k.skill === 'food' && k.xp > 0));
  s = made.state;
  s.cash = 5000;
  s.skills.brewing = 1;
  s.equipment.push({ id: 902, kind: 'brewVat', installed: true, jobId: null });
  const batch = dispatch(s, { type: 'produce', recipeId: 'wine', quantity: 1 });
  assert.equal(batch.error, undefined);
  assert.equal(batch.result?.jobs[0].status, 'queued');
  assert.equal(
    batch.result?.jobs[0].readyAt,
    batch.state.clock.minute + 3 * 1440,
  );
  const cancel = dispatch(batch.state, {
    type: 'cancelProduction',
    jobId: batch.result!.jobs[0].id,
  });
  assert.equal(cancel.result?.jobs[0].status, 'abandoned');
  assert.deepEqual(cancel.result?.skills, []);
});

void test('old and future saves are rejected, while continuous actions retain bounded feedback', () => {
  let s = newGame(10);
  const old = JSON.parse(JSON.stringify(s));
  delete old.saveRevision;
  delete old.operationHistory;
  assert.throws(() => readSave(JSON.stringify(old)));
  assert.throws(
    () => readSave(JSON.stringify({ ...s, saveRevision: 999 })),
    /版本不兼容/,
  );
  for (let i = 0; i < 60; i++) {
    s.stamina = 60;
    s.health = 100;
    s = dispatch(s, { type: 'rest' }).state;
  }
  assert.equal(s.operationHistory.length, 50);
  assert.equal(new Set(s.operationHistory.map((r) => r.id)).size, 50);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

void test('malformed optional feedback cannot enter a loaded game', () => {
  const s = dispatch(newGame(10), { type: 'short' }).state;
  for (const patch of [
    { customers: [{ id: 'unknown', change: 1 }] },
    { milestones: ['unknown'] },
    { sale: { revenue: '1' } },
    { workRemaining: '2' },
  ]) {
    const bad = structuredClone(s);
    Object.assign(bad.operationHistory[0], patch);
    assert.throws(() => readSave(JSON.stringify(bad)));
  }
});

void test('完成记录保存实际起止时刻，跨午夜与失败耗时可核对，伪造时间拒绝', () => {
  const s = newGame(19);
  s.clock.minute = 1430;
  const done = dispatch(s, { type: 'wait', minutes: 30 });
  assert.equal(done.error, undefined);
  assert.equal(done.result?.startedAt, 1430);
  assert.equal(done.result?.finishedAt, 1460);
  assert.deepEqual(readSave(JSON.stringify(done.state)), done.state);
  const bad = dispatch(done.state, { type: 'sleep', bed: 'inn', minutes: 601 });
  assert.ok(bad.error);
  assert.equal(bad.result?.startedAt, bad.result?.finishedAt);
  for (const patch of [
    { startedAt: 1500 },
    { finishedAt: 1500 },
    { startedAt: -1 },
  ]) {
    const corrupt = structuredClone(done.state);
    Object.assign(corrupt.operationHistory[0], patch);
    assert.throws(() => readSave(JSON.stringify(corrupt)));
  }
});

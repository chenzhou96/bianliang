import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, newGame, readSave } from '../lib/game/engine.ts';
import { publicState } from '../lib/game/webmcp.ts';

void test('structured feedback uses actual recovery and work costs, with immutable failures', () => {
  const s = newGame(42);
  s.stamina = 95;
  const rest = dispatch(s, { type: 'rest' });
  assert.equal(rest.result?.stamina, 5);
  assert.equal(rest.result?.cash, 0);
  assert.equal(rest.state.operationHistory.length, 1);
  const failed = dispatch(rest.state, { type: 'rest' });
  assert(failed.error);
  assert.equal(failed.result?.success, false);
  assert.equal(failed.result?.stamina, 0);
  assert.equal(failed.state, rest.state);
  const tired = structuredClone(rest.state);
  tired.buffs.tired = 3;
  const work = dispatch(tired, { type: 'short' });
  assert.equal(work.result?.stamina, -30);
  assert.equal(work.result?.cash, 25);
  assert.equal(work.result?.workRemaining, 1);
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
  assert.equal(batch.result?.jobs[0].readyDay, 4);
  const cancel = dispatch(batch.state, {
    type: 'cancelProduction',
    jobId: batch.result!.jobs[0].id,
  });
  assert.equal(cancel.result?.jobs[0].status, 'abandoned');
  assert.deepEqual(cancel.result?.skills, []);
});

void test('old saves initialize bounded history and future save revisions are rejected', () => {
  let s = newGame(10);
  const old = JSON.parse(JSON.stringify(s));
  delete old.saveRevision;
  delete old.operationHistory;
  assert.deepEqual(readSave(JSON.stringify(old)), s);
  assert.throws(
    () => readSave(JSON.stringify({ ...s, saveRevision: 999 })),
    /版本不兼容/,
  );
  for (let i = 0; i < 60; i++) {
    s.daily.rest = 0;
    s.stamina = 60;
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

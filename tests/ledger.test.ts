import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, readSave, log } from '../lib/game/engine.ts';
import { recentCash, recordCash } from '../lib/game/ledger.ts';
import { act, setDay } from './helpers.ts';
import { publicState } from '../lib/game/webmcp.ts';

void test('cross-midnight sleep records actual settlement days and exposes known cash history', () => {
  let s = newGame(42);
  setDay(s, 1, 1380);
  const before = s.cash;
  s = act(s, { type: 'sleep', minutes: 480, bed: 'inn' });
  const rows = recentCash(s);
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((n, r) => n + r.income - r.expense, 0),
    s.cash - before,
  );
  assert.deepEqual(publicState(s)?.ledger?.dailyCash, s.ledger.dailyCash);
});

void test('daily cash records settlement once, survives log truncation and save round-trip', () => {
  let s = newGame(42);
  const before = s.cash;
  s = act(s, { type: 'trade', side: 'buy', good: 'grain', quantity: 1 });
  assert.deepEqual(recentCash(s), [
    { day: 1, income: 0, expense: before - s.cash },
  ]);
  const spent = before - s.cash;
  const bought = s.cash;
  s = act(s, { type: 'trade', side: 'sell', good: 'grain', quantity: 1 });
  assert.deepEqual(recentCash(s), [
    { day: 1, income: s.cash - bought, expense: spent },
  ]);
  for (let i = 0; i < 500; i++) log(s, '无现金的日常记录');
  assert.deepEqual(
    readSave(JSON.stringify(s)).ledger.dailyCash,
    s.ledger.dailyCash,
  );
});

void test('seven-day cash view fills quiet days and excludes initial capital', () => {
  const s = newGame(42);
  assert.deepEqual(recentCash(s), [{ day: 1, income: 0, expense: 0 }]);
  recordCash(s, 80);
  setDay(s, 3);
  recordCash(s, -30);
  assert.deepEqual(recentCash(s)[1], { day: 2, income: 0, expense: 0 });
  setDay(s, 9);
  recordCash(s, 20);
  assert.equal(recentCash(s).length, 7);
  assert.equal(recentCash(s)[0].day, 3);
  assert.equal(
    s.ledger.dailyCash.some((r) => r.day === 1),
    false,
  );
});

void test('invalid or missing daily cash is rejected without fabricated history', () => {
  for (const bad of [
    undefined,
    [{ day: 1, income: -1, expense: 0 }],
    [{ day: 2, income: 1, expense: 0 }],
    [
      { day: 1, income: 1, expense: 0 },
      { day: 1, income: 1, expense: 0 },
    ],
  ]) {
    const s = newGame(42);
    Object.assign(s.ledger, { dailyCash: bad });
    assert.throws(() => readSave(JSON.stringify(s)));
  }
});

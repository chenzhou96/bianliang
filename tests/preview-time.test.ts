import { setDay } from './helpers.ts';
import { generateOrders } from '../lib/game/commerce.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  actionPreview,
  maybeEncounter,
} from '../lib/game/engine.ts';
import { STREET_SCENES } from '../lib/game/street-scenes.ts';

await test('现场预览不泄露后续，随机数不覆盖已经作出的明确选择', () => {
  const s = newGame(23);
  setDay(s, 2);
  s.cooldowns = Object.fromEntries(
    STREET_SCENES.filter((e) => e.family !== 'work').map((e) => [
      e.family,
      99999,
    ]),
  );
  maybeEncounter(s, true, 'work');
  assert.equal(s.event?.sceneId, 'porter-rope');
  const action = { type: 'choice', eventId: s.event!.id, id: 'work' } as const;
  const before = structuredClone(s),
    preview = actionPreview(s, action);
  assert.equal(preview.error, undefined);
  assert.equal(preview.minutes, 60);
  for (let seed = 1; seed <= 40; seed++) {
    const next = { ...s, rng: seed * 7919 };
    assert.deepEqual(actionPreview(next, action), preview);
    const done = dispatch(next, action);
    assert.equal(done.error, undefined);
    assert.equal(done.state.cash - next.cash, 30);
  }
  assert.deepEqual(s, before);
});

await test('睡眠预览说明确定账单、临期腐坏和截止，但不预告失窃金额', () => {
  const s = newGame(17);
  setDay(s, 4, 1320);
  generateOrders(s);
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.batches = [
    {
      id: s.nextId++,
      good: 'bread',
      units: 10,
      cost: 3,
      origin: 'buy',
      remainingMinutes: 60,
    },
  ];
  const order = s.commerce.orders[0];
  assert.ok(order);
  order.status = 'accepted';
  order.deadlineAt = 3 * 1440 + 1380;
  const before = structuredClone(s);
  const preview = actionPreview(s, {
    type: 'sleep',
    bed: 'temple',
    minutes: 480,
  });
  assert.equal(preview.error, undefined);
  assert.equal(preview.cashChange, null);
  assert.match(preview.warning, /06:00住房账单/);
  assert.match(preview.warning, /炊饼已经腐坏/);
  assert.match(preview.warning, /第4日 23:00截止/);
  assert.match(preview.warning, /失窃风险/);
  assert.deepEqual(s, before);
});

await test('闭店前不能完成时预览下一次营业，已闭店与开市前使用同一规则', () => {
  for (const minute of [1079, 1200, 1800]) {
    const s = newGame(5);
    s.clock.minute = minute;
    s.day = Math.floor(minute / 1440) + 1;
    const preview = actionPreview(s, {
      type: 'trade',
      side: 'buy',
      good: 'tea',
      quantity: 1,
    });
    assert.ok(preview.error);
    assert.equal(preview.nextOpeningAt, 1920);
    assert.deepEqual(preview.openingHours, [480, 1080]);
    assert.equal(preview.startsAt, minute);
  }
});

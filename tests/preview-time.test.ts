import { setDay } from './helpers.ts';
import { generateOrders } from '../lib/game/commerce.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch, actionPreview } from '../lib/game/engine.ts';
import { EVENTS } from '../lib/game/content.ts';

await test('公开预览不暴露随机遭遇报酬，随机数变化不改变可知预览', () => {
  const s = newGame(23);
  const family = EVENTS.find((f) => f.id === 'work')!;
  const variant = family.variants.find((v) => v.id === 'broker')!;
  s.event = {
    id: s.nextId++,
    family: family.id,
    variant: variant.id,
    title: family.title,
    person: variant.person,
    text: variant.texts[0],
    clue: variant.clue,
    hiddenFact: variant.fact,
    inspection: variant.inspection,
    inspected: false,
    choices: structuredClone(variant.choices),
  };
  const action = { type: 'choice', eventId: s.event.id, id: 'accept' } as const;
  const before = structuredClone(s);
  const preview = actionPreview(s, action);
  assert.equal(preview.error, undefined);
  assert.equal(preview.cashChange, null);
  assert.equal(preview.healthChange, null);
  assert.equal(preview.staminaChange, null);
  assert.equal(preview.minutes, 120);
  const incomes = new Set<number>();
  for (let seed = 1; seed <= 40; seed++) {
    const next = { ...s, rng: seed * 7919 };
    assert.deepEqual(actionPreview(next, action), preview);
    const done = dispatch(next, action);
    assert.equal(done.error, undefined);
    incomes.add(done.state.cash - next.cash);
  }
  assert.ok(
    incomes.size > 1,
    'the fixture must exercise genuinely different outcomes',
  );
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

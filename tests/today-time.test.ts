import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../lib/game/engine.ts';
import { todayTasks } from '../lib/game/today.ts';
import { generateOrders } from '../lib/game/commerce.ts';
import { setDay } from './helpers.ts';
import { relativeMoment, citySchedule } from '../lib/game/time.ts';

await test('跨午夜提醒明确今天明天，时辰表始终指向未来一天', () => {
  const s = newGame(51);
  assert.equal(relativeMoment(1800, 620), '明天06:00');
  assert.equal(relativeMoment(1800, 1500), '今天06:00');
  assert.match(
    todayTasks(s).find((t) => t.id === 'meal')!.detail,
    /明天06:00前/,
  );
  setDay(s, 2, 60);
  assert.match(
    todayTasks(s).find((t) => t.id === 'meal')!.detail,
    /今天06:00前/,
  );
  for (const now of [480, 1080, 1440, 1800]) {
    const schedule = citySchedule(now);
    assert.equal(schedule.length, 9);
    assert.ok(schedule.every((item) => item.at > now && item.at <= now + 1440));
    assert.ok(schedule.every((item, i) => !i || item.at > schedule[i - 1].at));
  }
});

await test('今日提醒按实际时刻排列，临期食物不能排到明日订单后面', () => {
  const s = newGame(51);
  setDay(s, 4, 1140);
  generateOrders(s);
  const order = s.commerce.orders[0];
  assert.ok(order);
  order.status = 'accepted';
  order.deadlineAt = s.clock.minute + 1400;
  s.batches.find((b) => b.good === 'bread')!.remainingMinutes = 60;
  const tasks = todayTasks(s);
  const expiry = tasks.findIndex((t) => t.id === 'expiry:bread');
  const delivery = tasks.findIndex((t) => t.id === `order:${order.id}`);
  const timed = tasks.filter((t) => t.at !== undefined);
  for (let i = 1; i < timed.length; i++)
    assert.ok(timed[i - 1].at! <= timed[i].at!);
  assert.ok(delivery >= 0);
  assert.ok(expiry >= 0 && expiry < delivery);
});

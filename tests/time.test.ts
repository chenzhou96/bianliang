import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFinishAtVenue,
  clockDay,
  dayPeriod,
  formatClock,
  lifeCycle,
  newClock,
  nextDailyTime,
  nextOpening,
  projectTime,
  staminaCap,
  traditionalHour,
  transportQuote,
  validClock,
} from '../lib/game/time.ts';

const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

await test('日期和生活周期分别在午夜与06点切换', () => {
  assert.equal(clockDay(1439), 1);
  assert.equal(clockDay(1440), 2);
  assert.equal(lifeCycle(1799), 0);
  assert.equal(lifeCycle(1800), 1);
  assert.equal(formatClock(1440 + 425), '07:05');
  assert.equal(traditionalHour(23 * 60), '子时');
  assert.equal(traditionalHour(0), '子时');
  assert.equal(dayPeriod(359), 'late');
  assert.equal(dayPeriod(360), 'dawn');
  assert.equal(dayPeriod(480), 'day');
  assert.equal(dayPeriod(1080), 'dusk');
  assert.equal(dayPeriod(1200), 'evening');
  assert.equal(dayPeriod(1320), 'late');
});

await test('闭店时恰好完成允许，闭店后和跨越闭店的行动拒绝', () => {
  assert.equal(canFinishAtVenue(1070, 10, 'market'), true);
  assert.equal(canFinishAtVenue(1070, 11, 'market'), false);
  assert.equal(canFinishAtVenue(1080, 0, 'market'), false);
  assert.equal(canFinishAtVenue(1430, 10, 'nightMarket'), true);
  assert.equal(canFinishAtVenue(1430, 11, 'nightMarket'), false);
  assert.equal(canFinishAtVenue(1440, 10, 'nightMarket'), false);
  assert.equal(canFinishAtVenue(1430, 600, 'home'), true);
  assert.equal(nextOpening(1080, 'market'), 1920);
  assert.equal(nextOpening(400, 'market'), 480);
  assert.equal(nextOpening(500, 'market'), 500);
});

await test('已结算的每日时点不会再次返回，跨日寻找下一时点', () => {
  assert.equal(nextDailyTime(329, 330), 330);
  assert.equal(nextDailyTime(330, 330), 1770);
  assert.equal(nextDailyTime(1800, 360), 3240);
});

await test('时间预览纯净且跨午夜拆分不会改变清醒惩罚', () => {
  const clock = { minute: 1300, fatigueMinutes: 1200, sleepDebt: 4 };
  const before = structuredClone(clock);
  const whole = projectTime(clock, 500);
  let split = clock;
  let health = 0;
  let exertion = 0;
  for (let i = 0; i < 500; i++) {
    const part = projectTime(split, 1);
    split = part.clock;
    health += part.healthLoss;
    exertion += part.averageExertion;
  }
  assert.deepEqual(clock, before);
  assert.deepEqual(split, whole.clock);
  near(health, whole.healthLoss);
  near(exertion / 500, whole.averageExertion);
  near(whole.healthLoss, 260 / 30);
});

await test('夜间不按钟点惩罚，疲劳负荷超过24小时才损害健康', () => {
  const first = projectTime(
    { minute: 1560, fatigueMinutes: 0, sleepDebt: 0 },
    60,
  );
  const last = projectTime(
    { minute: 1740, fatigueMinutes: 0, sleepDebt: 0 },
    60,
  );
  near(first.healthLoss, 0);
  near(last.healthLoss, 0);
  const day = projectTime(
    { minute: 480, fatigueMinutes: 1440, sleepDebt: 12 },
    60,
  );
  near(day.healthLoss, 2);
});

await test('睡眠按分钟消除负荷与睡眠债；日间恢复效率较低', () => {
  const clock = { minute: 1320, fatigueMinutes: 1000, sleepDebt: 8 };
  const night = projectTime(clock, 480, {
    sleeping: true,
    recoveryForEightHours: 50,
  });
  near(night.recovery, 50);
  near(night.clock.sleepDebt, 0);
  assert.equal(night.clock.fatigueMinutes, 40);
  assert.equal(night.healthLoss, 0);
  const short = projectTime(clock, 60, { sleeping: true });
  near(short.clock.sleepDebt, 7);
  assert.equal(short.clock.fatigueMinutes, 880);
  const day = projectTime({ ...clock, minute: 480 }, 480, {
    sleeping: true,
    recoveryForEightHours: 50,
  });
  near(day.recovery, 40);
  const bedroom = projectTime(clock, 480, {
    sleeping: true,
    recoveryForEightHours: 50,
    bedroom: true,
  });
  near(bedroom.recovery, 57.5);
  assert.equal(bedroom.clock.sleepDebt, night.clock.sleepDebt);
});

await test('睡眠不足降低体力上限但不使零体力玩家失去恢复空间', () => {
  near(staminaCap(100, 4), 94);
  near(staminaCap(30, 12), 30);
  near(projectTime(newClock(), 1440).clock.sleepDebt, 4);
  assert.throws(() => projectTime(newClock(), 1441));
  assert.throws(() => projectTime(newClock(), 0, { sleeping: true }));
  assert.throws(() => projectTime(newClock(), 601, { sleeping: true }));
});

await test('搬运报价包含办理成本，分单不节省运费和时间，体力不向下取整', () => {
  assert.deepEqual(transportQuote(20, 'self'), {
    minutes: 50,
    stamina: 20,
    fee: 0,
  });
  assert.deepEqual(transportQuote(20, 'cart'), {
    minutes: 30,
    stamina: 10,
    fee: 0,
  });
  assert.deepEqual(transportQuote(20, 'porter'), {
    minutes: 15,
    stamina: 2,
    fee: 20,
  });
  assert.equal(transportQuote(20, 'self', true).minutes, 42);
  const whole = transportQuote(15.3, 'porter');
  const part = transportQuote(5.1, 'porter');
  assert.ok(part.fee * 3 >= whole.fee);
  assert.ok(part.minutes * 3 >= whole.minutes);
  near(part.stamina * 3, whole.stamina);
});

await test('时钟读取拒绝损坏数据与不可能的时间', () => {
  assert.equal(validClock(newClock()), true);
  for (const value of [
    null,
    {},
    { ...newClock(), minute: 1 },
    { ...newClock(), sleepDebt: NaN },
    { ...newClock(), fatigueMinutes: -1 },
  ])
    assert.equal(validClock(value), false);
});

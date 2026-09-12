import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  actionPreview,
  readSave,
  quantity,
} from '../lib/game/engine.ts';
import {
  fatigueLabel,
  projectTime,
  staminaCap,
  newClock,
} from '../lib/game/time.ts';
import { closeDayPlan, waitTargetAt } from '../lib/game/action-time.ts';
import { publicState } from '../lib/game/webmcp.ts';
import { generateOrders } from '../lib/game/commerce.ts';
import { todayTasks } from '../lib/game/today.ts';
import { actionKey } from '../lib/game/feedback.ts';
import { setDay } from './helpers.ts';
import type { Action, GameState } from '../lib/game/types.ts';
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined);
  return r.state;
}

await test('正常作息稳定循环，夜班疲劳相同，连续缺觉可预见', () => {
  for (const start of [480, 1080]) {
    let clock = { ...newClock(), minute: start };
    for (let day = 0; day < 30; day++) {
      clock = projectTime(clock, 960).clock;
      near(clock.sleepDebt, 0);
      near(staminaCap(100, clock.sleepDebt), 100);
      clock = projectTime(clock, 480, { sleeping: true }).clock;
      assert.equal(clock.fatigueMinutes, 0);
      near(clock.sleepDebt, 0);
    }
  }
  const normal = projectTime(newClock(), 839);
  assert.equal(fatigueLabel(normal.clock.fatigueMinutes), '精神充足');
  assert(
    !todayTasks({ ...newGame(1), clock: normal.clock }).some(
      (t) => t.id === 'sleep',
    ),
  );
  const tired = projectTime(newClock(), 1440);
  near(tired.clock.sleepDebt, 4);
  near(projectTime(tired.clock, 60).healthLoss, 2);
});

await test('分段睡眠与整体睡眠一致，无4小时清零或短睡漏洞', () => {
  const start = { ...newClock(), fatigueMinutes: 1500, sleepDebt: 8 };
  const full = projectTime(start, 480, {
    sleeping: true,
    recoveryForEightHours: 55,
  });
  let clock = start;
  let recovery = 0;
  for (let i = 0; i < 8; i++) {
    const p = projectTime(clock, 60, {
      sleeping: true,
      recoveryForEightHours: 55,
    });
    clock = p.clock;
    recovery += p.recovery;
  }
  assert.deepEqual(clock, full.clock);
  near(recovery, full.recovery);
});

await test('短休显示实际恢复，满体力失败无副作用', () => {
  let s = newGame(1);
  s.stamina = 95;
  near(actionPreview(s, { type: 'rest' }).staminaChange!, 5);
  s = act(s, { type: 'rest' });
  const r = dispatch(s, { type: 'rest' });
  assert(r.error);
  assert.equal(r.state, s);
});

await test('收工各时刻一次到08:00，省略已用主餐，聚合一条操作', () => {
  for (const minute of [1080, 1200, 1380, 1560]) {
    const s = newGame(2);
    setDay(s, minute >= 1440 ? 2 : 1, minute % 1440);
    s.clock.fatigueMinutes = 600;
    s.stamina = 20;
    const action: Action = { type: 'closeDay', bed: 'inn', meal: 'bread' };
    const before = structuredClone(s);
    const preview = actionPreview(s, action);
    assert.deepEqual(s, before);
    assert.equal(preview.error, undefined);
    assert.doesNotMatch(preview.warning, /体力成本增至/);
    const next = act(s, action);
    assert.equal(next.clock.minute, 1920);
    assert.equal(next.cash, s.cash - 30);
    assert.equal(next.operationHistory.length, 1);
    assert.equal(next.revision, s.revision + 1);
    near(preview.staminaChange!, next.stamina - s.stamina);
    near(preview.healthChange!, next.health - s.health);
    assert.equal(quantity(next, 'bread'), quantity(s, 'bread') - 1);
    assert.deepEqual(readSave(JSON.stringify(next)), next);
  }
  const fed = act(newGame(1), { type: 'eat', meal: 'bread' });
  assert.equal(
    closeDayPlan(fed, { type: 'closeDay', bed: 'inn', meal: 'bread' }).meal,
    undefined,
  );
  const nearMorning = newGame(1);
  setDay(nearMorning, 2, 450);
  assert(dispatch(nearMorning, { type: 'closeDay', bed: 'inn' }).error);
  assert.equal(
    act(nearMorning, { type: 'waitUntil', target: { kind: 'morning' } }).clock
      .minute,
    1920,
  );
});

await test('无钱、无口粮与失效住所不会部分扣款；免费住宿始终可选', () => {
  const s = newGame(3);
  s.cash = 0;
  s.stamina = 0;
  s.clock.minute = 1200;
  for (const a of [
    { type: 'closeDay', bed: 'inn', meal: 'bread' },
    { type: 'closeDay', bed: 'temple', meal: 'diner' },
    { type: 'closeDay', bed: 'room' },
  ] as Action[]) {
    const r = dispatch(s, a);
    assert(r.error);
    assert.equal(r.state, s);
  }
  assert.equal(
    act(s, { type: 'closeDay', bed: 'temple', meal: 'bread' }).clock.minute,
    1920,
  );
  assert(actionPreview(s, { type: 'closeDay', bed: 'temple' }).confirmation);
});

await test('关门前办妥手续允许搬运收尾，脚夫同样生效', () => {
  for (const transport of ['self', 'porter'] as const) {
    const s = newGame(4);
    s.clock.minute = 1070;
    const a: Action = {
      type: 'trade',
      good: 'wheat',
      quantity: 1,
      side: 'buy',
      transport,
    };
    const next = act(s, a);
    assert(next.clock.minute > 1080);
    assert.equal(quantity(next, 'wheat'), quantity(s, 'wheat') + 1);
    for (const minute of [1071, 1080]) {
      const closed = { ...s, clock: { ...s.clock, minute } };
      assert(dispatch(closed, a).error);
    }
  }
  const s = newGame(4);
  const lot = s.marketOffers.lots.find((l) => l.opensAt === 480)!;
  assert(lot);
  s.clock.minute = 1070;
  assert.equal(
    act(s, { type: 'buyLot', lotId: lot.id }).marketOffers.lots.find(
      (l) => l.id === lot.id,
    )!.bought,
    true,
  );
});

await test('目标等待重新解析、禁止过期与停产目标、目标各有独立反馈键', () => {
  const s = newGame(6);
  assert.equal(
    waitTargetAt(s, { kind: 'opening', venue: 'nightMarket' }),
    1080,
  );
  s.clock.minute = 1080;
  assert.equal(
    waitTargetAt(s, { kind: 'opening', venue: 'nightMarket' }),
    2520,
  );
  assert.throws(() => waitTargetAt(s, { kind: 'production', jobId: 55 }));
  assert.notEqual(
    actionKey({ type: 'waitUntil', target: { kind: 'production', jobId: 1 } }),
    actionKey({ type: 'waitUntil', target: { kind: 'production', jobId: 2 } }),
  );
});

await test('等待最晚交付时刻必须有货且到达后能交付，收工预警截止', () => {
  const s = newGame(8);
  setDay(s, 4);
  generateOrders(s);
  const order = s.commerce.orders[0];
  order.status = 'accepted';
  order.goods = { wheat: 1 };
  order.prices = { wheat: s.prices.wheat.buy };
  order.postedDay = 3;
  order.price = order.prices.wheat!;
  order.deadlineAt = s.clock.minute + 720;
  const a: Action = {
    type: 'waitUntil',
    target: { kind: 'delivery', orderId: order.id },
  };
  const waited = act(s, a);
  assert.equal(waited.clock.minute, order.deadlineAt - 12);
  const delivered = act(waited, { type: 'deliverOrder', orderId: order.id });
  assert.equal(delivered.commerce.orders[0].status, 'delivered');
  assert(
    actionPreview(s, { type: 'closeDay', bed: 'inn', meal: 'bread' })
      .confirmation,
  );
  assert(
    actionPreview(s, { type: 'closeDay', bed: 'inn', meal: 'bread' })
      .earlierTarget,
  );
  const empty = { ...s, batches: [] };
  assert(dispatch(empty, a).error);
  const late = { ...s, clock: { ...s.clock, minute: order.deadlineAt - 11 } };
  assert(dispatch(late, { type: 'deliverOrder', orderId: order.id }).error);
});

await test('版本4拒绝版本3，公开状态与工具支持复合行动', () => {
  const s = newGame(9);
  assert.equal(s.version, 4);
  assert.throws(() => readSave(JSON.stringify({ ...s, version: 3 })));
  const state = publicState(s);
  assert.equal(state.fatigue, '精神充足');
  assert.equal(state.clock!.fatigueMinutes, 0);
  assert(!JSON.stringify(state).includes('"rng"'));
});

await test('生产目标会在完工入库时结束，跨清晨欠费停产提前拒绝', () => {
  const s = newGame(10);
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.skills.brewing = 1;
  s.equipment = [{ id: 900, kind: 'brewVat', installed: true, jobId: 901 }];
  s.jobs = [
    {
      id: 901,
      recipeId: 'wine',
      equipmentId: 900,
      quantity: 1,
      startDay: 1,
      remainingMinutes: 60,
      inputCost: 50,
      outputUnits: 40,
      status: 'queued',
    },
  ];
  s.nextId = 902;
  const action: Action = {
    type: 'waitUntil',
    target: { kind: 'production', jobId: 901 },
  };
  const next = act(s, action);
  assert.equal(next.clock.minute, 540);
  assert.equal(quantity(next, 'wine'), 4);
  const paused = structuredClone(s);
  paused.equipment[0].installed = false;
  assert(dispatch(paused, action).error);
  const broke = structuredClone(s);
  setDay(broke, 2, 350);
  broke.life.lastDawn = 360;
  broke.cash = 0;
  assert(dispatch(broke, action).error);
  assert.equal(broke.clock.minute, 1790);
  s.jobs[0].remainingMinutes = 1441;
  assert(dispatch(s, action).error);
});

await test('收工跨住房停用和生产完成，费用只扣一次，死亡不继续安排', () => {
  let s = newGame(12);
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.clock.minute = 1200;
  s.cash = 11;
  const preview = actionPreview(s, {
    type: 'closeDay',
    bed: 'room',
    meal: 'bread',
  });
  assert(preview.confirmation);
  assert.match(preview.warning, /住房/);
  const next = act(s, { type: 'closeDay', bed: 'room', meal: 'bread' });
  assert.equal(next.housing.id, 'street');
  s = newGame(12);
  s.clock.minute = 1200;
  s.clock.fatigueMinutes = 1500;
  s.health = 0.01;
  const dead = act(s, { type: 'closeDay', bed: 'inn' });
  assert.equal(dead.phase, 'ended');
  assert(dead.clock.minute < 1440);
  assert.equal(dead.cash, s.cash);
  assert.equal(dead.operationHistory.length, 1);
});

await test('公开工具预览与执行同一收工方案，嵌套目标参数在schema中可用', async () => {
  const { registerGameTools } = await import('../lib/game/webmcp.ts');
  let s = newGame(14);
  s.clock.minute = 1200;
  const tools = new Map<
    string,
    Parameters<import('../lib/game/webmcp.ts').ModelContext['registerTool']>[0]
  >();
  const cleanup = registerGameTools(
    {
      registerTool: (tool) => {
        tools.set(tool.name, tool);
      },
    },
    () => s,
    (a, revision) => {
      const r = dispatch(s, a, revision);
      if (!r.error) s = r.state;
      return r.error ? { error: r.error } : {};
    },
  );
  const action: Action = { type: 'closeDay', bed: 'inn', meal: 'bread' };
  const before = structuredClone(s);
  const preview = actionPreview(s, action);
  const tool = tools.get('perform_bianliang_action')!;
  assert(JSON.stringify(tool.inputSchema).includes('production'));
  await tool.execute({ revision: s.revision, action });
  assert.equal(s.clock.minute, preview.finishAt);
  near(s.cash - before.cash, preview.cashChange!);
  assert.equal(s.operationHistory[0].action, 'closeDay');
  cleanup();
});

await test('免费住宿的公开预览不通过房费风险泄露隐藏失窃结果', () => {
  const s = newGame(44);
  s.clock.minute = 1200;
  s.cash = 12;
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  const a: Action = { type: 'closeDay', meal: 'bread', bed: 'temple' };
  const preview = actionPreview(s, a);
  const actualHomes = new Set<string>();
  for (let i = 1; i <= 60; i++) {
    const variant = { ...s, rng: i * 7919 };
    assert.deepEqual(actionPreview(variant, a), preview);
    actualHomes.add(act(variant, a).housing.id);
  }
  assert.equal(actualHomes.size, 2, 'fixture exercises theft affecting rent');
  assert.equal(preview.cashChange, null);
});

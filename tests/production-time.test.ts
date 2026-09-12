import { publicState } from '../lib/game/webmcp.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch, readSave } from '../lib/game/engine.ts';
import {
  productionEarliest,
  productionReadyAt,
} from '../lib/game/production-time.ts';
import { RECIPES } from '../lib/game/config.ts';

await test('自产预估包含开工分钟和完整加工时间，不在午夜提前完成', () => {
  const s = newGame(31);
  s.clock.minute = 17 * 60;
  s.skills.brewing = 3;
  s.equipment = [{ id: 100, kind: 'brewVat', installed: true, jobId: null }];
  const recipe = RECIPES.find((r) => r.id === 'wine')!;
  assert.equal(
    productionEarliest(s, 'wine', 1),
    s.clock.minute + 12 + recipe.duration * 1440,
  );
});

await test('在制品足量时只等待剩余加工，不重复估算整轮生产', () => {
  const s = newGame(33);
  s.skills.brewing = 3;
  s.equipment = [{ id: 100, kind: 'brewVat', installed: true, jobId: 101 }];
  s.jobs = [
    {
      id: 101,
      recipeId: 'wine',
      equipmentId: 100,
      quantity: 1,
      startDay: 1,

      remainingMinutes: 75,
      inputCost: 10,
      outputUnits: 480,
      status: 'queued',
    },
  ];
  assert.equal(productionReadyAt(s, s.jobs[0]), s.clock.minute + 75);
  assert.equal(publicState(s).production?.[0].readyAt, s.clock.minute + 75);
  assert.equal(productionEarliest(s, 'wine', 40), s.clock.minute + 75);
  const recipe = RECIPES.find((r) => r.id === 'wine')!;
  assert.equal(
    productionEarliest(s, 'wine', 49),
    s.clock.minute + 75 + 12 + recipe.duration * 1440,
  );
  s.housing.maintenanceSuspended = true;
  assert.equal(productionReadyAt(s, s.jobs[0]), null);
  assert.equal(publicState(s).production?.[0].readyAt, null);
  assert.equal(productionEarliest(s, 'wine', 40), null);
});

await test('完工反馈使用精确时刻，后续行动不重复报告已完成的生产', () => {
  const s = newGame(53);
  s.nextId = 200;
  s.housing = { id: 'room', paidThrough: null, maintenanceSuspended: false };
  s.equipment = [{ id: 100, kind: 'brewVat', installed: true, jobId: 101 }];
  s.jobs = [
    {
      id: 101,
      recipeId: 'wine',
      equipmentId: 100,
      quantity: 1,
      startDay: 1,

      remainingMinutes: 60,
      inputCost: 100,
      outputUnits: 400,
      status: 'queued',
    },
  ];
  const pending = dispatch(s, { type: 'wait', minutes: 1 });
  assert.equal(pending.error, undefined);
  assert.deepEqual(pending.result?.jobs, []);
  const finished = dispatch(pending.state, { type: 'wait', minutes: 59 });
  assert.equal(finished.error, undefined);
  assert.equal(finished.result?.jobs[0].readyAt, 540);
  assert.equal(finished.result?.jobs[0].status, 'ready');
  assert.deepEqual(readSave(JSON.stringify(finished.state)), finished.state);
  const later = dispatch(finished.state, { type: 'wait', minutes: 1 });
  assert.deepEqual(later.result?.jobs, []);
});

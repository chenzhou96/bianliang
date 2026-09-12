import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineEvents } from '../lib/game/timeline.ts';

await test('长行动经过自动喂养与黎明，处理全部事项且不重复起点', () => {
  const queue = timelineEvents(1320, 1920, [
    { id: 'bread', at: 1500, kind: 'spoilage' },
    { id: 'job', at: 1700, kind: 'production' },
  ]);
  assert.deepEqual(
    queue.map((e) => e.at),
    [1500, 1700, 1770, 1800, 1800, 1800],
  );
  assert.deepEqual(timelineEvents(1800, 1920, []), []);
});

await test('同刻先腐坏和房费再生产、刷新、交货、逾期，不依赖插入顺序', () => {
  const events = [
    { id: 'order', at: 1800, kind: 'deadline' as const },
    { id: 'delivery', at: 1800, kind: 'completion' as const },
    { id: 'bread', at: 1800, kind: 'spoilage' as const },
    { id: 'health', at: 1800, kind: 'health' as const },
    { id: 'job', at: 1800, kind: 'production' as const },
  ];
  const expected = [
    'health',
    'spoilage',
    'housing',
    'feeding',
    'production',
    'market',
    'completion',
    'deadline',
  ];
  const before = structuredClone(events);
  assert.deepEqual(
    timelineEvents(1799, 1800, events).map((e) => e.kind),
    expected,
  );
  assert.deepEqual(
    timelineEvents(1799, 1800, [...events].reverse()).map((e) => e.kind),
    expected,
  );
  assert.deepEqual(events, before);
});

await test('分段推进与整段推进获得同一事件序列', () => {
  const events = [{ id: 'job', at: 1600, kind: 'production' as const }];
  const whole = timelineEvents(1000, 2200, events);
  const parts = [
    ...timelineEvents(1000, 1600, events),
    ...timelineEvents(1600, 1800, events),
    ...timelineEvents(1800, 2200, events),
  ];
  assert.deepEqual(parts, whole);
  assert.throws(() => timelineEvents(0, 1441, []));
  assert.throws(() => timelineEvents(10, 9, []));
  assert.throws(() => timelineEvents(1000, 2200, [...events, ...events]));
});

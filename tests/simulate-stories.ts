import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { run } from './simulate-continuous.ts';

type Policy = 'none' | 'selective' | 'frequent';
type Task = { seed: number; policy: Policy; days: number };
if (!isMainThread) {
  parentPort!.on('message', (task: Task) => {
    try {
      parentPort!.postMessage({
        row: run(task.seed, 'mixed', task.days, false, task.policy),
      });
    } catch (error) {
      parentPort!.postMessage({ error: String(error) });
    }
  });
} else {
  const samples = Number(process.env.STORY_SAMPLES ?? 30),
    days = Number(process.env.STORY_DAYS ?? 100);
  const policies: Policy[] = ['none', 'selective', 'frequent'];
  const tasks = Array.from({ length: samples }, (_, i) =>
    policies.map((policy) => ({ seed: (i + 1) * 7919, policy, days })),
  ).flat();
  const rows: ReturnType<typeof run>[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { stories: true },
      });
      try {
        while (index < tasks.length) {
          const task = tasks[index++];
          const result = await new Promise<{
            row?: ReturnType<typeof run>;
            error?: string;
          }>((resolve, reject) => {
            const fail = (error: Error) => {
              worker.off('message', done);
              reject(error);
            };
            const done = (result: {
              row?: ReturnType<typeof run>;
              error?: string;
            }) => {
              worker.off('error', fail);
              resolve(result);
            };
            worker.once('message', done);
            worker.once('error', fail);
            worker.postMessage(task);
          });
          if (result.error || !result.row)
            throw Error(result.error ?? 'missing result');
          rows.push(result.row);
          console.log(`${task.policy}: ${task.seed / 7919}/${samples}`);
        }
      } finally {
        await worker.terminate();
      }
    }),
  );
  const median = (values: number[]) => {
    const a = values.toSorted((a, b) => a - b);
    return (
      (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2
    );
  };
  const summary = policies.map((policy) => {
    const r = rows.filter((r) => r.storyPolicy === policy);
    return {
      policy,
      survival: r.filter((r) => r.survived).length / r.length,
      growth: median(r.map((r) => r.growth)),
      cash: median(r.map((r) => r.cash)),
      health: median(r.map((r) => r.health)),
      storyMinutes: median(
        r.map(
          (r) =>
            (r.actionMinutes.tea ?? 0) +
            (r.actionMinutes.storyAction ?? 0) +
            (r.actionMinutes.choice ?? 0),
        ),
      ),
      ended: median(r.map((r) => r.storySummary.ended)),
      records: median(r.map((r) => r.storySummary.records)),
    };
  });
  const no = summary[0];
  const gates = {
    completeSample: samples >= 30 && days >= 100,
    actualParticipation: summary.slice(1).every((r) => r.records > 0),
    boundedGrowth: summary
      .slice(1)
      .every((r) => r.growth <= Math.max(no.growth * 1.5, no.growth + 1000)),
    noParticipationCollapse: summary
      .slice(1)
      .every((r) => r.survival >= no.survival - 0.2),
  };
  mkdirSync('tests/browser-output/stories', { recursive: true });
  writeFileSync(
    'tests/browser-output/stories/economy.json',
    JSON.stringify({ samples, days, summary, gates, rows }, null, 2),
  );
  console.table(summary);
  console.log(gates);
  if (gates.completeSample)
    assert.ok(
      Object.values(gates).every(Boolean),
      'Story economy gates failed; inspect paired results',
    );
}

import { closeDay } from './helpers.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  maybeEncounter,
  readSave,
} from '../lib/game/engine.ts';
import { STORIES, STREET_SCENES } from '../lib/game/content.ts';
import type { Action } from '../lib/game/types.ts';

const output = 'tests/browser-output/stories';
mkdirSync(output, { recursive: true });
let s = newGame(20260910, 30000);
s.cash = 100000;
s.housing = { id: 'mansion', paidThrough: null, maintenanceSuspended: false };
const act = (a: Action) => {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined, r.error);
  s = r.state;
};
const visits: { day: number; titles: string[]; charged: boolean }[] = [];
const scenes: {
  day: number;
  title: string;
  text: string;
  choices: string[];
}[] = [];
const recent = new Map<string, number>();
for (let day = 1; day <= 100; day++) {
  act({ type: 'wait', minutes: 60 });
  const before = structuredClone(s),
    tea = dispatch(s, { type: 'tea' });
  if (tea.error) {
    assert.match(tea.error, /没有新消息/);
    assert.deepEqual(tea.state, before);
  } else s = tea.state;
  const fresh = s.intel.filter((i) => i.heardDay === day);
  for (const i of fresh) {
    assert.ok(i.worldId);
    assert.ok(day - (recent.get(i.semantic) ?? -99) >= 7);
    recent.set(i.semantic, day);
  }
  const titles = [
    ...fresh.map((i) => i.title!),
    ...s.stories
      .filter((q) => q.discoveredAt > before.clock.minute)
      .map((q) => STORIES.find((d) => d.id === q.definitionId)!.title),
  ];
  assert.ok(titles.length <= 2);
  visits.push({ day, titles, charged: !tea.error });
  // Force only the draw for review coverage; real gameplay retains its probability.
  maybeEncounter(s, true, day % 2 ? 'trade' : 'work');
  if (s.event) {
    scenes.push({
      day,
      title: s.event.title,
      text: s.event.text,
      choices: s.event.choices.map((c) => c.label),
    });
    act({ type: 'choice', eventId: s.event.id, id: 'decline' });
  }
  s = closeDay(s, 'mansion');
  assert.deepEqual(readSave(JSON.stringify(s)), s);
}
const report = {
  days: 100,
  definitions: STORIES.length,
  scenes: STREET_SCENES.length,
  chargedVisits: visits.filter((v) => v.charged).length,
  emptyVisits: visits.filter((v) => !v.charged).length,
  uniqueStoryDiscoveries: s.stories.length,
  visits,
  encounters: scenes,
};
writeFileSync(`${output}/content-review.json`, JSON.stringify(report, null, 2));
const sample =
  '# 茶馆与现场连续内容复核\n\n固定种子20260910；现场为提高审阅覆盖而强制抽取，不代表自然触发频率。\n\n' +
  '## 前20次听茶\n\n' +
  visits
    .slice(0, 20)
    .map(
      (v) => `- 第${v.day}日：${v.titles.join('；') || '暂无新消息，不收费'}`,
    )
    .join('\n') +
  '\n\n## 前20次现场\n\n' +
  scenes
    .slice(0, 20)
    .map(
      (e) =>
        `### 第${e.day}日 · ${e.title}\n\n${e.text}\n\n选择：${e.choices.join('／')}`,
    )
    .join('\n\n');
writeFileSync(`${output}/content-review.md`, sample);
writeFileSync(
  `${output}/story-branches.md`,
  '# 六条故事线正文与分支审阅\n\n' +
    STORIES.map(
      (d) =>
        `## ${d.title}\n\n` +
        d.stages
          .map(
            (stage) =>
              `### ${stage.title}（${stage.id}）\n\n${stage.person}：${stage.text}\n\n目标：${stage.objective}\n\n` +
              stage.choices
                .map((c) => `- ${c.label} → ${c.next}：${c.text}`)
                .join('\n'),
          )
          .join('\n\n'),
    ).join('\n\n'),
);
console.log(
  JSON.stringify({ ...report, visits: undefined, encounters: undefined }),
);

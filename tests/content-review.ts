import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { newGame, dispatch } from '../lib/game/engine.ts';
import { INFO_TEMPLATES } from '../lib/game/content.ts';
import type { Action } from '../lib/game/types.ts';
let s = newGame(20260910, 30000);
s.cash = 100000;
s.housing = { id: 'mansion', paidThrough: null, maintenanceSuspended: false };
const act = (a: Action) => {
  const r = dispatch(s, a);
  assert(!r.error, r.error);
  s = r.state;
};
const visits = [];
const category: Record<string, number> = {};
const recent = new Map<string, number>();
let duplicates = 0;
let heard = 0;
let followed = 0;
for (let day = 1; day <= 100; day++) {
  act({ type: 'tea' });
  if (s.event) act({ type: 'choice', eventId: s.event.id, id: 'decline' });
  const fresh = s.intel.filter((i) => i.heardDay === day);
  assert(fresh.filter(i => i.worldId).length <= 1);
  for (const i of fresh) {
    if (i.worldId) {
      const family = s.worlds.find(w => w.id === i.worldId)!.family;
      assert(day - (recent.get('market:' + family) ?? -99) >= 7);
      recent.set('market:' + family, day);
    }
    category[i.category] = (category[i.category] ?? 0) + 1;
    if (day - (recent.get(i.semantic) ?? -99) < 20) duplicates++;
    recent.set(i.semantic, day);
    if (i.worldId) heard++;
  }
  const pending = s.intel.find(
    (i) => !i.visited && (i.resolution ? day >= i.resolution.due : i.worldId && day > i.heardDay + 18),
  );
  if (pending) {
    act({ type: 'visitIntel', id: pending.id });
    followed++;
  }
  visits.push({
    day,
    entries: fresh.map((i) => ({
      title: i.title,
      text: i.text,
      source: i.source,
      semantic: i.semantic,
    })),
  });
  act({ type: 'endDay' });
  act({ type: 'night', meal: 'diner', bed: 'mansion', feed: 0 });
}
const result = {
  templates: INFO_TEMPLATES.length,
  uniqueSemantics: new Set(INFO_TEMPLATES.map((t) => t.semantic)).size,
  visits: 100,
  messages: 300,
  within20DayDuplicates: duplicates,
  category,
  marketRumors: heard,
  revisited: followed,
  visitsDetail: visits,
};
writeFileSync('tests/content-review.json', JSON.stringify(result, null, 2));
writeFileSync(
  'tests/content-review.md',
  '# 连续20次茶馆内容复核样本\n\n固定种子20260910，来自实际游戏引擎连续经营。\n\n' +
    visits
      .slice(0, 20)
      .map(
        (v) =>
          `## 第${v.day}日\n\n` +
          v.entries
            .map((i) => `- ${i.title}（${i.source}）：${i.text}`)
            .join('\n'),
      )
      .join('\n\n'),
);
console.log({
  templates: result.templates,
  uniqueSemantics: result.uniqueSemantics,
  duplicates,
  category,
  heard,
  followed,
});

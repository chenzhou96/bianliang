import { closeDay } from './helpers.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { newGame, dispatch } from '../lib/game/engine.ts';
import { INFO_TEMPLATES } from '../lib/game/content.ts';
import {
  ORDER_TEMPLATES,
  CUSTOMER_IDS,
  CUSTOMERS,
} from '../lib/game/commerce.ts';
import type { Action } from '../lib/game/types.ts';
let s = newGame(20260910, 30000);
mkdirSync('tests/browser-output/commerce', { recursive: true });
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
const orderRecent = new Map<string, number>();
const orderObservations: { day: number; titles: string[] }[] = [];
let customerMessages = 0;
for (let day = 1; day <= 100; day++) {
  act({ type: 'wait', minutes: 60 });
  act({ type: 'tea' });
  if (s.event) act({ type: 'choice', eventId: s.event.id, id: 'decline' });
  const fresh = s.intel.filter((i) => i.heardDay === day);
  const offers = s.commerce.orders.filter(
    (o) => o.status === 'offered' && o.postedDay === day,
  );
  assert(offers.length <= 3);
  for (const o of offers) {
    assert(day - (orderRecent.get(o.templateId) ?? -99) >= 7);
    orderRecent.set(o.templateId, day);
  }
  orderObservations.push({ day, titles: offers.map((o) => o.title) });
  const customer = fresh.find((i) => i.customerId && !i.asked);
  if (customer) {
    act({ type: 'askIntel', id: customer.id });
    customerMessages++;
  }
  assert(fresh.filter((i) => i.worldId).length <= 1);
  for (const i of fresh) {
    if (i.worldId) {
      const family = s.worlds.find((w) => w.id === i.worldId)!.family;
      assert(day - (recent.get('market:' + family) ?? -99) >= 7);
      recent.set('market:' + family, day);
    }
    category[i.category] = (category[i.category] ?? 0) + 1;
    if (day - (recent.get(i.semantic) ?? -99) < 20) duplicates++;
    recent.set(i.semantic, day);
    if (i.worldId) heard++;
  }
  const pending = s.intel.find(
    (i) =>
      !i.visited &&
      (i.resolution
        ? day >= i.resolution.due
        : i.worldId && day > i.heardDay + 18),
  );
  if (pending) {
    if (!pending.asked) act({ type: 'askIntel', id: pending.id });
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
  s = closeDay(s, 'mansion');
}
const result = {
  templates: INFO_TEMPLATES.length,
  uniqueSemantics: new Set(INFO_TEMPLATES.map((t) => t.semantic)).size,
  visits: 100,
  messages: visits.reduce((n, v) => n + v.entries.length, 0),
  within20DayDuplicates: duplicates,
  category,
  marketRumors: heard,
  revisited: followed,
  customerMessages,
  orderObservations,
  orderTemplates: ORDER_TEMPLATES,
  customerStories: CUSTOMER_IDS.map((id) => ({ id, ...CUSTOMERS[id] })),
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
writeFileSync(
  'tests/browser-output/commerce/content-review.md',
  '# 订单与人物正文审阅\n\n' +
    ORDER_TEMPLATES.map(
      (t) =>
        `## ${t.title}\n\n${CUSTOMERS[t.customer].name}：${t.text}\n\n货物：${JSON.stringify(t.goods)}；解锁条件：${t.milestone ?? '基础订单'}。`,
    ).join('\n\n') +
    '\n\n' +
    CUSTOMER_IDS.map(
      (id) =>
        `## ${CUSTOMERS[id].name}\n\n${CUSTOMERS[id].stories.map((text, i) => `### 第${i + 1}段\n\n${text}`).join('\n\n')}\n\n违约回应：${CUSTOMERS[id].failure}`,
    ).join('\n\n'),
);
console.log({
  templates: result.templates,
  uniqueSemantics: result.uniqueSemantics,
  duplicates,
  category,
  heard,
  followed,
});

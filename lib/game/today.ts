import {
  BUFFS,
  GOODS,
  RECIPES,
  SKILLS,
  SKILL_IDS,
  XP_TO_LEVEL,
} from './config.ts';
import { quantity } from './engine.ts';
import {
  CUSTOMERS,
  customerStage,
  CUSTOMER_IDS,
  publicCalendar,
} from './commerce.ts';
import type { GameState, Good } from './types.ts';

export interface TodayTask {
  id: string;
  priority: number;
  title: string;
  detail: string;
  target: 'market' | 'production' | 'people' | 'housing' | 'intel' | 'orders';
  preference?: [string, string | number];
  good?: Good;
}
export function todayTasks(s: GameState): TodayTask[] {
  const items: TodayTask[] = [];
  if (s.health < 40 || (s.buffs.cold ?? 0) >= s.day)
    items.push({
      id: 'health',
      priority: 0,
      title: '照料身体',
      detail:
        s.health < 40
          ? '健康低于40，无法做重活和高强度加工。'
          : BUFFS.cold.detail,
      target: 'people',
      preference: ['people.id', '身体'],
    });
  if (
    s.hens.length &&
    quantity(s, 'grain') < s.hens.length * (s.skills.husbandry >= 3 ? 0.1 : 0.2)
  )
    items.push({
      id: 'feed',
      priority: 0,
      title: '今晚饲料不足',
      detail: '全部母鸡的饲料尚未备齐。',
      target: 'market',
      good: 'grain',
    });
  if (s.housing.maintenanceSuspended)
    items.push({
      id: 'maintenance',
      priority: 0,
      title: '住宅维护暂停',
      detail: '补缴维护后才能恢复新开工与休息加成。',
      target: 'housing',
      preference: ['housing.id', s.housing.id],
    });
  for (const o of s.commerce.orders.filter((o) => o.status === 'accepted')) {
    const ready = Object.entries(o.goods).every(
      ([g, q]) =>
        s.batches
          .filter(
            (b) => b.good === g && (b.expires === null || b.expires >= s.day),
          )
          .reduce((n, b) => n + b.units / 10, 0) >= q!,
    );
    if (o.deadline <= s.day + 1 || ready)
      items.push({
        id: `order:${o.id}`,
        priority: o.deadline <= s.day + 1 ? 0 : 2,
        title: ready ? `可以交付：${o.title}` : `订单临近截止：${o.title}`,
        detail: `第${o.deadline}日白天截止；违约损失保证金${o.deposit}文和客户关系。`,
        target: 'orders',
        preference: ['orders.selected', o.id],
      });
  }
  for (const good of Object.keys(GOODS) as Good[]) {
    const expiring = s.batches
      .filter(
        (b) => b.good === good && b.expires !== null && b.expires <= s.day,
      )
      .reduce((n, b) => n + b.units / 10, 0);
    if (expiring)
      items.push({
        id: `expiry:${good}`,
        priority: 1,
        title: `${GOODS[good].name}今日临期`,
        detail: `${expiring}${GOODS[good].unit}将在今夜结束时丢弃。`,
        target: 'market',
        good,
      });
  }
  for (const r of RECIPES)
    if (
      s.jobs.some((j) => j.recipeId === r.id && j.status === 'ready') &&
      quantity(s, r.output) > 0
    )
      items.push({
        id: `ready:${r.id}`,
        priority: 2,
        title: `${r.name}已完工`,
        detail: '成品已经入库，可以安排出售或交货。',
        target: 'market',
        good: r.output,
      });
  for (const skill of SKILL_IDS)
    if (
      s.skills[skill] < 3 &&
      s.skillXp[skill] >= XP_TO_LEVEL[s.skills[skill] + 1] &&
      s.skills[skill] > 0
    )
      items.push({
        id: `skill:${skill}`,
        priority: 3,
        title: `${SKILLS[skill].name}可进阶`,
        detail: '经验已达到下一阶要求，仍需准备学费和体力。',
        target: 'people',
        preference: ['people.id', skill],
      });
  for (const intel of s.intel)
    if (
      !intel.visited &&
      ((intel.resolution && s.day >= intel.resolution.due) ||
        (intel.worldId && s.day > intel.usefulUntil))
    )
      items.push({
        id: `intel:${intel.id}`,
        priority: 3,
        title: `消息可回访：${intel.title ?? intel.source}`,
        detail: '向消息来源核对后续。',
        target: 'intel',
        preference: ['intel.selected', intel.id],
      });
  for (const id of CUSTOMER_IDS) {
    const customer = s.commerce.customers[id];
    if (
      customer?.met &&
      (customerStage(s, id) > customer.visited ||
        customer.lastOutcome === 'failed')
    )
      items.push({
        id: `customer:${id}`,
        priority: 3,
        title: `${CUSTOMERS[id].name}有后续`,
        detail: '空闲时可拜访，听听这次供货之后的故事。',
        target: 'orders',
        preference: ['customers.selected', id],
      });
  }
  const offers = s.commerce.orders.filter(
    (o) => o.status === 'offered' && o.postedDay === s.day,
  ).length;
  if (offers)
    items.push({
      id: 'offers',
      priority: 4,
      title: `${offers}张供货新单`,
      detail: '先检查成本、交期和最大损失，再决定是否接单。',
      target: 'orders',
      preference: ['orders.mode', '可接订单'],
    });
  for (const f of publicCalendar(s))
    items.push({
      id: `calendar:${f.start}`,
      priority: 4,
      title: f.name,
      detail: `第${f.start}～${f.end}日；${f.detail}实际价格仍会波动。`,
      target: 'market',
    });
  return items.sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );
}

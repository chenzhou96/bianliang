import { STATUS_DURATION } from './status.ts';
import { GOODS, GOOD_IDS, HOUSING, RECIPE_MAP, EQUIPMENT } from './config.ts';
import { FACILITIES, HOME_EVENTS } from './home.ts';
import { CUSTOMER_IDS } from './commerce.ts';
import { TRADE_MILESTONES } from './market-opportunities.ts';
import { clockDay, lifeCycle, timeOfDay, validClock } from './time.ts';
import type { GameState, Good } from './types.ts';
import { SCENE_MAP } from './street-scenes.ts';

const integer = (n: unknown, minimum = 0): n is number =>
  Number.isSafeInteger(n) && (n as number) >= minimum;
const finite = (n: unknown, minimum = 0): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= minimum;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const unique = (values: unknown[]) => new Set(values).size === values.length;

/** Validate v4-only state before allowing its values into game calculations. */
export function validContinuousSave(s: GameState): boolean {
  try {
    if (
      s.pendingTrade !== undefined ||
      !validClock(s.clock) ||
      s.day !== clockDay(s.clock.minute) ||
      !['day', 'ended'].includes(s.phase)
    )
      return false;
    if (
      !Array.isArray(s.intel) ||
      !unique(s.intel.map((i) => i.id)) ||
      s.intel.some(
        (i) =>
          i.reportVersion !== 3 ||
          !integer(i.worldId, 1) ||
          Object.hasOwn(i, 'resolution') ||
          ![i.id, i.templateId, i.category, i.source, i.semantic, i.text].every(
            (v) => typeof v === 'string',
          ) ||
          !integer(i.heardDay, 1) ||
          !integer(i.usefulUntil, 1) ||
          !['new', 'confirmed', 'expired', 'wrong'].includes(i.status) ||
          (i.title !== undefined && typeof i.title !== 'string') ||
          (i.good !== undefined && !GOOD_IDS.includes(i.good)) ||
          (i.asked !== undefined && typeof i.asked !== 'boolean') ||
          (i.visited !== undefined && typeof i.visited !== 'boolean') ||
          (i.followUp !== undefined && typeof i.followUp !== 'string'),
      )
    )
      return false;
    const now = s.clock.minute;
    if (s.event !== null) {
      const e = s.event,
        scene = SCENE_MAP[e.sceneId];
      if (
        !scene ||
        !integer(e.id, 1) ||
        e.id >= s.nextId ||
        typeof e.inspected !== 'boolean' ||
        e.family !== scene.family ||
        e.variant !== scene.id ||
        e.title !== scene.title ||
        e.person !== scene.person ||
        e.text !== scene.text ||
        e.clue !== scene.clue ||
        e.inspection !== scene.inspection ||
        !Array.isArray(e.choices) ||
        e.choices.length !== scene.choices.length ||
        e.choices.some(
          (c, n) =>
            c.id !== scene.choices[n].id ||
            c.label !== scene.choices[n].label ||
            typeof c.hint !== 'string' ||
            !record(c.cost) ||
            (c.cost.cash ?? 0) !== (scene.choices[n].cost?.cash ?? 0) ||
            (c.cost.stamina ?? 0) !== (scene.choices[n].cost?.stamina ?? 0),
        )
      )
        return false;
    }
    if (
      !record(s.buffs) ||
      Object.entries(s.buffs).some(
        ([key, until]) =>
          !Object.hasOwn(STATUS_DURATION, key) || !integer(until),
      ) ||
      !record(s.intelSeen) ||
      Object.values(s.intelSeen).some((until) => !integer(until)) ||
      !record(s.cooldowns) ||
      Object.values(s.cooldowns).some((until) => !integer(until))
    )
      return false;
    const life = s.life;
    if (
      !record(life) ||
      !integer(life.ateCycle, -1) ||
      life.ateCycle > lifeCycle(now) ||
      !integer(life.lastDawn) ||
      life.lastDawn > now ||
      timeOfDay(life.lastDawn) !== 360 ||
      typeof life.autoFeed !== 'boolean' ||
      !Array.isArray(life.fed) ||
      !unique(life.fed)
    )
      return false;
    if (
      !Object.hasOwn(HOUSING, s.housing.id) ||
      (s.housing.paidThrough !== null &&
        (!integer(s.housing.paidThrough) || s.housing.paidThrough > now))
    )
      return false;
    if (
      !Array.isArray(s.hens) ||
      s.hens.some(
        (h) =>
          !integer(h.id, 1) ||
          !integer(h.hunger) ||
          h.hunger >= 3 ||
          !integer(h.cost),
      ) ||
      life.fed.some((id) => !s.hens.some((h) => h.id === id))
    )
      return false;
    if (
      life.wakeSummary !== null &&
      (!record(life.wakeSummary) ||
        !integer(life.wakeSummary.at) ||
        life.wakeSummary.at > now ||
        !Array.isArray(life.wakeSummary.lines) ||
        life.wakeSummary.lines.length > 14 ||
        life.wakeSummary.lines.some((line) => typeof line !== 'string'))
    )
      return false;
    const home = s.home;
    if (
      !record(home) ||
      typeof home.cart !== 'boolean' ||
      !Array.isArray(home.facilities) ||
      home.facilities.length > 4 ||
      !unique(home.facilities.map((f) => f.kind)) ||
      home.facilities.some(
        (f) =>
          !Object.hasOwn(FACILITIES, f.kind) ||
          typeof f.installed !== 'boolean',
      )
    )
      return false;
    if (
      !Array.isArray(home.coldPriority) ||
      !unique(home.coldPriority) ||
      home.coldPriority.some((g) => !GOOD_IDS.includes(g))
    )
      return false;
    if (
      !record(home.visits) ||
      Object.entries(home.visits).some(
        ([id, v]) =>
          !CUSTOMER_IDS.includes(id as never) ||
          !v ||
          !integer(v.count, 1) ||
          v.count > 2 ||
          !integer(v.at) ||
          v.at > now,
      )
    )
      return false;
    if (
      !record(home.events) ||
      Object.entries(home.events).some(
        ([id, at]) =>
          !Object.hasOwn(HOME_EVENTS, id) || !integer(at) || at > now,
      )
    )
      return false;
    if (
      !Array.isArray(s.batches) ||
      s.batches.some(
        (b) =>
          !integer(b.id, 1) ||
          !GOOD_IDS.includes(b.good) ||
          b.good === 'hen' ||
          !integer(b.units, 1) ||
          (b.good !== 'grain' && b.units % 10 !== 0) ||
          !integer(b.cost) ||
          !['buy', 'gift', 'production'].includes(b.origin) ||
          (GOODS[b.good].life
            ? !finite(b.remainingMinutes, 0.5) ||
              b.remainingMinutes > GOODS[b.good].life! * 1440
            : b.remainingMinutes !== null),
      )
    )
      return false;
    if (
      !Array.isArray(s.equipment) ||
      s.equipment.some(
        (e) =>
          !integer(e.id, 1) ||
          !Object.hasOwn(EQUIPMENT, e.kind) ||
          typeof e.installed !== 'boolean',
      )
    )
      return false;
    if (
      !Array.isArray(s.jobs) ||
      s.jobs.some(
        (j) =>
          !integer(j.id, 1) ||
          !Object.hasOwn(RECIPE_MAP, j.recipeId) ||
          !integer(j.remainingMinutes) ||
          (j.status === 'queued' &&
            (j.remainingMinutes === 0 ||
              !s.equipment.some((e) => e.id === j.equipmentId))) ||
          !['queued', 'ready', 'abandoned'].includes(j.status),
      )
    )
      return false;
    const ids = [...s.batches, ...s.hens, ...s.equipment, ...s.jobs].map(
      (x) => x.id,
    );
    if (!unique(ids) || ids.some((id) => id >= s.nextId)) return false;
    const offers = s.marketOffers;
    if (
      !record(offers) ||
      !integer(offers.cycle) ||
      (s.phase !== 'ended'
        ? offers.cycle !== lifeCycle(now)
        : offers.cycle > lifeCycle(now)) ||
      !integer(offers.profitStreak) ||
      !finite(offers.profitAtDawn, -Number.MAX_SAFE_INTEGER) ||
      !record(offers.milestones) ||
      Object.entries(offers.milestones).some(
        ([id, at]) =>
          !Object.hasOwn(TRADE_MILESTONES, id) || !integer(at) || at > now,
      )
    )
      return false;
    if (
      !Array.isArray(offers.requests) ||
      offers.requests.length > 3 ||
      !unique(offers.requests.map((r) => r.id)) ||
      offers.requests.some(
        (r) =>
          typeof r.id !== 'string' ||
          !CUSTOMER_IDS.includes(r.customer) ||
          !GOOD_IDS.includes(r.good) ||
          !integer(r.quantity, 1) ||
          !integer(r.remaining) ||
          r.remaining > r.quantity ||
          !integer(r.price, 1) ||
          !integer(r.opensAt) ||
          !integer(r.deadline) ||
          r.deadline < r.opensAt ||
          (r.reservedUntil !== null && r.reservedUntil !== r.deadline),
      )
    )
      return false;
    if (
      !Array.isArray(offers.lots) ||
      offers.lots.length > 3 ||
      !unique(offers.lots.map((l) => l.id)) ||
      offers.lots.some(
        (l) =>
          typeof l.id !== 'string' ||
          !record(l.goods) ||
          !Object.keys(l.goods).length ||
          Object.entries(l.goods).some(
            ([g, q]) =>
              !GOOD_IDS.includes(g as Good) || g === 'hen' || !integer(q, 1),
          ) ||
          !integer(l.price, 1) ||
          !integer(l.opensAt) ||
          !integer(l.closesAt) ||
          l.closesAt <= l.opensAt ||
          !integer(l.shelfMinutes, 1) ||
          typeof l.bought !== 'boolean' ||
          typeof l.large !== 'boolean',
      )
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

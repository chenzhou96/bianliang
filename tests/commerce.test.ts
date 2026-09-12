import { closeDay, setDay } from './helpers.ts';
import { GOODS } from '../lib/game/config.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  readSave,
  actionPreview,
  assets,
  availableSurplus,
} from '../lib/game/engine.ts';
import {
  generateOrders,
  orderTerms,
  returnTerms,
  publicCalendar,
  CUSTOMERS,
  CUSTOMER_IDS,
  ORDER_TEMPLATES,
  updateMilestones,
} from '../lib/game/commerce.ts';
import { publicState } from '../lib/game/webmcp.ts';
import { todayTasks } from '../lib/game/today.ts';
import type { Action, GameState, Order } from '../lib/game/types.ts';

function act(s: GameState, a: Action) {
  const r = dispatch(s, a);
  assert.equal(r.error, undefined, r.error);
  return r.state;
}
function setup(highRisk = false) {
  const s = newGame(91, 30000);
  setDay(s, 4);
  s.cash = 5000;
  s.encounterDay = s.day;
  s.phase = 'day';
  const order: Order = {
    id: 900,
    templateId: 'school-bread',
    customer: 'baker',
    title: '测试供货',
    description: '交齐两枚鸡蛋和一份面粉。',
    goods: { egg: 2, flour: 1 },
    prices: { egg: 20, flour: 50 },
    price: 90,
    deposit: highRisk ? 18 : 0,
    highRisk,
    postedDay: 4,
    deadlineAt: 5 * 1440 + 1200,
    status: 'offered',
    settledDay: null,
  };
  s.commerce.orders = [order];
  s.commerce.relations.baker = highRisk ? 3 : 0;
  s.batches = [
    {
      id: 800,
      good: 'egg',
      units: 10,
      cost: 10,
      origin: 'buy',
      remainingMinutes: 2880,
    },
    {
      id: 801,
      good: 'egg',
      remainingMinutes: 2880,
      units: 10,
      cost: 5,
      origin: 'production',
    },
    {
      id: 802,
      good: 'flour',
      remainingMinutes: null,
      units: 10,
      cost: 30,
      origin: 'buy',
    },
  ];
  for (const b of s.batches)
    b.remainingMinutes = GOODS[b.good].life ? 2880 : null;
  s.nextId = 1000;
  return s;
}

void test('high-risk contracts require explicit matching terms and conserve escrow', () => {
  let s = setup(true);
  const original = structuredClone(s),
    o = s.commerce.orders[0];
  assert(dispatch(s, { type: 'acceptOrder', orderId: o.id }).error);
  assert.equal(
    actionPreview(s, { type: 'acceptOrder', orderId: o.id }).error,
    undefined,
  );
  assert(actionPreview(s, { type: 'acceptOrder', orderId: o.id }).confirmation);
  assert.deepEqual(s, original);
  s = act(s, { type: 'acceptOrder', orderId: o.id, confirm: orderTerms(o) });
  assert.equal(s.cash, 4982);
  assert.equal(s.ledger.depositsPaid, 18);
  assert.equal(assets(s), assets(original));
  assert(
    dispatch(s, { type: 'acceptOrder', orderId: o.id, confirm: orderTerms(o) })
      .error,
  );
  s = act(s, { type: 'deliverOrder', orderId: o.id });
  assert.equal(s.cash, 5090);
  assert.equal(s.ledger.depositsReturned, 18);
  assert.equal(s.ledger.productionRevenue, 20);
  assert.equal(s.ledger.productionCost, 5);
  assert.equal(s.ledger.tradeRevenue, 70);
  assert.equal(s.ledger.tradeCost, 40);
  assert.equal(s.commerce.completed, 1);
  assert.equal(s.commerce.relations.baker, 5);
  assert.equal(s.stamina, original.stamina - 3);
  assert(dispatch(s, { type: 'deliverOrder', orderId: o.id }).error);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

void test('deadline delivery precedes expiry and failures are charged exactly once', () => {
  let s = setup(true);
  const o = s.commerce.orders[0];
  s = act(s, { type: 'acceptOrder', orderId: o.id, confirm: orderTerms(o) });
  setDay(s, 6);
  assert.equal(
    dispatch(s, { type: 'deliverOrder', orderId: o.id }).error,
    undefined,
  );
  s = act(s, { type: 'wait', minutes: 1200 - (s.clock.minute % 1440) });
  assert.equal(s.commerce.orders.find((x) => x.id === 900)?.status, 'failed');
  assert.equal(s.ledger.depositLosses, 18);
  assert.equal(s.commerce.failed, 1);
  assert.equal(s.commerce.relations.baker, 1);
  assert(dispatch(s, { type: 'abandonOrder', orderId: 900 }).error);
  assert.equal(s.ledger.depositLosses, 18);
});

void test('insufficient inventory, expired inventory and stamina cannot partially deliver', () => {
  let s = setup();
  s = act(s, { type: 'acceptOrder', orderId: 900 });
  for (const kind of ['missing', 'expired', 'stamina']) {
    const bad = structuredClone(s);
    if (kind === 'missing') bad.batches.pop();
    if (kind === 'expired') bad.batches[0].remainingMinutes = 0;
    if (kind === 'stamina') bad.stamina = 1;
    const r = dispatch(bad, { type: 'deliverOrder', orderId: 900 });
    assert(r.error);
    assert.equal(r.state, bad);
    assert.equal(r.state.commerce.completed, 0);
  }
  assert.equal(availableSurplus(s, 'egg'), 0);
});

void test('return, death and cancellation settle active deposits without debt or duplicate costs', () => {
  let s = setup(true);
  s = act(s, {
    type: 'acceptOrder',
    orderId: 900,
    confirm: orderTerms(s.commerce.orders[0]),
  });
  const abandon = act(s, { type: 'abandonOrder', orderId: 900 });
  assert.equal(abandon.cash, s.cash);
  assert.equal(abandon.ledger.depositLosses, 18);
  s.cash = 30000;
  assert(dispatch(s, { type: 'return' }).error);
  const returned = act(s, { type: 'return', confirm: returnTerms(s) });
  assert.equal(returned.ending, 'return');
  assert.equal(returned.cash, 0);
  assert.equal(returned.ledger.depositLosses, 18);
  const dying = structuredClone(s);
  dying.health = 1;
  dying.clock.awakeMinutes = 1500;
  const died = act(dying, { type: 'wait', minutes: 60 });
  assert.equal(died.ending, 'death');
  assert.equal(died.ledger.depositLosses, 18);
});

void test('offers are deterministic, bounded and do not reroll on reload or read', () => {
  const s = newGame(27);
  setDay(s, 4);
  const t = structuredClone(s);
  generateOrders(s);
  generateOrders(t);
  assert.deepEqual(s, t);
  assert.equal(s.commerce.orders.length, 3);
  const snapshot = structuredClone(s);
  generateOrders(s);
  assert.deepEqual(s, snapshot);
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  const p = JSON.stringify(publicState(s));
  assert(!p.includes('"rng"'));
  assert(!p.includes('"commerce"'));
  assert(!p.includes(CUSTOMERS.baker.stories[2]));
  assert.equal(ORDER_TEMPLATES.length, 24);
  assert.equal(new Set(ORDER_TEMPLATES.map((t) => t.id)).size, 24);
  for (const id of CUSTOMER_IDS)
    assert.equal(ORDER_TEMPLATES.filter((t) => t.customer === id).length, 4);
});

void test('public calendar announces only seven days ahead and milestones do not repeat', () => {
  const s = newGame(29);
  s.day = 7;
  assert.equal(publicCalendar(s).length, 0);
  s.day = 8;
  assert.equal(publicCalendar(s)[0].start, 15);
  s.day = 15;
  assert.equal(publicCalendar(s)[0].name, '百味小集');
  s.skills.food = 2;
  updateMilestones(s);
  const earned = s.commerce.milestones.skill;
  s.day = 30;
  updateMilestones(s);
  assert.equal(s.commerce.milestones.skill, earned);
  assert.equal(publicCalendar(s)[0].name, '布帛交易会');
  assert(todayTasks(s).some((t) => t.id === 'calendar:30'));
});

void test('old v2 progress is rejected without mutating the supplied data', () => {
  const s = setup();
  const raw = JSON.stringify({ ...s, version: 2, saveRevision: 2 });
  assert.throws(() => readSave(raw));
  assert.equal(s.cash, 5000);
});

void test('all six customers reveal sequential stories, accept a decline and recover from failure', () => {
  for (const id of CUSTOMER_IDS) {
    let s = setup();
    s.commerce.orders[0].customer = id;
    const declined = act(s, { type: 'declineOrder', orderId: 900 });
    assert.equal(declined.cash, s.cash);
    assert.equal(declined.stamina, s.stamina);
    assert.equal(declined.commerce.relations[id], 0);
    assert.equal(declined.commerce.orders[0].status, 'declined');
    assert(dispatch(declined, { type: 'acceptOrder', orderId: 900 }).error);
    s = act(s, { type: 'acceptOrder', orderId: 900 });
    s = act(s, { type: 'visitCustomer', customerId: id });
    assert.equal(s.story, CUSTOMERS[id].stories[0]);
    s = act(s, { type: 'deliverOrder', orderId: 900 });
    s = act(s, { type: 'visitCustomer', customerId: id });
    assert.equal(s.story, CUSTOMERS[id].stories[1]);
    s.commerce.relations[id] = 3;
    s = act(s, { type: 'visitCustomer', customerId: id });
    assert.equal(s.story, CUSTOMERS[id].stories[2]);
    assert(dispatch(s, { type: 'visitCustomer', customerId: id }).error);
    s.commerce.customers[id]!.lastOutcome = 'failed';
    s = act(s, { type: 'visitCustomer', customerId: id });
    assert.equal(s.story, CUSTOMERS[id].failure);
    assert.equal(s.commerce.customers[id]!.visited, 3);
    assert(dispatch(s, { type: 'visitCustomer', customerId: id }).error);
    assert.equal(
      publicState(s).customers?.find((c) => c.id === id)?.stories.length,
      3,
    );
    s.commerce.relations[id] = 10;
    s = act(s, { type: 'visitCustomer', customerId: id });
    assert.equal(s.story, CUSTOMERS[id].stories[3]);
    assert.equal(s.commerce.customers[id]!.visited, 4);
    assert.equal(
      publicState(s).customers?.find((c) => c.id === id)?.stories.length,
      4,
    );
    assert.deepEqual(readSave(JSON.stringify(s)), s);
    assert(dispatch(s, { type: 'visitCustomer', customerId: id }).error);
  }
});

void test('a product finishing one minute after the deadline cannot rescue its contract', () => {
  let s = setup(true);
  const o = s.commerce.orders[0];
  o.goods = { saltedEgg: 2 };
  o.prices = { saltedEgg: 45 };
  s = act(s, { type: 'acceptOrder', orderId: 900, confirm: orderTerms(o) });
  s.batches = [];
  setDay(s, 6);
  s.housing.id = 'room';
  s.equipment = [{ id: 1100, kind: 'pickleVat', installed: true, jobId: 1101 }];
  s.jobs = [
    {
      id: 1101,
      recipeId: 'saltedEgg',
      quantity: 1,
      equipmentId: 1100,
      startDay: 4,

      inputCost: 20,
      outputUnits: 20,
      remainingMinutes: 721,
      status: 'queued',
    },
  ];
  s.nextId = 1200;
  s = act(s, { type: 'wait', minutes: 1201 - (s.clock.minute % 1440) });
  assert.equal(s.commerce.orders.find((x) => x.id === 900)?.status, 'failed');
  assert.equal(s.ledger.depositLosses, 18);
  assert(dispatch(s, { type: 'deliverOrder', orderId: 900 }).error);
  assert(s.operationHistory.at(-1)?.jobs.some((j) => j.status === 'ready'));
});

void test('generated order sizes remain carryable and escrow validation rejects corruption', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = newGame(seed);
    setDay(s, 4);
    s.cash = 100000;
    s.skills.food = 3;
    generateOrders(s);
    for (const o of s.commerce.orders) {
      const units = Object.values(o.goods).reduce((n, q) => n + q!, 0);
      assert(units <= 90);
      assert(
        Math.floor(o.deadlineAt / 1440) + 1 - o.postedDay >=
          (o.highRisk ? 3 : 4),
      );
      assert(
        Math.floor(o.deadlineAt / 1440) + 1 - o.postedDay <=
          (o.highRisk ? 4 : 6),
      );
    }
  }
  const s = setup(true);
  const accepted = act(s, {
    type: 'acceptOrder',
    orderId: 900,
    confirm: orderTerms(s.commerce.orders[0]),
  });
  accepted.ledger.depositsPaid++;
  assert.throws(() => readSave(JSON.stringify(accepted)));
});

void test('a thousand commerce days keep escrow, offers, achievements and saves bounded', () => {
  let s = newGame(20260912, 30000);
  s.cash = 1000000;
  s.housing.id = 'mansion';
  s.skills.food = 3;
  let maximumBytes = 0;
  const earned = new Map<string, number>();
  for (let day = 1; day <= 1000; day++) {
    if (s.event)
      s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
    const offer = s.commerce.orders.find((o) => o.status === 'offered');
    if (offer) {
      s = act(s, {
        type: 'acceptOrder',
        orderId: offer.id,
        confirm: orderTerms(offer),
      });
      if (day % 3 === 0)
        s = act(s, { type: 'abandonOrder', orderId: offer.id });
      else {
        s.batches = Object.entries(offer.goods).map(([good, q]) => ({
          id: s.nextId++,
          good: good as keyof typeof offer.goods,
          units: q! * 10,
          cost: 1,
          origin: 'buy' as const,
          remainingMinutes: GOODS[good as keyof typeof GOODS].life
            ? 1440
            : null,
        }));
        s = act(s, {
          type: 'deliverOrder',
          orderId: offer.id,
          transport: 'porter',
        });
      }
    }
    if (s.event)
      s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
    s = closeDay(s, 'mansion');
    assert.equal(s.day, day + 1);
    assert(s.commerce.orders.length <= 35);
    assert(s.operationHistory.length <= 50);
    assert.equal(
      s.ledger.depositsPaid -
        s.ledger.depositsReturned -
        s.ledger.depositLosses,
      0,
    );
    for (const [id, date] of Object.entries(s.commerce.milestones)) {
      if (earned.has(id)) assert.equal(date, earned.get(id));
      earned.set(id, date);
    }
    const raw = JSON.stringify(s);
    maximumBytes = Math.max(maximumBytes, Buffer.byteLength(raw));
    if (day % 25 === 0) assert.deepEqual(readSave(raw), s);
  }
  assert(s.commerce.completed > 300);
  assert(s.commerce.failed > 100);
  assert(maximumBytes < 150000, `max save ${maximumBytes}`);
});

void test('profit streaks reset on a flat day and unlock only after three consecutive settlements', () => {
  let s = newGame(20260912);
  s.cash = 5000;
  const close = (profit: number) => {
    if (s.event)
      s = act(s, { type: 'choice', eventId: s.event.id, id: 'decline' });
    s.ledger.tradeRevenue += profit;
    s = closeDay(s, 'inn');
  };
  close(20);
  close(20);
  close(0);
  assert.equal(s.commerce.positiveDays, 0);
  assert.equal(s.commerce.milestones.steady, undefined);
  close(10);
  close(10);
  assert.equal(s.commerce.milestones.steady, undefined);
  close(10);
  assert.equal(s.commerce.milestones.steady, 7);
  close(10);
  assert.equal(s.commerce.milestones.steady, 7);
});

void test('contracts use their exact absolute deadline, including nonstandard minutes', () => {
  let s = setup(true);
  s = act(s, {
    type: 'acceptOrder',
    orderId: 900,
    confirm: orderTerms(s.commerce.orders[0]),
  });
  setDay(s, 6, 539);
  const action = { type: 'deliverOrder', orderId: 900 } as const;
  const duration = actionPreview(s, action).minutes;
  s.commerce.orders[0].deadlineAt = s.clock.minute + duration;
  const preview = actionPreview(s, action);
  assert.equal(preview.error, undefined);
  assert.equal(preview.finishAt, s.commerce.orders[0].deadlineAt);
  const delivered = act(s, action);
  assert.equal(delivered.commerce.orders[0].status, 'delivered');
  assert.equal(delivered.ledger.depositLosses, 0);
  assert.deepEqual(readSave(JSON.stringify(delivered)), delivered);
  const late = structuredClone(s);
  late.commerce.orders[0].deadlineAt--;
  const original = structuredClone(late);
  assert.ok(dispatch(late, action).error);
  assert.deepEqual(late, original);
  const expired = act(late, { type: 'wait', minutes: duration });
  assert.equal(expired.commerce.orders[0].status, 'failed');
  assert.equal(expired.ledger.depositLosses, 18);
});

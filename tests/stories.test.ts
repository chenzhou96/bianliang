import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  dispatch,
  readSave,
  actionPreview,
  maybeEncounter,
  quantity,
} from '../lib/game/engine.ts';
import { STORIES, storyStage } from '../lib/game/stories.ts';
import { STREET_SCENES } from '../lib/game/street-scenes.ts';
import {
  discoverStory,
  knownStory,
  refreshStories,
  validStories,
} from '../lib/game/story-engine.ts';
import { GOODS } from '../lib/game/config.ts';
import { publicState } from '../lib/game/webmcp.ts';
import { actionTiming } from '../lib/game/action-time.ts';
import type { GameState, Good } from '../lib/game/types.ts';
import { setDay, act } from './helpers.ts';
import { knownIntel } from '../lib/game/intelligence.ts';

function rich() {
  const s = newGame(711, 30000);
  s.cash = 100000;
  s.housing = { id: 'mansion', paidThrough: null, maintenanceSuspended: false };
  s.skills = { food: 1, textile: 1, brewing: 1, husbandry: 1 };
  return s;
}
function supplies(s: GameState, goods: Partial<Record<Good, number>> = {}) {
  for (const [good, n] of Object.entries(goods))
    s.batches.push({
      id: s.nextId++,
      good: good as Good,
      units: n! * 10,
      cost: n! * 10,
      origin: 'buy',
      remainingMinutes: GOODS[good as Good].life
        ? GOODS[good as Good].life! * 1440
        : null,
    });
}

await test('seven authored story graphs and sixteen scenes have reachable endings and free exits', () => {
  assert.equal(STORIES.length, 7);
  assert.equal(STREET_SCENES.length, 16);
  assert.equal(STREET_SCENES.filter((s) => s.storyId).length, 6);
  for (const scene of STREET_SCENES) {
    const exit = scene.choices.find((c) => c.id === 'decline')!;
    assert.equal(exit.minutes, 0);
    assert.equal(exit.cost, undefined);
    assert.ok(scene.choices.length >= 3);
    for (const c of scene.choices)
      if (c.storyStage) assert.ok(storyStage(scene.storyId!, c.storyStage));
  }
  for (const d of STORIES) {
    assert.equal(new Set(d.stages.map((s) => s.id)).size, d.stages.length);
    const reachable = new Set<string>();
    const walk = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      const stage = storyStage(d.id, id);
      if (stage.deadlineMinutes) {
        assert.ok(stage.timeout);
        walk(stage.timeout!);
      }
      for (const c of stage.choices) {
        walk(c.next);
        if (c.influence?.caughtNext) walk(c.influence.caughtNext);
      }
      assert.ok(stage.ending || stage.choices.length);
    };
    walk(d.opening);
    assert.equal(reachable.size, d.stages.length, `${d.id}: unreachable stage`);
    assert.ok(
      d.stages.filter((s) => s.ending && s.id !== 'declined').length >= 2,
    );
  }
});

for (const d of STORIES) {
  // Discover paths to every non-timeout ending using the actual configured choices.
  const paths = new Map<string, { stage: string; choice: string }[]>();
  const queue = [
    { id: d.opening, path: [] as { stage: string; choice: string }[] },
  ];
  const seen = new Set<string>();
  while (queue.length) {
    const { id, path } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const stage = storyStage(d.id, id);
    if (stage.ending) paths.set(id, path);
    for (const c of stage.choices)
      queue.push({ id: c.next, path: [...path, { stage: id, choice: c.id }] });
  }
  for (const [ending, path] of paths)
    await test(`${d.title}: real actions reach ${ending}, preserve chosen history and reload`, () => {
      let s = rich();
      const id = discoverStory(s, d.id, 'tea').id;
      for (const step of path) {
        let q = s.stories.find((q) => q.id === id)!;
        while (s.clock.minute < q.availableAt) {
          s = act(s, {
            type: 'wait',
            minutes: Math.min(1440, q.availableAt - s.clock.minute),
          });
          q = s.stories.find((q) => q.id === id)!;
        }
        // Isolate graph/settlement from survival setup; time still flows through dispatch.
        s.stamina = 100;
        s.health = 100;
        s.clock.fatigueMinutes = 0;
        s.clock.sleepDebt = 0;
        const c = storyStage(d.id, step.stage).choices.find(
          (c) => c.id === step.choice,
        )!;
        supplies(s, c.cost?.goods);
        const action = {
          type: 'storyAction',
          storyId: id,
          stage: step.stage,
          choiceId: c.id,
        } as const;
        const preview = actionPreview(s, action);
        if (preview.error && preview.nextOpeningAt)
          s = act(s, {
            type: 'wait',
            minutes: preview.nextOpeningAt - s.clock.minute,
          });
        const before = structuredClone(s);
        s = act(s, action);
        assert.equal(s.stories[0].history.at(-1)?.choice, c.id);
        for (const [g, n] of Object.entries(c.cost?.goods ?? {}))
          assert.equal(quantity(before, g as Good) - quantity(s, g as Good), n);
        assert.deepEqual(readSave(JSON.stringify(s)), s);
        const duplicate = dispatch(s, action);
        assert.ok(duplicate.error);
        assert.deepEqual(duplicate.state, s);
      }
      assert.equal(s.stories[0].stage, ending);
      assert.equal(s.stories[0].status, 'ended');
    });
}

await test('different decisions in one opening unlock different people, objectives and endings', () => {
  const s = rich(),
    q = discoverStory(s, 'broken-eggs', 'tea');
  const a = act(s, {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'advance',
  });
  const b = act(s, {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'escort',
  });
  assert.equal(a.stories[0].stage, 'letter');
  assert.equal(b.stories[0].stage, 'porter');
  assert.notEqual(
    knownStory(a, a.stories[0]).objective,
    knownStory(b, b.stories[0]).objective,
  );
  assert.equal(a.cash, s.cash - 20);
  assert.equal(b.cash, s.cash);
});

await test('a pending scene blocks all unrelated engine actions, persists, and has a zero-resource exit', () => {
  const s = rich();
  setDay(s, 2);
  maybeEncounter(s, true);
  assert.ok(s.event);
  const before = structuredClone(s);
  for (const action of [
    { type: 'wait', minutes: 1 },
    { type: 'autoFeed', enabled: true },
    { type: 'tea' },
    { type: 'market' },
  ] as const) {
    assert.ok(dispatch(s, action).error);
    assert.deepEqual(s, before);
  }
  assert.deepEqual(readSave(JSON.stringify(s)), s);
  s.cash = 0;
  s.stamina = 0;
  const leave = {
    type: 'choice',
    eventId: s.event!.id,
    id: 'decline',
  } as const;
  assert.equal(actionTiming(s, leave).minutes, 0);
  const done = act(s, leave);
  assert.equal(done.event, null);
  assert.equal(done.cash, 0);
  assert.equal(done.clock.minute, s.clock.minute);
  assert.deepEqual(readSave(JSON.stringify(done)), done);
});

await test('three active lines cap acceptance, not discoveries or free refusal', () => {
  let s = rich();
  for (const d of STORIES.slice(0, 3))
    discoverStory(s, d.id, 'encounter', d.stages[0].choices[0].next);
  const q = discoverStory(s, 'embroidery', 'tea');
  assert.match(
    dispatch(s, {
      type: 'storyAction',
      storyId: q.id,
      stage: q.stage,
      choiceId: 'master',
    }).error ?? '',
    /三条/,
  );
  s = act(s, {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'decline',
  });
  assert.equal(s.stories.at(-1)?.status, 'ended');
});

await test('waiting mail remains hidden until exact time and does not consume tea or encounter allowance', () => {
  const s = rich();
  setDay(s, 2, 1439);
  const q = discoverStory(s, 'broken-eggs', 'encounter', 'letter');
  q.availableAt = s.clock.minute + 2;
  const now = knownStory(s, q);
  assert.equal(now.choices.length, 0);
  assert.ok(!now.text.includes('三日'));
  const midnight = act(s, { type: 'wait', minutes: 1 });
  assert.equal(midnight.stories[0].status, 'waiting');
  const due = act(midnight, { type: 'wait', minutes: 1 });
  assert.equal(due.stories[0].status, 'active');
  assert.equal(due.event, null);
  assert.equal(due.teaDay, s.teaDay);
  assert.equal(knownStory(due, due.stories[0]).choices.length, 3);
});

await test('delivery exactly at deadline succeeds; passing it opens a specific repair stage', () => {
  const s = rich(),
    q = discoverStory(s, 'broken-eggs', 'encounter', 'supply');
  supplies(s, { egg: 4 });
  const action = {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'deliver',
  } as const;
  q.deadlineAt = s.clock.minute + actionTiming(s, action).minutes;
  const exact = act(s, action);
  assert.equal(exact.stories[0].stage, 'supplier-end');
  q.deadlineAt--;
  const late = dispatch(s, action);
  assert.ok(late.error);
  assert.deepEqual(late.state, s);
  const expired = act(s, {
    type: 'wait',
    minutes: q.deadlineAt - s.clock.minute + 1,
  });
  assert.equal(expired.stories[0].stage, 'late');
  assert.equal(expired.stories[0].history.at(-1)?.choice, 'timeout');
});

await test('no inventory or skill causes no cost; time and delivery are not silently fabricated', () => {
  const s = rich(),
    q = discoverStory(s, 'theatre', 'encounter', 'new-clothes');
  const before = structuredClone(s);
  const failed = dispatch(s, {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'deliver',
  });
  assert.match(failed.error ?? '', /布不足/);
  assert.deepEqual(failed.state, before);
  s.skills.textile = 0;
  q.stage = 'seams';
  q.deadlineAt = null;
  assert.match(
    dispatch(s, {
      type: 'storyAction',
      storyId: q.id,
      stage: q.stage,
      choiceId: 'skill',
    }).error ?? '',
    /手艺/,
  );
  assert.equal(
    actionPreview(s, {
      type: 'storyAction',
      storyId: q.id,
      stage: q.stage,
      choiceId: 'watch',
    }).error,
    undefined,
  );
});

await test('story public view does not disclose unvisited stages, true branch or unrevealed inspection', () => {
  const s = rich();
  discoverStory(s, 'broken-eggs', 'tea');
  const json = JSON.stringify(publicState(s));
  assert.ok(!json.includes('basket-witness'));
  assert.ok(!json.includes('后厨的第二只篮'));
  assert.ok(!json.includes('double-entry'));
  setDay(s, 2);
  maybeEncounter(s, true);
  assert.equal(Object.hasOwn(publicState(s)!.event!, 'inspection'), false);
});

await test('format revision and story validation reject missing, duplicate or impossible progress', () => {
  const s = rich();
  discoverStory(s, 'granary', 'tea');
  assert.equal(s.saveRevision, 6);
  assert.ok(validStories(s));
  for (const mutate of [
    (v: GameState) => {
      v.saveRevision = 4;
    },
    (v: GameState) => {
      delete (v as Partial<GameState>).stories;
    },
    (v: GameState) => {
      v.stories.push(structuredClone(v.stories[0]));
    },
    (v: GameState) => {
      v.stories[0].stage = 'unknown';
    },
    (v: GameState) => {
      v.stories[0].history.push({
        stage: 'opening',
        choice: 'forged',
        at: 480,
        text: '',
        label: '',
      });
    },
  ]) {
    const broken = structuredClone(s);
    mutate(broken);
    assert.throws(() => readSave(JSON.stringify(broken)));
  }
  assert.deepEqual(readSave(JSON.stringify(s)), s);
});

await test('finite opportunity consumes actual stock, expires, and accounts purchase basis including porter', () => {
  let s = rich();
  const q = discoverStory(s, 'granary', 'encounter', 'settlement');
  s = act(s, {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'new-owner',
  });
  const before = s.cash;
  s = act(s, {
    type: 'storyBuy',
    storyId: q.id,
    quantity: 2,
    transport: 'porter',
  });
  assert.equal(before - s.cash, 42);
  assert.equal(s.stories[0].opportunity?.remaining, 8);
  assert.equal(s.batches.at(-1)?.cost, 42);
  assert.ok(
    dispatch(s, { type: 'storyBuy', storyId: q.id, quantity: 9 }).error,
  );
  s.stories[0].opportunity!.expiresAt = s.clock.minute - 1;
  assert.ok(
    dispatch(s, { type: 'storyBuy', storyId: q.id, quantity: 1 }).error,
  );
});

await test('ordinary home work and navigation never roll a street encounter; tea discoveries deduplicate', () => {
  let s = rich();
  setDay(s, 2, 540);
  for (const a of [
    { type: 'market' },
    { type: 'leave' },
    { type: 'wait', minutes: 1 },
    { type: 'eat', meal: 'diner' },
  ] as const) {
    s = act(s, a);
    assert.equal(s.event, null);
  }
  s = act(s, { type: 'tea' });
  assert.equal(s.event, null);
  const q = s.stories[0];
  assert.ok(q);
  discoverStory(s, q.definitionId, 'encounter');
  assert.equal(
    s.stories.filter((v) => v.definitionId === q.definitionId).length,
    1,
  );
  refreshStories(s);
  assert.ok(validStories(s));
});

await test('the theatre weaving route requires actual new production; purchases and old stock do not count', () => {
  let s = rich();
  const q = discoverStory(s, 'theatre', 'encounter', 'weaving');
  supplies(s, { cloth: 2, thread: 2 });
  const delivery = {
    type: 'storyAction',
    storyId: q.id,
    stage: q.stage,
    choiceId: 'deliver',
  } as const;
  assert.match(dispatch(s, delivery).error ?? '', /本阶段生产/);
  s.equipment.push({
    id: s.nextId++,
    kind: 'loom',
    installed: true,
    jobId: null,
  });
  s = act(s, { type: 'produce', recipeId: 'cloth', quantity: 1 });
  assert.equal(s.stories[0].produced.cloth, 2);
  assert.equal(s.event, null);
  s = readSave(JSON.stringify(s));
  s = act(s, delivery);
  assert.equal(s.stories[0].stage, 'curtain-new');
  assert.equal(s.stories[0].history.at(-1)?.choice, 'deliver');
});

await test('revisiting an earlier fork cannot farm its experience reward', () => {
  let s = rich();
  const q = discoverStory(s, 'embroidery', 'encounter', 'new-pattern');
  const doChoice = (stage: string, choiceId: string) => {
    s = act(s, { type: 'storyAction', storyId: q.id, stage, choiceId });
  };
  doChoice('new-pattern', 'craft');
  const xp = s.skillXp.textile;
  doChoice('sample', 'old');
  doChoice('old-order', 'talk');
  doChoice('new-pattern', 'craft');
  assert.equal(s.skillXp.textile, xp);
});

for (const d of STORIES)
  for (const stage of d.stages.filter((s) => s.deadlineMinutes)) {
    await test(`${d.title}: ${stage.title} expiry enters authored repair and exposes no stale reward`, () => {
      let s = rich();
      const q = discoverStory(s, d.id, 'encounter', stage.id);
      q.deadlineAt = s.clock.minute + 1;
      s = act(s, { type: 'wait', minutes: 2 });
      assert.equal(s.stories[0].stage, stage.timeout);
      assert.equal(s.stories[0].history.at(-1)?.choice, 'timeout');
      assert.deepEqual(readSave(JSON.stringify(s)), s);
    });
  }

await test('every authored stage option executes its own next node and single-use effects', () => {
  for (const d of STORIES)
    for (const stage of d.stages)
      for (const choice of stage.choices) {
        let s = rich();
        const q = discoverStory(s, d.id, 'encounter', stage.id);
        if (q.availableAt > s.clock.minute) {
          s.clock.minute = q.availableAt;
          setDay(
            s,
            Math.floor(s.clock.minute / 1440) + 1,
            s.clock.minute % 1440,
          );
          refreshStories(s);
        }
        supplies(s, choice.cost?.goods);
        if (choice.produced) {
          s.equipment.push({
            id: s.nextId++,
            kind: 'loom',
            installed: true,
            jobId: null,
          });
          supplies(s, { thread: 2 });
          s = act(s, { type: 'produce', recipeId: 'cloth', quantity: 1 });
        }
        const a = {
          type: 'storyAction',
          storyId: q.id,
          stage: stage.id,
          choiceId: choice.id,
        } as const;
        const preview = actionPreview(s, a);
        if (preview.nextOpeningAt && preview.error)
          s = act(s, {
            type: 'wait',
            minutes: preview.nextOpeningAt - s.clock.minute,
          });
        s = act(s, a);
        assert.equal(
          s.stories[0].stage,
          choice.next,
          `${d.id}/${stage.id}/${choice.id}`,
        );
        assert.deepEqual(readSave(JSON.stringify(s)), s);
      }
});

await test('public market developments arrive without paying or visiting; future clues remain private', () => {
  let s = rich();
  s.clock.minute = 540;
  s = act(s, { type: 'tea' });
  const i = s.intel[0],
    w = s.worlds.find((w) => w.id === i.worldId)!;
  w.truth = 'normal';
  assert.equal(knownIntel(s, i).publicUpdate, null);
  setDay(s, w.start, 540);
  const cash = s.cash;
  s = act(s, { type: 'wait', minutes: 1 });
  assert.equal(s.cash, cash);
  assert.equal(s.intel[0].asked, undefined);
  assert.equal(s.intel[0].visited, undefined);
  assert.equal(knownIntel(s, s.intel[0]).publicUpdate, w.publicText);
  assert.equal(s.intel[0].status, 'confirmed');
});

await test('long waits preview story deadlines and reading preserves the previous operation result', () => {
  let s = rich();
  const q = discoverStory(s, 'broken-eggs', 'encounter', 'supply');
  q.deadlineAt = s.clock.minute + 10;
  const preview = actionPreview(s, { type: 'wait', minutes: 11 });
  assert.match(preview.warning, /一篮碎蛋/);
  assert.equal(preview.confirmation, true);
  s = act(s, { type: 'eat', meal: 'bread' });
  const history = structuredClone(s.operationHistory),
    response = s.lastResponse;
  const now = s.clock.minute;
  s = act(s, { type: 'storyRead', storyId: q.id });
  assert.deepEqual(s.operationHistory, history);
  assert.equal(s.lastResponse, response);
  assert.equal(s.clock.minute, now);
  assert.equal(s.stories[0].unread, false);
});

await test('current saves reject incomplete market messages and mismatched scene metadata', () => {
  let s = rich();
  s.clock.minute = 540;
  s = act(s, { type: 'tea' });
  const broken = JSON.parse(JSON.stringify(s));
  delete broken.intel[0].source;
  assert.throws(() => readSave(JSON.stringify(broken)));
  setDay(s, 2);
  maybeEncounter(s, true);
  s.event!.choices[0].cost.cash = 999;
  assert.throws(() => readSave(JSON.stringify(s)));
});

import { marketMethod } from './market-control.ts';
import { GOODS, GOOD_IDS } from './config.ts';
import { STORIES, STORY_MAP, storyStage } from './stories.ts';
import { formatMoment } from './time.ts';
import type { GameState, Good } from './types.ts';
import type { StoryChoice, StoryInstance, StoryStatus } from './story-types.ts';

export const STORY_LIMIT = 3;
export function activeStories(s: GameState) {
  return s.stories.filter(
    (q) => q.status === 'active' || q.status === 'waiting',
  ).length;
}
export function findStory(s: GameState, id: number) {
  const q = s.stories.find((q) => q.id === id);
  if (!q) throw Error('找不到这条故事');
  return q;
}
export function enterStoryStage(q: StoryInstance, id: string, at: number) {
  const stage = storyStage(q.definitionId, id);
  q.stage = id;
  q.enteredAt = at;
  q.availableAt = at + (stage.waitMinutes ?? 0);
  q.deadlineAt = stage.deadlineMinutes
    ? q.availableAt + stage.deadlineMinutes
    : null;
  q.status = stage.ending ? 'ended' : stage.waitMinutes ? 'waiting' : 'active';
  q.unread = true;
  q.produced = {};
}
export function discoverStory(
  s: GameState,
  definitionId: string,
  source: StoryInstance['source'],
  stageId?: string,
) {
  const prior = s.stories.find((q) => q.definitionId === definitionId);
  if (prior) return prior;
  const definition = STORY_MAP[definitionId];
  if (!definition) throw Error('找不到这条故事');
  if (stageId && activeStories(s) >= STORY_LIMIT)
    throw Error('已有三条故事正在进行，请先处理或放下其中一条');
  const q: StoryInstance = {
    id: s.nextId++,
    definitionId,
    stage: definition.opening,
    status: 'offered',
    discoveredAt: s.clock.minute,
    enteredAt: s.clock.minute,
    availableAt: s.clock.minute,
    deadlineAt: null,
    source,
    unread: true,
    evidence: [],
    produced: {},
    history: [],
    opportunity: null,
  };
  s.stories.push(q);
  if (stageId) enterStoryStage(q, stageId, s.clock.minute);
  return q;
}
export function refreshStories(s: GameState) {
  for (const q of s.stories) {
    if (q.status === 'waiting' && s.clock.minute >= q.availableAt) {
      q.status = 'active';
      q.unread = true;
    }
    if (
      q.status === 'active' &&
      q.deadlineAt !== null &&
      s.clock.minute > q.deadlineAt
    ) {
      const stage = storyStage(q.definitionId, q.stage);
      if (!stage.timeout) throw Error('限时故事缺少后续');
      q.history.push({
        stage: q.stage,
        choice: 'timeout',
        label: '错过约定',
        text: '原阶段的交付约定已过期，请查看新的后续。',
        at: q.deadlineAt,
      });
      enterStoryStage(q, stage.timeout, s.clock.minute);
    }
  }
}
export function storyChoice(
  s: GameState,
  id: number,
  stageId: string,
  choiceId: string,
) {
  const q = findStory(s, id);
  if (q.stage !== stageId) throw Error('剧情已推进，请查看当前阶段');
  if (q.status === 'ended') throw Error('这条故事已结束');
  if (s.clock.minute < q.availableAt)
    throw Error(`${formatMoment(q.availableAt)}后会有来信`);
  const stage = storyStage(q.definitionId, q.stage);
  const c = stage.choices.find((c) => c.id === choiceId);
  if (!c) throw Error('这个阶段没有该选择');
  if (
    q.status === 'offered' &&
    c.id !== 'decline' &&
    activeStories(s) >= STORY_LIMIT
  )
    throw Error('已有三条故事正在进行，请先处理或放下其中一条');
  if (c.skill && s.skills[c.skill.id] < c.skill.level)
    throw Error('手艺等级不足，可选择另一种办法');
  if (c.evidence && !q.evidence.includes(c.evidence))
    throw Error('尚未取得这项证据');
  if (c.produced && (q.produced[c.produced.good] ?? 0) < c.produced.quantity)
    throw Error(
      `需要在本阶段生产${GOODS[c.produced.good].name}${c.produced.quantity}份，采购不计入生产进度`,
    );
  return { q, c };
}
export function recordStoryProduction(s: GameState, good: Good, units: number) {
  for (const q of s.stories) {
    if (
      q.status !== 'active' ||
      (q.deadlineAt !== null && s.clock.minute > q.deadlineAt)
    )
      continue;
    const goal = storyStage(q.definitionId, q.stage).productionGoal;
    if (goal?.good === good) {
      q.produced[good] = Math.min(
        goal.quantity,
        (q.produced[good] ?? 0) + units / 10,
      );
      q.unread = true;
    }
  }
}
export function recordStoryChoice(
  q: StoryInstance,
  c: StoryChoice,
  at: number,
) {
  if (c.reveal && !q.evidence.includes(c.reveal)) q.evidence.push(c.reveal);
  q.history.push({
    stage: q.stage,
    choice: c.id,
    label: c.label,
    text: c.text,
    at,
  });
  enterStoryStage(q, c.next, at);
}
export function storyCostText(c: StoryChoice) {
  return [
    `${c.minutes + (c.influence ? marketMethod(c.influence.method).minutes : 0)}分钟`,
    c.influence
      ? `${marketMethod(c.influence.method).cash}文 · ${marketMethod(c.influence.method).stamina}体力`
      : '',
    c.cost?.cash ? `${c.cost.cash}文` : '',
    c.cost?.stamina ? `${c.cost.stamina}体力` : '',
    ...Object.entries(c.cost?.goods ?? {}).map(
      ([g, n]) => `${GOODS[g as Good].name} ×${n}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Deliberately projects discovered content only; never returns stage definitions. */
export function knownStory(s: GameState, q: StoryInstance) {
  const stage = storyStage(q.definitionId, q.stage);
  const waiting = s.clock.minute < q.availableAt;
  const abandoned =
    q.status === 'ended' && q.history.at(-1)?.choice === 'abandon';
  return {
    id: q.id,
    title: STORY_MAP[q.definitionId].title,
    status: q.status,
    stage: q.stage,
    chapter: abandoned ? '已放下这条故事' : waiting ? '等待来信' : stage.title,
    person: waiting
      ? q.history.length
        ? storyStage(q.definitionId, q.history.at(-1)!.stage).person
        : '熟人捎信'
      : stage.person,
    text: abandoned
      ? q.history.at(-1)!.text
      : waiting
        ? '对方正在安排后续，约定时刻会有消息。'
        : stage.text,
    objective: abandoned
      ? '当前约定已结束，可回看此前选择。'
      : waiting
        ? `${formatMoment(q.availableAt)}后查看来信`
        : stage.objective,
    availableAt: q.availableAt,
    deadlineAt: q.deadlineAt,
    unread: q.unread,
    production:
      !waiting && stage.productionGoal
        ? {
            ...stage.productionGoal,
            completed: q.produced[stage.productionGoal.good] ?? 0,
          }
        : null,
    history: q.history.map((h) => ({
      ...h,
      chapter: storyStage(q.definitionId, h.stage).title,
    })),
    choices:
      waiting || q.status === 'ended'
        ? []
        : stage.choices.map((c) => ({
            id: c.id,
            label: c.label,
            minutes:
              c.minutes +
              (c.influence ? marketMethod(c.influence.method).minutes : 0),
            cost: c.cost,
            destination: c.destination ?? 'intel',
            costText: storyCostText(c),
            skill: c.skill,
          })),
    opportunity:
      q.opportunity &&
      q.opportunity.expiresAt >= s.clock.minute &&
      q.opportunity.remaining > 0
        ? { ...q.opportunity }
        : null,
  };
}

export function validStories(s: GameState) {
  try {
    if (!Array.isArray(s.stories) || s.stories.length > STORIES.length)
      return false;
    const ids = new Set<number>();
    const definitions = new Set<string>();
    const integer = (n: unknown) =>
      Number.isSafeInteger(n) && (n as number) >= 0;
    for (const q of s.stories) {
      const definition = STORY_MAP[q.definitionId];
      if (
        !definition ||
        definitions.has(q.definitionId) ||
        ids.has(q.id) ||
        !integer(q.id) ||
        q.id >= s.nextId
      )
        return false;
      definitions.add(q.definitionId);
      ids.add(q.id);
      const stage = storyStage(q.definitionId, q.stage);
      if (
        !(['offered', 'active', 'waiting', 'ended'] as StoryStatus[]).includes(
          q.status,
        ) ||
        !['tea', 'encounter'].includes(q.source) ||
        typeof q.unread !== 'boolean' ||
        ![q.discoveredAt, q.enteredAt, q.availableAt].every(integer) ||
        q.discoveredAt > q.enteredAt ||
        q.enteredAt > s.clock.minute ||
        q.availableAt < q.enteredAt ||
        (q.deadlineAt !== null &&
          (!integer(q.deadlineAt) || q.deadlineAt < q.availableAt)) ||
        !Array.isArray(q.evidence) ||
        q.evidence.some((x) => typeof x !== 'string') ||
        new Set(q.evidence).size !== q.evidence.length ||
        !Array.isArray(q.history) ||
        !q.produced ||
        typeof q.produced !== 'object' ||
        Array.isArray(q.produced) ||
        Object.entries(q.produced).some(
          ([g, n]) =>
            !GOOD_IDS.includes(g as Good) || !Number.isFinite(n) || n < 0,
        )
      )
        return false;
      if (
        q.status === 'offered' &&
        (q.stage !== definition.opening || q.history.length)
      )
        return false;
      if (q.status === 'waiting' && q.availableAt <= s.clock.minute)
        return false;
      if (
        q.status === 'ended' &&
        !stage.ending &&
        q.history.at(-1)?.choice !== 'abandon'
      )
        return false;
      if (q.status !== 'ended' && stage.ending) return false;
      let priorAt = q.discoveredAt;
      for (const h of q.history) {
        const hStage = storyStage(q.definitionId, h.stage);
        if (
          !integer(h.at) ||
          h.at < priorAt ||
          h.at > s.clock.minute ||
          typeof h.label !== 'string' ||
          typeof h.text !== 'string' ||
          (!['timeout', 'abandon', 'encounter'].includes(h.choice) &&
            !hStage.choices.some((c) => c.id === h.choice))
        )
          return false;
        priorAt = h.at;
      }
      if (
        q.opportunity !== null &&
        (!q.opportunity ||
          !GOOD_IDS.includes(q.opportunity.good) ||
          ![
            q.opportunity.remaining,
            q.opportunity.price,
            q.opportunity.expiresAt,
          ].every(integer) ||
          q.opportunity.price <= 0)
      )
        return false;
    }
    return activeStories(s) <= STORY_LIMIT;
  } catch {
    return false;
  }
}

import { GOODS, GOOD_IDS, HOUSING, SKILLS } from './config.ts';
import {
  capacity,
  occupied,
  quote,
  quantity,
  rumorStatus,
  reserved,
} from './engine.ts';
import type { Action, GameState } from './types.ts';

export function publicState(s: GameState | null) {
  if (!s) return { started: false };
  return {
    started: true,
    revision: s.revision,
    day: s.day,
    target: s.target,
    phase: s.phase,
    cash: s.cash,
    health: s.health,
    stamina: s.stamina,
    staminaCap: s.health >= 70 ? 100 : s.health >= 40 ? 80 : 60,
    reputation: s.reputation,
    story: s.story,
    lastResponse: s.lastResponse,
    ending: s.ending,
    housing: {
      id: s.housing.id,
      name: HOUSING[s.housing.id].name,
      capacity: capacity(s),
      occupied: occupied(s),
      reserved: reserved(s),
    },
    skills: Object.fromEntries(
      Object.entries(s.skills).map(([k, v]) => [
        k,
        {
          name: SKILLS[k as keyof typeof SKILLS].name,
          level: v,
          xp: s.skillXp[k as keyof typeof s.skillXp],
        },
      ]),
    ),
    inventory: Object.fromEntries(
      GOOD_IDS.map((g) => [
        g,
        { name: GOODS[g].name, quantity: quantity(s, g), price: quote(s, g) },
      ]),
    ),
    market: Object.fromEntries(GOOD_IDS.map((g) => [g, quote(s, g)])),
    equipment: s.equipment,
    ledger: s.ledger,
    intelligence: s.intel.map((i) => ({
      id: i.id,
      followUp: i.followUp,
      asked: i.asked,
      visited: i.visited,
      category: i.category,
      source: i.source,
      text: i.text,
      heardDay: i.heardDay,
      status: i.status,
    })),
    rumors: s.worlds
      .filter((w) => w.heard)
      .map((w) => ({
        name: w.name,
        source: w.source,
        expected: w.expected,
        status: rumorStatus(s, w),
        ...(w.clueKnown ? { clue: w.clue } : {}),
      })),
    production: s.jobs
      .filter((j) => j.status === 'queued')
      .map((j) => ({
        id: j.id,
        recipeId: j.recipeId,
        quantity: j.quantity,
        readyDay: j.readyDay,
      })),
    event: s.event
      ? {
          id: s.event.id,
          title: s.event.title,
          text: s.event.text,
          clue: s.event.clue,
          ...(s.event.inspected ? { inspection: s.event.inspection } : {}),
          choices: s.event.choices.map((c) => ({
            id: c.id,
            label: c.label,
            hint: c.hint,
            cost: {
              cash: c.cost.cash,
              stamina: (c.cost.stamina ?? 0) + (c.cost.ap ?? 0) * 10,
            },
          })),
        }
      : null,
  };
}
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}
export interface ModelContext {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}
export function registerGameTools(
  context: ModelContext | undefined,
  getState: () => GameState | null,
  execute: (a: Action, revision: number) => { error?: string },
) {
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  const tools: Tool[] = [
    {
      name: 'read_bianliang_game',
      description:
        '读取玩家已知的长期经营状态，不披露隐藏事实、事件真相或未来日程。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => publicState(getState()),
    },
    {
      name: 'perform_bianliang_action',
      description: '执行一次明确经营操作；必须先读取revision，错误不会扣资源。',
      inputSchema: {
        type: 'object',
        properties: {
          revision: { type: 'integer' },
          action: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              good: { enum: GOOD_IDS },
              quantity: { type: 'number' },
              side: { enum: ['buy', 'sell'] },
              id: { type: 'string' },
              eventId: { type: 'integer' },
              meal: {
                enum: ['bread', 'egg', 'saltedEgg', 'grain', 'diner', 'none'],
              },
              bed: {
                enum: [
                  'inn',
                  'temple',
                  'street',
                  'room',
                  'courtyard',
                  'yard',
                  'mansion',
                ],
              },
              feed: { type: 'integer' },
              recipeId: { type: 'string' },
              skill: { enum: Object.keys(SKILLS) },
              equipment: { type: 'string' },
              housing: { type: 'string' },
              mode: { enum: ['fast', 'slow'] },
              jobId: { type: 'integer' },
              equipmentId: { type: 'integer' },
            },
            required: ['type'],
            additionalProperties: false,
          },
        },
        required: ['revision', 'action'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const x = input as { revision: number; action: Action };
        if (
          !x ||
          !Number.isInteger(x.revision) ||
          !x.action ||
          typeof x.action.type !== 'string'
        )
          return { error: '无效操作参数' };
        if (!getState()) return { error: '请先开始游戏' };
        const result = execute(x.action, x.revision);
        if (result.error) return result;
        if (typeof requestAnimationFrame === 'function')
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        return publicState(getState());
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {
      /* optional browser feature */
    }
  }
  return () => controller.abort();
}

import { quantity, quote, rumorStatus } from './engine.ts';
import { GOOD_IDS } from './config.ts';
import type { Action, GameState } from './types.ts';
export function publicState(s: GameState | null) {
  if (!s) return { started: false };
  return {
    started: true,
    revision: s.revision,
    day: s.day,
    phase: s.phase,
    cash: s.cash,
    health: s.health,
    stamina: s.stamina,
    ap: s.ap,
    story: s.story,
    ending: s.ending,
    inventory: Object.fromEntries(GOOD_IDS.map((g) => [g, quantity(s, g)])),
    market: Object.fromEntries(GOOD_IDS.map((g) => [g, quote(s, g)])),
    rumors: s.worlds
      .filter((w) => w.heard)
      .map((w) => ({
        name: w.name,
        source: w.source,
        expected: w.expected,
        status: rumorStatus(s, w),
        ...(w.clueKnown ? { clue: w.clue } : {}),
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
            cost: c.cost,
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
      description: '读取玩家已知的游戏状态，不披露隐藏事实或未来日程。',
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
      description:
        '在已经开始的游戏中执行一次明确操作；资源成本与页面相同。先读取revision，错误不会扣资源。不创建或覆盖存档。',
      inputSchema: {
        type: 'object',
        properties: {
          revision: { type: 'integer' },
          action: {
            type: 'object',
            properties: {
              type: {
                enum: [
                  'market',
                  'leave',
                  'tea',
                  'short',
                  'heavy',
                  'rest',
                  'rent',
                  'coop',
                  'endDay',
                  'return',
                  'stay',
                  'inspect',
                  'trade',
                  'choice',
                  'night',
                ],
              },
              good: { enum: GOOD_IDS },
              quantity: { type: 'number' },
              side: { enum: ['buy', 'sell'] },
              id: { type: 'string' },
              eventId: { type: 'integer' },
              meal: { enum: ['bread', 'egg', 'grain', 'diner', 'none'] },
              bed: { enum: ['inn', 'temple', 'street', 'home'] },
              feed: { type: 'integer' },
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
        if (!getState()) return { error: '请先在页面开始或继续游戏' };
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
      /* Optional browser feature; normal controls remain available. */
    }
  }
  return () => controller.abort();
}

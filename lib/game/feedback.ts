import { BUFFS, GOODS, GOOD_IDS, RULES, SKILL_IDS } from './config.ts';
import { CUSTOMER_IDS } from './commerce.ts';
import type {
  Action,
  Buff,
  GameState,
  Good,
  OperationResult,
} from './types.ts';

const NAVIGATION = new Set(['market', 'leave', 'endDay', 'returnDay', 'stay']);
export function isOperatingAction(action: Action) {
  return !NAVIGATION.has(action.type);
}

export function actionKey(action: Action): string {
  return Object.entries(action)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
}

export function actionTitle(action: Action): string {
  if (action.type === 'trade')
    return `${action.side === 'buy' ? '购入' : '售出'}${GOODS[action.good]?.name ?? '货物'} ×${action.quantity}`;
  const names: Partial<Record<Action['type'], string>> = {
    market: '进入市场',
    refill: '原料补齐',
    acceptOrder: '订单已接取',
    deliverOrder: '订单已交付',
    abandonOrder: '订单已放弃',
    declineOrder: '暂不接取订单',
    meetCustomer: '拜访客户',
    visitCustomer: '人物回访',
    returnDay: '返回白天',
    leave: '离开市场',
    endDay: '安排今晚',
    short: '短工完成',
    heavy: '重活完成',
    rest: '休息完成',
    snack: '加餐完成',
    treat: '治疗完成',
    learn: '学习完成',
    produce: '生产开工',
    night: '夜间结算',
    tea: '听取消息',
    askIntel: '追问出处',
    visitIntel: '回访消息',
    inspect: '查问遭遇',
    choice: '回应遭遇',
    install: '安装设备',
    uninstall: '封存设备',
    sellEquipment: '出售设备',
    cancelProduction: '放弃生产',
    rentHousing: '租下住所',
    buyHousing: '购置住宅',
    sellHousing: '出售产权',
    endLease: '退租',
    maintain: '补缴维护',
    return: '归航',
    stay: '继续经营',
  };
  return names[action.type] ?? '操作完成';
}

function units(s: GameState, good: Good) {
  return good === 'hen'
    ? s.hens.length * 10
    : s.batches.filter((b) => b.good === good).reduce((n, b) => n + b.units, 0);
}

export function operationResult(
  before: GameState,
  after: GameState,
  action: Action,
  error?: string,
): OperationResult {
  const revenue =
    after.ledger.tradeRevenue +
    after.ledger.productionRevenue -
    before.ledger.tradeRevenue -
    before.ledger.productionRevenue;
  const cost =
    after.ledger.tradeCost +
    after.ledger.productionCost -
    before.ledger.tradeCost -
    before.ledger.productionCost;
  return {
    ...(after.ledger.depositLosses > before.ledger.depositLosses
      ? {
          depositLoss: after.ledger.depositLosses - before.ledger.depositLosses,
        }
      : {}),
    milestones: Object.keys(after.commerce.milestones).filter(
      (id) => !before.commerce.milestones[id],
    ),
    customers: CUSTOMER_IDS.map((id) => ({
      id,
      change: after.commerce.relations[id] - before.commerce.relations[id],
    })).filter((c) => c.change !== 0),
    id: after.revision,
    day: before.day,
    action: action.type,
    actionKey: actionKey(action),
    title: error ? '操作未执行' : actionTitle(action),
    success: !error,
    ...(error ? { error } : {}),
    cash: after.cash - before.cash,
    health: after.health - before.health,
    stamina: after.stamina - before.stamina,
    items: GOOD_IDS.map((good) => ({
      good,
      quantity: (units(after, good) - units(before, good)) / 10,
    })).filter((item) => item.quantity !== 0),
    skills: SKILL_IDS.map((skill) => ({
      skill,
      xp: after.skillXp[skill] - before.skillXp[skill],
      level: after.skills[skill] - before.skills[skill],
    })).filter((v) => v.xp !== 0 || v.level !== 0),
    states: (Object.keys(BUFFS) as Buff[])
      .filter(
        (buff) =>
          (before.buffs[buff] ?? 0) >= before.day !==
          (after.buffs[buff] ?? 0) >= after.day,
      )
      .map((buff) => ({ buff, active: (after.buffs[buff] ?? 0) >= after.day })),
    jobs: after.jobs
      .filter((job) => {
        const old = before.jobs.find((j) => j.id === job.id);
        return (
          !old || old.status !== job.status || old.readyDay !== job.readyDay
        );
      })
      .map(({ id, recipeId, readyDay, status }) => ({
        id,
        recipeId,
        readyDay,
        status,
      })),
    sale: revenue || cost ? { revenue, cost, profit: revenue - cost } : null,
    workRemaining:
      action.type === 'short' || action.type === 'heavy'
        ? Math.max(0, RULES.maxWorkPerDay - after.daily.work)
        : null,
    details: error
      ? [error]
      : after.logs
          .filter((log) => log.id >= before.nextId)
          .map((log) => `${log.text}${log.items ? ` ${log.items}` : ''}`),
  };
}

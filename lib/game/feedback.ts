import { productionReadyAt } from './production-time.ts';
import { statusActive } from './status.ts';
import { BUFFS, GOODS, GOOD_IDS, SKILL_IDS } from './config.ts';
import { CUSTOMER_IDS } from './commerce.ts';
import type {
  Action,
  Buff,
  GameState,
  Good,
  OperationResult,
} from './types.ts';

const NAVIGATION = new Set(['market', 'leave', 'stay']);
export function isOperatingAction(action: Action) {
  return !NAVIGATION.has(action.type);
}

export function actionKey(action: Action): string {
  return Object.entries(action)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `${key}:${typeof value === 'object' ? JSON.stringify(value, Object.keys(value ?? {}).sort()) : String(value)}`,
    )
    .join('|');
}

export function actionTitle(action: Action): string {
  if (action.type === 'trade')
    return `${action.side === 'buy' ? '购入' : '售出'}${GOODS[action.good]?.name ?? '货物'} ×${action.quantity}`;
  const names: Partial<Record<Action['type'], string>> = {
    market: '进入市场',
    buyLot: '整批采购完成',
    supplyRequest: '限量收购交货',
    reserveRequest: '需求已预留',
    buyCart: '购置手推车',
    installFacility: '设施安装完成',
    removeFacility: '设施已封存',
    sellFacility: '设施出售完成',
    coldPriority: '保鲜顺序已更新',
    host: '熟客家宴',
    eat: '用餐完成',
    feed: '喂养完成',
    sleep: '睡眠结束',
    closeDay: '收工安排结束',
    waitUntil: '目标等待结束',
    wait: '等待结束',
    autoFeed: '自动喂养设置',
    refill: '原料补齐',
    acceptOrder: '订单已接取',
    deliverOrder: '订单已交付',
    abandonOrder: '订单已放弃',
    declineOrder: '暂不接取订单',
    meetCustomer: '拜访客户',
    visitCustomer: '人物回访',
    leave: '离开市场',
    short: '短工完成',
    heavy: '重活完成',
    rest: '休息完成',
    snack: '加餐完成',
    treat: '治疗完成',
    learn: '学习完成',
    produce: '生产开工',
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
    tradeMilestones: Object.keys(after.marketOffers.milestones).filter(
      (id) => before.marketOffers.milestones[id] === undefined,
    ),
    milestones: Object.keys(after.commerce.milestones).filter(
      (id) => !before.commerce.milestones[id],
    ),
    customers: CUSTOMER_IDS.map((id) => ({
      id,
      change: after.commerce.relations[id] - before.commerce.relations[id],
    })).filter((c) => c.change !== 0),
    startedAt: before.clock.minute,
    finishedAt: after.clock.minute,
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
        (buff) => statusActive(before, buff) !== statusActive(after, buff),
      )
      .map((buff) => ({ buff, active: statusActive(after, buff) })),
    jobs: after.jobs
      .filter((job) => {
        const old = before.jobs.find((j) => j.id === job.id);
        return (
          !old ||
          old.status !== job.status ||
          (job.status === 'queued' &&
            productionReadyAt(before, old) !== productionReadyAt(after, job))
        );
      })
      .map((job) => ({
        id: job.id,
        recipeId: job.recipeId,
        readyAt: productionReadyAt(after, job),
        status: job.status,
      })),
    sale: revenue || cost ? { revenue, cost, profit: revenue - cost } : null,
    workRemaining: null,
    details: error
      ? [error]
      : after.logs
          .filter((log) => log.id >= before.nextId)
          .map((log) => `${log.text}${log.items ? ` ${log.items}` : ''}`),
  };
}

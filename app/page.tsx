'use client';
import Image from 'next/image';
import { productionCompletionLabel } from '@/lib/game/production-time';
import {
  publicOpportunities,
  lotDescription,
} from '../lib/game/market-opportunities.ts';
import {
  CUSTOMERS as HOME_CUSTOMERS,
  CUSTOMER_IDS as HOME_CUSTOMER_IDS,
} from '../lib/game/commerce.ts';
import {
  HOME_STORIES,
  FACILITIES,
  usedHomeSlots,
  type FacilityKind,
} from '../lib/game/home.ts';
import { transportQuote, type Transport } from '../lib/game/time.ts';
import {
  relativeMoment,
  fatigueLabel,
  formatDuration,
  citySchedule,
  formatClock,
  dayPeriod,
  nextDailyTime,
  lifeCycle,
} from '../lib/game/time.ts';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { InfoHint, actionText } from '@/components/game-hint';
import { SceneArt, EquipmentArt, HomeEstate } from '@/components/game-art';
import { GoodIcon, GameIcon, StatusIcon } from '@/components/game-icons';
import {
  useWorkspaceValue,
  setWorkspacePreference,
} from '@/hooks/use-workspace-value';
import { ResourceDelta, celebration } from '@/components/game-feedback';
import { actionKey, isOperatingAction } from '@/lib/game/feedback';
import { orderTerms, returnTerms } from '@/lib/game/commerce';
import { Orders, Growth } from '@/components/game-commerce';
import { todayTasks, type TodayTask } from '@/lib/game/today';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PersistentAssets, RecordFeed } from '@/components/game-shell';
import {
  newGame,
  dispatch,
  quantity,
  quote,
  capacity,
  occupied,
  reserved,
  achievements,
  readSave,
  staminaMax,
  active,
  inventoryCost,
  productionPlan,
  actionPreview,
  henCapacity,
  maximumTrade,
  maximumProduction,
  recipeQuote,
  availableSurplus,
} from '@/lib/game/engine';
import {
  GOODS,
  GOOD_IDS,
  HOUSING,
  HOUSING_IDS,
  RECIPES,
  EQUIPMENT,
  EQUIPMENT_IDS,
  SKILLS,
  SKILL_IDS,
  SKILL_LEVELS,
  LESSON_COST,
  XP_TO_LEVEL,
  BUFFS,
} from '@/lib/game/config';
import { registerGameTools, type ModelContext } from '@/lib/game/webmcp';
import type {
  Action,
  GameState,
  Good,
  Bed,
  Meal,
  OperationResult,
  EquipmentKind,
  Buff,
} from '@/lib/game/types';

const SAVE = 'bianliang-save-v4';
const money = (n: number) => `${n.toLocaleString('zh-CN')}文`;
const num = (n: number) => Math.round(n * 10) / 10;
type Act = (a: Action) => void;
const FeedbackContext = createContext<OperationResult | undefined>(undefined);
type Props = { s: GameState; act: Act };
const tabs = {
  street: '街巷',
  market: '市场',
  assets: '资产',
  production: '生产',
  housing: '住宅',
  people: '人物',
  intel: '情报',
  ledger: '账本',
  orders: '订单',
};
type Tab = keyof typeof tabs;
const NavigationContext = createContext<(tab: Tab, good?: Good) => void>(
  () => {},
);
function Btn({
  children,
  onClick,
  disabled = false,
  subtle = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <Button
      className={`btn ${subtle ? 'subtle' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
function TextPages({ text }: { text: string; size?: number }) {
  return (
    <div className="text-pages">
      <p>{text}</p>
    </div>
  );
}
function Do({
  s,
  act,
  action,
  children,
}: Props & { action: Action; children: React.ReactNode }) {
  const p = actionPreview(s, action);
  const latest = useContext(FeedbackContext);
  const matched = latest?.actionKey === actionKey(action);
  return (
    <fieldset className="action action-card" aria-label={actionText(children)}>
      <div className="action-heading">
        <Btn disabled={!!p.error} onClick={() => act(action)}>
          {action.type === 'rest' ? '休息1小时' : children}
        </Btn>
        <InfoHint label={`操作详情：${actionText(children)}`}>
          <span>
            耗时{formatDuration(p.minutes)} ·{' '}
            {relativeMoment(p.finishAt, s.clock.minute)}完成 · 消耗
            {Math.ceil(p.energy)}体力
          </span>
          {p.cashChange !== undefined && (
            <span>
              现金变化：
              {p.cashChange === null
                ? '不确定（存在失窃风险）'
                : money(p.cashChange)}
            </span>
          )}
          {p.error && <span>{p.error}</span>}
          {p.warning && <span>{p.warning}</span>}
        </InfoHint>
      </div>
      {p.minutes > 0 && (
        <small>
          {formatDuration(p.minutes)} · 完成于
          {relativeMoment(p.finishAt, s.clock.minute)}
          {p.energy > 0 && <> · {Math.ceil(p.energy)}体力</>}
        </small>
      )}
      {p.minutes === 0 && p.energy > 0 && (
        <small>{Math.ceil(p.energy)}体力</small>
      )}
      {['sleep', 'closeDay', 'rest', 'eat', 'snack', 'treat'].includes(
        action.type,
      ) &&
        !p.error && (
          <small>
            体力{(p.staminaChange ?? 0) >= 0 ? '+' : ''}
            {num(p.staminaChange ?? 0)} → 预计体力
            {num(s.stamina + (p.staminaChange ?? 0))} · 健康变化
            {num(p.healthChange ?? 0)} · 现金变化
            {p.cashChange === null
              ? '不确定（存在失窃风险）'
              : money(p.cashChange)}
          </small>
        )}
      {p.segments.length > 0 && (
        <small className="plan-segments">
          {p.segments
            .map(
              (segment) =>
                `${{ meal: '用餐', idle: '闲处', sleep: '睡眠' }[segment.kind]}${formatDuration(segment.finishAt - segment.startsAt)}`,
            )
            .join(' → ')}
        </small>
      )}
      {p.earlierTarget && (
        <Btn
          subtle
          onClick={() => act({ type: 'waitUntil', target: p.earlierTarget! })}
        >
          先等到可交货时刻
        </Btn>
      )}
      {action.type === 'rest' && p.error && (
        <Btn
          subtle
          onClick={() =>
            act({ type: 'waitUntil', target: { kind: 'morning' } })
          }
        >
          等到08:00
        </Btn>
      )}
      {p.error && <small className="reason">{p.error}</small>}
      {p.error && p.nextOpeningAt !== null && (
        <small>
          下次可办理：{relativeMoment(p.nextOpeningAt, s.clock.minute)}
          {['market', 'nightMarket', 'tea', 'customer', 'business'].includes(
            p.venue,
          ) && (
            <button
              className="text-button"
              onClick={() =>
                act({
                  type: 'waitUntil',
                  target: {
                    kind: 'opening',
                    venue: p.venue as
                      | 'market'
                      | 'nightMarket'
                      | 'tea'
                      | 'customer'
                      | 'business',
                  },
                })
              }
            >
              等到开门
            </button>
          )}
        </small>
      )}
      {!p.error && p.warning && <small className="reason">{p.warning}</small>}
      {matched && (
        <small className={latest.success ? 'inline-success' : 'reason'}>
          {latest.success ? `✓ ${latest.title}` : latest.error}
        </small>
      )}
    </fieldset>
  );
}
function Frame({
  title,
  note,
  children,
  scene,
  className = '',
}: {
  title: string;
  note: string;
  scene?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`panel ${className} ${scene ? 'illustrated-panel' : ''}`}
    >
      <div className="panel-head">
        {scene && (
          <Image
            unoptimized
            width={1440}
            height={960}
            className="panel-landscape"
            src={`/art/scenes/${scene}-v1.webp`}
            alt=""
          />
        )}
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
      {children}
    </section>
  );
}
function MarketOpportunitiesView({ s, act }: Props) {
  const [transport, setTransport] = useState<Transport>('self');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const offers = publicOpportunities(s);
  return (
    <>
      <label>
        搬运方式
        <select
          aria-label="机会搬运方式"
          value={transport}
          onChange={(e) => setTransport(e.target.value as Transport)}
        >
          <option value="self">自己搬</option>
          <option value="cart" disabled={!s.home.cart}>
            手推车
          </option>
          <option value="porter">雇脚夫</option>
        </select>
      </label>
      <div className="split">
        <div className="list-column">
          <h2>限量收购</h2>
          {offers.requests.map((r) => (
            <div className="detail" key={r.id}>
              <strong>
                {HOME_CUSTOMERS[r.customer].name} · 收{GOODS[r.good].name}
              </strong>
              <p>
                每{GOODS[r.good].unit}
                {r.price}文 · 还收{r.remaining} · 第
                {Math.floor(r.deadline / 1440) + 1}日{formatClock(r.deadline)}
                截止{r.reservedUntil ? ' · 已预留' : ''}
              </p>
              <input
                aria-label={`${r.id}交货数量`}
                type="number"
                min="1"
                max={r.remaining}
                value={counts[r.id] ?? '1'}
                onChange={(e) =>
                  setCounts({ ...counts, [r.id]: e.target.value })
                }
              />
              <Do
                s={s}
                act={act}
                action={{
                  type: 'supplyRequest',
                  requestId: r.id,
                  quantity: Number(counts[r.id] ?? '1'),
                  transport,
                }}
              >
                交付现货
              </Do>
              <Do
                s={s}
                act={act}
                action={{ type: 'reserveRequest', requestId: r.id }}
              >
                预留至次日中午 · 关系6
              </Do>
            </div>
          ))}
          {offers.forecasts.map((f) => (
            <p key={f.customer}>
              {HOME_CUSTOMERS[f.customer].name}提前告知：第
              {Math.floor(f.opensAt / 1440) + 1}日08—20时将收
              {GOODS[f.good].name}，报价待公布。
            </p>
          ))}
        </div>
        <aside className="detail">
          <h2>整批货盘</h2>
          {offers.lots.map((lot) => (
            <div key={lot.id}>
              <strong>
                {lot.large
                  ? '熟客大宗'
                  : lot.opensAt % 1440 === 1080
                    ? '夜市尾货'
                    : '行商货盘'}
              </strong>
              <p>
                {lotDescription(lot)} · 总价{lot.price}文
              </p>
              <p>
                {formatClock(lot.closesAt)}收摊；易腐品剩余保鲜
                {lot.shelfMinutes / 60}小时。
              </p>
              <Do
                s={s}
                act={act}
                action={{ type: 'buyLot', lotId: lot.id, transport }}
              >
                整批买下
              </Do>
            </div>
          ))}
          {!offers.lots.length && (
            <p>当前没有可购货盘，普通货盘08:00、夜市18:00开放。</p>
          )}
          <Do
            s={s}
            act={act}
            action={{
              type: 'waitUntil',
              target: {
                kind: 'opening',
                venue: s.clock.minute % 1440 < 1080 ? 'nightMarket' : 'market',
              },
            }}
          >
            等待下一场货市
          </Do>
          <h2>商人生涯</h2>
          {offers.milestones.map((m) => (
            <details key={m.id}>
              <summary>
                {m.title} · 第{Math.floor(m.at / 1440) + 1}日
              </summary>
              <p>纪念物：{m.reward.name}</p>
              <p>{m.reward.story}</p>
            </details>
          ))}
        </aside>
      </div>
    </>
  );
}
function PriceChart({ s, good }: { s: GameState; good: Good }) {
  const values = s.history.flatMap((h) => [
    h.prices[good].buy,
    h.prices[good].sell,
  ]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const points = (side: 'buy' | 'sell') =>
    s.history
      .map(
        (h, i) =>
          `${10 + (i * 280) / Math.max(1, s.history.length - 1)},${90 - ((h.prices[good][side] - low) * 70) / Math.max(1, high - low)}`,
      )
      .join(' ');
  return (
    <figure>
      <svg
        viewBox="0 0 300 105"
        aria-label={`${GOODS[good].name}最近14日买卖价格`}
        style={{ width: '100%', maxHeight: 140 }}
      >
        <polyline
          points={points('buy')}
          fill="none"
          stroke="#ae572d"
          strokeWidth="2"
        />
        <polyline
          points={points('sell')}
          fill="none"
          stroke="#39736a"
          strokeWidth="2"
        />
      </svg>
      <figcaption>
        买价（棕） / 卖价（绿） · {low}—{high}文
        <InfoHint label={`${GOODS[good].name}逐日价格`}>
          {s.history.map((h) => (
            <span key={h.day}>
              第{h.day}日：买{h.prices[good].buy} / 卖{h.prices[good].sell}文
            </span>
          ))}
        </InfoHint>
      </figcaption>
    </figure>
  );
}
function Market({ s, act }: Props) {
  const [scope, setScope] = useWorkspaceValue<string>('market.scope', '全部');
  const [favoriteText, setFavoriteText] = useWorkspaceValue<string>(
    'market.favorites',
    '',
  );
  const favorites = favoriteText
    .split(',')
    .filter((g) => GOOD_IDS.includes(g as Good));
  const [transport, setTransport] = useState<Transport>('self');
  const [category, setCategory] = useWorkspaceValue<string>(
    'market.category',
    '全部',
  );
  const [good, setGood] = useWorkspaceValue<Good>('market.good', 'grain');
  const [count, setCount] = useWorkspaceValue<string>('market.count', '1');
  const list = GOOD_IDS.filter(
    (g) =>
      (category === '全部' || GOODS[g].category === category) &&
      (scope === '全部' ||
        (scope === '持仓' ? quantity(s, g) > 0 : favorites.includes(g))),
  );
  const selected = list.includes(good) ? good : (list[0] ?? good);
  const g = GOODS[selected];
  const q = Number(count);
  const p = quote(s, selected);
  const owned = quantity(s, selected);
  const cost = inventoryCost(s, selected);
  const earliest = s.batches
    .filter((b) => b.good === selected && b.remainingMinutes != null)
    .sort((a, b) => a.remainingMinutes! - b.remainingMinutes!)[0];
  const saleCost = q > 0 && q <= owned ? inventoryCost(s, selected, q) : 0;
  const freight =
    q > 0 ? transportQuote(q * (selected === 'hen' ? 2 : 1), transport).fee : 0;
  const selectGood = (v: Good) => {
    setGood(v);
    setCount('1');
  };
  const marketScene =
    s.clock.minute % 1440 >= 1080 || s.clock.minute % 1440 < 360
      ? 'night-market'
      : 'morning-market';
  return (
    <Frame
      className="market-panel"
      scene={marketScene}
      title="州桥市"
      note="看行情免费，选一件货，再决定买卖。"
    >
      <div className="toolbar">
        <label>
          商品分类{' '}
          <select
            aria-label="商品分类"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
            }}
          >
            {['全部', ...new Set(GOOD_IDS.map((g) => GOODS[g].category))].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <label>
          筛选
          <select
            aria-label="商品筛选"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {['全部', '持仓', '关注'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <span>累计搬运 {num(s.daily.tradeUnits)} 单位</span>
      </div>
      <div className="market-workbench flat-scroll">
        <div className="split">
          <div className="list-column">
            <div className="list-label">
              <span>货物 / 持有</span>
              <span>买 / 卖 · 较昨日</span>
            </div>
            <div className="item-list">
              {list.length === 0 && <p>没有匹配商品，可切换筛选查看。</p>}
              {list.map((id) => {
                const price = quote(s, id);
                const prev = s.history.at(-2)?.prices[id].buy;
                const change = prev
                  ? Math.round((price.buy / prev - 1) * 100)
                  : 0;
                return (
                  <button
                    key={id}
                    className={`list-item ${selected === id ? 'selected' : ''}`}
                    onClick={() => selectGood(id)}
                  >
                    <span>
                      <strong className="icon-label">
                        <GoodIcon good={id} />
                        {GOODS[id].name}
                      </strong>
                      <small>
                        持有 {num(quantity(s, id))} {GOODS[id].unit}
                      </small>
                    </span>
                    <span>
                      {price.buy} / {price.sell}文
                      <small className={change > 0 ? 'rise' : 'fall'}>
                        {change > 0 ? '+' : ''}
                        {change}%
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="detail market-detail" hidden={list.length === 0}>
            <div className="detail-head">
              <GoodIcon good={selected} large />
              <div className="product-heading">
                <h2>{g.name}</h2>
                <dl className="facts trade-facts">
                  <div>
                    <dt>买 / 卖</dt>
                    <dd>
                      {p.buy} / {p.sell}文
                    </dd>
                  </div>

                  <div>
                    <dt>持有 / 均价</dt>
                    <dd>
                      {num(owned)}
                      {g.unit} / {owned ? money(num(cost / owned)) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>保质与临期</dt>
                    <dd>
                      {earliest
                        ? `剩余${Math.max(0, earliest.remainingMinutes! / 60).toFixed(1)}小时 · 该批成本${earliest.cost}文`
                        : g.life
                          ? `正常保存${g.life}日`
                          : '无固定到期日'}
                    </dd>
                  </div>
                </dl>
              </div>
              <button
                className="btn subtle favorite-icon"
                aria-label={
                  favorites.includes(selected) ? '取消关注' : '关注商品'
                }
                aria-pressed={favorites.includes(selected)}
                title={favorites.includes(selected) ? '取消关注' : '关注商品'}
                onClick={() =>
                  setFavoriteText(
                    favorites.includes(selected)
                      ? favorites.filter((id) => id !== selected).join(',')
                      : [...favorites, selected].join(','),
                  )
                }
              >
                <span aria-hidden="true">
                  {favorites.includes(selected) ? '★' : '☆'}
                </span>
              </button>
            </div>
            <div className="trade-content">
              <div className="trade-metrics">
                <span>
                  可售 {num(availableSurplus(s, selected))}
                  {g.unit}
                </span>
                <span>持仓浮盈 {money(Math.floor(owned * p.sell) - cost)}</span>
                {q > 0 && q <= owned && (
                  <>
                    <span>出库成本 {money(saleCost)}</span>
                    <span>
                      保本 {Math.ceil((saleCost + freight) / q)}文/{g.unit}
                    </span>
                    <strong>
                      净利 {money(Math.floor(q * p.sell) - saleCost - freight)}
                    </strong>
                  </>
                )}
                <InfoHint label="成本与利润说明">
                  持仓浮盈按当前卖价估值，尚未实现；出库成本按本次数量计算，保本价和净利含搬运费，不含生活与住房费用。
                </InfoHint>
              </div>
              <div className="trade-inputs">
                <label>
                  搬运方式
                  <select
                    aria-label="搬运方式"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as Transport)}
                  >
                    <option value="self">自己搬</option>
                    <option value="cart" disabled={!s.home.cart}>
                      手推车{s.home.cart ? '' : '（尚未购买）'}
                    </option>
                    <option value="porter">雇脚夫 · 08—18时</option>
                  </select>
                </label>
                <label className="quantity">
                  交易数量
                  <input
                    aria-label={`${g.name}数量`}
                    type="number"
                    min={selected === 'grain' ? '.1' : '1'}
                    step={selected === 'grain' ? '.1' : '1'}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </label>
              </div>
              <div className="quick-quantity" aria-label="交易快捷数量">
                {[1, 5, 10].map((n) => (
                  <Btn key={n} subtle onClick={() => setCount(String(n))}>
                    {n}
                  </Btn>
                ))}
                <Btn
                  subtle
                  onClick={() =>
                    setCount(
                      String(maximumTrade(s, selected, 'buy', transport)),
                    )
                  }
                >
                  最大买入
                </Btn>
                <Btn
                  subtle
                  onClick={() =>
                    setCount(
                      String(maximumTrade(s, selected, 'sell', transport)),
                    )
                  }
                >
                  最大卖出
                </Btn>
                <Btn
                  subtle
                  onClick={() =>
                    setCount(
                      String(
                        Math.min(
                          availableSurplus(s, selected),
                          maximumTrade(s, selected, 'sell', transport),
                        ),
                      ),
                    )
                  }
                >
                  保留口粮饲料
                </Btn>
              </div>
              <div className="trade-totals">
                <span>
                  买入 {money(Number.isFinite(q) ? Math.ceil(p.buy * q) : 0)}
                </span>
                <span>
                  卖出 {money(Number.isFinite(q) ? Math.floor(p.sell * q) : 0)}
                </span>
                <span>
                  运费 {money(Number.isFinite(q) && q > 0 ? freight : 0)}
                </span>
              </div>
              <div className="actions">
                <Do
                  s={s}
                  act={act}
                  action={{
                    type: 'trade',
                    transport,
                    good: selected,
                    quantity: q,
                    side: 'buy',
                  }}
                >
                  买入
                </Do>
                <Do
                  s={s}
                  act={act}
                  action={{
                    type: 'trade',
                    transport,
                    good: selected,
                    quantity: q,
                    side: 'sell',
                  }}
                >
                  卖出
                </Do>
              </div>
            </div>
            <section className="price-history" aria-label="价格记录">
              <h3>价格记录</h3>
              <PriceChart s={s} good={selected} />
            </section>
            <section className="market-intel" aria-label="相关已知消息与需求">
              <h3>相关已知消息与需求</h3>
              {s.intel
                .filter((i) => i.good === selected)
                .slice(-3)
                .map((i) => (
                  <p key={i.id}>{i.title ?? i.text}</p>
                ))}
              {publicOpportunities(s)
                .requests.filter((r) => r.good === selected)
                .map((r) => (
                  <p key={r.id}>
                    {HOME_CUSTOMERS[r.customer].name}收{r.remaining}
                    {g.unit}，每{g.unit}
                    {r.price}文。
                  </p>
                ))}
              {!s.intel.some((i) => i.good === selected) &&
                !publicOpportunities(s).requests.some(
                  (r) => r.good === selected,
                ) && <small>暂无相关消息或收购需求。</small>}
            </section>
            {q > 0 &&
              (actionPreview(s, {
                type: 'trade',
                good: selected,
                side: 'buy',
                quantity: q,
                transport,
              }).error ||
                actionPreview(s, {
                  type: 'trade',
                  good: selected,
                  side: 'sell',
                  quantity: q,
                  transport,
                }).error) && (
                <details className="transport-alternatives">
                  <summary>查看可行数量与搬运方案</summary>
                  {(['self', 'cart', 'porter'] as const)
                    .filter((mode) => mode !== 'cart' || s.home.cart)
                    .map((mode) => {
                      const action: Action = {
                        type: 'trade',
                        good: selected,
                        side: 'buy',
                        quantity: q,
                        transport: mode,
                      };
                      const preview = actionPreview(s, action);
                      const fee = transportQuote(
                        q * (selected === 'hen' ? 2 : 1),
                        mode,
                      ).fee;
                      return (
                        <div key={mode}>
                          <p>
                            {
                              {
                                self: '自己搬',
                                cart: '手推车',
                                porter: '雇脚夫',
                              }[mode]
                            }{' '}
                            · {relativeMoment(preview.finishAt, s.clock.minute)}
                            完成 · 运费{fee}文 · 最多买
                            {maximumTrade(s, selected, 'buy', mode)} / 卖
                            {maximumTrade(s, selected, 'sell', mode)}
                          </p>
                          <Btn subtle onClick={() => setTransport(mode)}>
                            选用
                            {
                              {
                                self: '自己搬',
                                cart: '手推车',
                                porter: '雇脚夫',
                              }[mode]
                            }
                          </Btn>
                        </div>
                      );
                    })}
                </details>
              )}
          </aside>
        </div>
        <section className="market-opportunities">
          <h2>货盘、夜市与收购</h2>
          <MarketOpportunitiesView s={s} act={act} />
        </section>
      </div>
    </Frame>
  );
}
function Production({ s, act }: Props) {
  const navigate = useContext(NavigationContext);
  const [selected, setSelected] = useWorkspaceValue<string>(
    'production.selected',
    'flour',
  );
  const [count, setCount] = useWorkspaceValue<string>('production.count', '1');
  const queue = s.jobs.filter((j) => j.status === 'queued');
  const items = [
    ...RECIPES.map((r) => ({
      id: r.id,
      group: '配方',
      name: r.name,
      detail: SKILLS[r.industry].name,
    })),
    ...EQUIPMENT_IDS.map((id) => ({
      id,
      group: '设备',
      name: EQUIPMENT[id].name,
      detail: s.equipment.some((e) => e.kind === id && e.installed)
        ? '已安装'
        : s.equipment.some((e) => e.kind === id)
          ? '已封存'
          : '未购置',
    })),
    ...queue.map((j) => ({
      id: String(j.id),
      group: '队列',
      name: RECIPES.find((r) => r.id === j.recipeId)!.name,
      detail: productionCompletionLabel(s, j),
    })),
  ];
  const chosen = items.find((x) => x.id === selected) ?? items[0];
  const id = chosen?.id;
  const mode = chosen?.group;
  const r = RECIPES.find((r) => r.id === id);
  const eq = s.equipment.find((e) => e.kind === id);
  const kind = EQUIPMENT_IDS.find((k) => k === id);
  const job = queue.find((j) => String(j.id) === id);
  const plan = r ? productionPlan(s, r, Number(count)) : null;
  let costing: ReturnType<typeof recipeQuote> | null = null;
  try {
    if (r) costing = recipeQuote(s, r.id, Number(count));
  } catch {
    /* Quantity validation is shown next to actions. */
  }
  return (
    <Frame
      className="production-panel"
      title="作坊"
      note="设备、配方和在制品集中管理。"
    >
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {['配方', '设备', '队列'].map((group) => (
              <section className="inventory-group" key={group}>
                <h3>
                  {group}
                  {group === '队列' ? ` (${queue.length})` : ''}
                </h3>
                <div className="art-item-grid">
                  {items
                    .filter((x) => x.group === group)
                    .map((x) => (
                      <button
                        key={x.id}
                        className={`list-item ${x.id === id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelected(x.id);
                          setCount('1');
                        }}
                      >
                        <strong className="icon-label">
                          {x.group === '设备' ? (
                            <EquipmentArt
                              kind={x.id as EquipmentKind}
                              compact
                            />
                          ) : (
                            <GoodIcon
                              good={
                                RECIPES.find((r) => r.id === x.id)?.output ??
                                RECIPES.find(
                                  (r) =>
                                    r.id ===
                                    queue.find((j) => String(j.id) === x.id)
                                      ?.recipeId,
                                )?.output ??
                                'flour'
                              }
                            />
                          )}{' '}
                          {x.name}
                        </strong>
                        <small>{x.detail}</small>
                      </button>
                    ))}
                </div>
                {group === '队列' && !queue.length && <small>暂无在制品</small>}
              </section>
            ))}
          </div>
        </div>
        <aside className="detail production-detail">
          {(kind ||
            r?.equipment ||
            (job &&
              RECIPES.find((recipe) => recipe.id === job.recipeId)
                ?.equipment)) && (
            <EquipmentArt
              s={s}
              kind={
                (kind ||
                  r?.equipment ||
                  RECIPES.find((recipe) => recipe.id === job?.recipeId)!
                    .equipment) as EquipmentKind
              }
            />
          )}
          {mode === '配方' && r && plan && (
            <>
              <div className="detail-head">
                <h2 className="icon-label">
                  <GoodIcon good={r.output} />
                  {r.name}
                </h2>
              </div>
              <section className="production-costs">
                <p>毛利不含生活、住房、学费等费用。</p>
                {costing && (
                  <dl className="facts">
                    <div>
                      <dt>库存实际成本毛利</dt>
                      <dd>
                        {costing.stockProfit === null
                          ? '库存不足，无法完整计算'
                          : money(costing.stockProfit)}
                      </dd>
                    </div>
                    <div>
                      <dt>补齐缺料后毛利</dt>
                      <dd>{money(costing.refillProfit)}</dd>
                    </div>
                    <div>
                      <dt>全部现价购料毛利</dt>
                      <dd>{money(costing.replacementProfit)}</dd>
                    </div>
                    <div>
                      <dt>开工体力 / 设备</dt>
                      <dd>
                        {costing.energy} / {EQUIPMENT[r.equipment].name}
                      </dd>
                    </div>
                  </dl>
                )}
                <p>
                  {r.duration
                    ? '按今日售价估算，完工时售价可能变化。'
                    : '按当前售价估算，实际出售时结算。'}
                </p>
                <p>
                  {r.duration
                    ? '占用设备' + r.duration * 24 + '小时'
                    : '当日完成，设备可继续使用'}
                  ；保质期{r.shelfLife ? r.shelfLife + '日' : '无限制'}。
                </p>
              </section>
              <section className="production-preparation">
                <small>
                  {EQUIPMENT[r.equipment].name} · {SKILL_LEVELS[r.minSkill]} ·{' '}
                  {r.duration ? r.duration * 24 + '小时' : '当日完成'} · 保质
                  {r.shelfLife ? r.shelfLife + '日' : '无限制'}
                </small>
                <label className="quantity">
                  加工批量
                  <input
                    aria-label={r.name + '批量'}
                    type="number"
                    min="1"
                    max="20"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </label>
                <div className="quick-quantity">
                  <Btn subtle onClick={() => setCount('1')}>
                    1批
                  </Btn>
                  <Btn subtle onClick={() => setCount('5')}>
                    5批
                  </Btn>
                  <Btn
                    subtle
                    onClick={() => setCount(String(maximumProduction(s, r.id)))}
                  >
                    当前最多可做
                  </Btn>
                </div>
                {costing && (
                  <>
                    <table className="material-table">
                      <thead>
                        <tr>
                          <th>原料</th>
                          <th>已有</th>
                          <th>需要</th>
                          <th>缺少</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costing.materials.map((m) => (
                          <tr key={m.good}>
                            <td>
                              <GoodIcon good={m.good} />
                              {GOODS[m.good].name}
                            </td>
                            <td>{num(m.owned)}</td>
                            <td>{num(m.needed)}</td>
                            <td>{num(m.missing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <small>
                      补料{money(costing.refillCost)} · 搬运{costing.carrying}
                      体力 · 余款{money(s.cash - costing.refillCost)}
                    </small>
                    <p className="estimate">
                      产出{GOODS[r.output].name}
                      {num(plan.outputUnits / 10)} · 预计毛利
                      {money(costing.refillProfit)}
                      {r.duration ? '（按今日售价）' : ''}
                    </p>
                  </>
                )}
                <div className="actions production-actions">
                  {costing?.materials.some((m) => m.missing > 0) && (
                    <Do
                      s={s}
                      act={act}
                      action={{
                        type: 'refill',
                        recipeId: r.id,
                        quantity: Number(count),
                      }}
                    >
                      补齐原料
                    </Do>
                  )}
                  <Do
                    s={s}
                    act={act}
                    action={{
                      type: 'produce',
                      recipeId: r.id,
                      quantity: Number(count),
                    }}
                  >
                    开工
                  </Do>
                  <Btn subtle onClick={() => navigate('market', r.output)}>
                    出售成品
                  </Btn>
                </div>
              </section>
            </>
          )}
          {mode === '设备' && kind && (
            <>
              <h2 className="icon-label">
                <GameIcon kind={kind} large />
                {EQUIPMENT[kind].name}
              </h2>
              <p>{EQUIPMENT[kind].detail}</p>
              <p>
                占用1个设备位 · 购置{money(EQUIPMENT[kind].cost)} · 出售
                {money(Math.floor(EQUIPMENT[kind].cost * 0.6))}
              </p>
              {eq?.jobId && (
                <p className="reason">正在加工，请到队列查看或放弃在制品。</p>
              )}
              <div className="actions">
                {eq?.installed ? (
                  <Do
                    s={s}
                    act={act}
                    action={{ type: 'uninstall', equipmentId: eq.id }}
                  >
                    拆卸封存
                  </Do>
                ) : (
                  <Do
                    s={s}
                    act={act}
                    action={{ type: 'install', equipment: kind }}
                  >
                    {eq ? '重新安装' : '购置安装'}
                  </Do>
                )}
                {eq && (
                  <Do
                    s={s}
                    act={act}
                    action={{ type: 'sellEquipment', equipmentId: eq.id }}
                  >
                    出售设备
                  </Do>
                )}
              </div>
            </>
          )}
          {mode === '队列' && job && (
            <>
              <h2>{RECIPES.find((r) => r.id === job.recipeId)!.name}</h2>
              <p>
                第{job.startDay}日开工，{job.quantity}批。
                {productionCompletionLabel(s, job)}，停用期间顺延。
              </p>
              <p>
                已投入{money(job.inputCost)}，预留{job.outputUnits / 10}份仓储。
              </p>
              <Do
                s={s}
                act={act}
                action={{ type: 'cancelProduction', jobId: job.id }}
              >
                放弃这批生产
              </Do>
              <Do
                s={s}
                act={act}
                action={{
                  type: 'waitUntil',
                  target: { kind: 'production', jobId: job.id },
                }}
              >
                等这批货完工
              </Do>
              <small>原料不返还，设备随即空闲。</small>
            </>
          )}
        </aside>
      </div>
    </Frame>
  );
}
function Housing({ s, act }: Props) {
  const [id, setId] = useWorkspaceValue('housing.id', s.housing.id);
  const h = HOUSING[id];
  return (
    <Frame
      className="housing-panel"
      title="安居与经营"
      note={`当前${HOUSING[s.housing.id].name} · 功能位${usedHomeSlots(s)}/${HOUSING[s.housing.id].slots} · 养鸡${s.hens.length}/${henCapacity(s)}`}
    >
      <div className="flat-scroll housing-workbench">
        <div className="housing-body art-home-layout">
          <HomeEstate s={s} />
          <div className="home-controls">
            <LifeControls s={s} act={act} />
            {s.life.wakeSummary && (
              <details className="wake-summary" key={s.life.wakeSummary.at}>
                <summary>
                  睡醒摘要 · 第{Math.floor(s.life.wakeSummary.at / 1440) + 1}日
                  {formatClock(s.life.wakeSummary.at)}
                </summary>
                {s.life.wakeSummary.lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </details>
            )}
          </div>
        </div>
        <div className="housing-body facilities-section">
          <section>
            <h2>
              住宅设施 · 已用{usedHomeSlots(s)}/{HOUSING[s.housing.id].slots}
              功能位
            </h2>
            {!s.home.cart && (
              <Do s={s} act={act} action={{ type: 'buyCart' }}>
                购买手推车 · 300文
              </Do>
            )}
            {(Object.keys(FACILITIES) as FacilityKind[]).map((kind) => {
              const spec = FACILITIES[kind];
              const owned = s.home.facilities.find((f) => f.kind === kind);
              return (
                <div key={kind}>
                  <strong>{spec.name}</strong>
                  <p>{spec.detail}</p>
                  <div className="actions">
                    <Do
                      s={s}
                      act={act}
                      action={{
                        type: owned?.installed
                          ? 'removeFacility'
                          : 'installFacility',
                        facility: kind,
                      }}
                    >
                      {owned?.installed
                        ? '封存'
                        : owned
                          ? '重新安装'
                          : `购置并安装 ${spec.cost}文`}
                    </Do>
                    {owned && (
                      <Do
                        s={s}
                        act={act}
                        action={{ type: 'sellFacility', facility: kind }}
                      >
                        出售 · {Math.floor(spec.cost * 0.6)}文
                      </Do>
                    )}
                  </div>
                </div>
              );
            })}
            <p>
              凉储间优先保护：
              {s.home.coldPriority.map((g) => GOODS[g].name).join('、')}
              ；同品类临期优先。
            </p>
            <details>
              <summary>邀请熟客与居家故事</summary>
              {HOME_CUSTOMER_IDS.filter(
                (id) => s.commerce.customers[id]?.met,
              ).map((id) => (
                <div key={id}>
                  <Do s={s} act={act} action={{ type: 'host', customer: id }}>
                    邀请{HOME_CUSTOMERS[id].name} · 20文
                  </Do>
                  {HOME_STORIES[id]
                    .slice(0, s.home.visits[id]?.count ?? 0)
                    .map((story) => (
                      <p key={story}>{story}</p>
                    ))}
                </div>
              ))}
            </details>
            <select
              aria-label="优先保鲜商品"
              value={s.home.coldPriority[0] ?? 'bread'}
              onChange={(e) =>
                act({
                  type: 'coldPriority',
                  goods: [
                    e.target.value as Good,
                    ...s.home.coldPriority.filter((g) => g !== e.target.value),
                  ],
                })
              }
            >
              {GOOD_IDS.filter((g) => GOODS[g].life).map((g) => (
                <option key={g} value={g}>
                  {GOODS[g].name}
                </option>
              ))}
            </select>
          </section>
        </div>
        <div className="housing-body property-section">
          <h2>房屋与迁居</h2>
          <div className="split">
            <div className="list-column">
              <div className="item-list">
                {HOUSING_IDS.map((x) => (
                  <button
                    key={x}
                    className={`list-item ${id === x ? 'selected' : ''}`}
                    onClick={() => setId(x)}
                  >
                    <strong className="icon-label">
                      <GameIcon kind={x} />
                      {HOUSING[x].name}
                    </strong>
                    <small>
                      {x === s.housing.id
                        ? '当前住所'
                        : HOUSING[x].kind === 'owned'
                          ? `购买${money(HOUSING[x].cost)}`
                          : HOUSING[x].kind === 'rent'
                            ? `接手${money(HOUSING[x].cost)}`
                            : '免费临时落脚'}
                    </small>
                  </button>
                ))}
              </div>
            </div>
            <aside className="detail">
              <h2 className="icon-label">
                <GameIcon kind={id} large />
                {h.name}
              </h2>
              <p>{h.detail}</p>
              <dl className="facts">
                <div>
                  <dt>仓储 / 设备位</dt>
                  <dd>
                    {h.capacity / 10}份 / {h.slots}台
                  </dd>
                </div>
                <div>
                  <dt>每日费用 / 8小时睡眠恢复</dt>
                  <dd>
                    {money(h.upkeep)} / {h.recovery}体力
                  </dd>
                </div>
                <div>
                  <dt>养鸡上限（需鸡舍）</dt>
                  <dd>{h.henCapacity}只</dd>
                </div>
              </dl>
              <div className="actions">
                {id !== s.housing.id && id !== 'street' && (
                  <Do
                    s={s}
                    act={act}
                    action={{
                      type: h.kind === 'owned' ? 'buyHousing' : 'rentHousing',
                      housing: id,
                    }}
                  >
                    {h.kind === 'owned' ? '买下' : '租下'}
                  </Do>
                )}
                {HOUSING[s.housing.id].kind === 'rent' && (
                  <Do s={s} act={act} action={{ type: 'endLease' }}>
                    退租并封存设备
                  </Do>
                )}
                {HOUSING[s.housing.id].kind === 'owned' && (
                  <Do s={s} act={act} action={{ type: 'sellHousing' }}>
                    出售产权 ·{' '}
                    {money(Math.floor(HOUSING[s.housing.id].cost * 0.72))}
                  </Do>
                )}
                {s.housing.maintenanceSuspended && (
                  <Do s={s} act={act} action={{ type: 'maintain' }}>
                    补缴维护费
                  </Do>
                )}
              </div>
              <small>
                搬家不销毁资产。退租后在制品暂停，超额库存可继续卖出；迁入新住所前需满足容量限制。
              </small>
            </aside>
          </div>
        </div>
      </div>
    </Frame>
  );
}
function People({ s, act }: Props) {
  const [id, setId] = useWorkspaceValue<string>('people.id', '身体');
  const skill = SKILL_IDS.find((k) => k === id);
  return (
    <Frame
      className="people-panel"
      scene="street"
      title="人物与手艺"
      note="劳动和休息消耗时间；每周期有效加餐两次，治疗和学习各一次。"
    >
      <div className="flat-scroll people-workbench">
        <div className="split">
          <div className="list-column">
            <div className="item-list">
              <button
                className={`list-item ${id === '身体' ? 'selected' : ''}`}
                onClick={() => setId('身体')}
              >
                <strong>饮食、休养与劳动</strong>
                <small>
                  健康{num(s.health)} · 体力{num(s.stamina)}
                </small>
              </button>
              {SKILL_IDS.map((k) => (
                <button
                  key={k}
                  className={`list-item ${id === k ? 'selected' : ''}`}
                  onClick={() => setId(k)}
                >
                  <strong className="icon-label">
                    <GameIcon kind={k} />
                    {SKILLS[k].name}
                  </strong>
                  <small>
                    {SKILL_LEVELS[s.skills[k]]} · {s.skillXp[k]}批经验
                  </small>
                </button>
              ))}
            </div>
          </div>
          <aside className="detail">
            {skill ? (
              <>
                <h2 className="icon-label">
                  <GameIcon kind={skill} large />
                  {SKILLS[skill].name}
                </h2>
                <p>
                  {SKILLS[skill].teacher}：{SKILLS[skill].detail}
                </p>
                <p>
                  当前{SKILL_LEVELS[s.skills[skill]]} · 经验{s.skillXp[skill]}批
                </p>
                {s.skills[skill] < 3 && (
                  <p>
                    下一阶需{XP_TO_LEVEL[s.skills[skill] + 1]}
                    批经验（入门无需经验），学费
                    {money(LESSON_COST[s.skills[skill]])}。
                  </p>
                )}
                <Do s={s} act={act} action={{ type: 'learn', skill }}>
                  学习
                  {s.skills[skill] < 3
                    ? ` · ${money(LESSON_COST[s.skills[skill]])}`
                    : ''}
                </Do>
              </>
            ) : (
              <>
                <div className="detail-head">
                  <h2>照料自己</h2>
                </div>
                <div className="care-grid">
                  <Do s={s} act={act} action={{ type: 'rest' }}>
                    休息1小时 · 恢复20体力
                  </Do>
                  <Do
                    s={s}
                    act={act}
                    action={{
                      type: 'eat',
                      meal: quantity(s, 'bread') ? 'bread' : 'diner',
                    }}
                  >
                    用主餐 · 30分钟
                  </Do>
                  <Do s={s} act={act} action={{ type: 'snack' }}>
                    加餐 · 6文 / +15体力
                  </Do>
                  <Do s={s} act={act} action={{ type: 'treat', mode: 'slow' }}>
                    调养 · 30文 / +10健康
                  </Do>
                  <Do s={s} act={act} action={{ type: 'treat', mode: 'fast' }}>
                    快速治疗 · 80文+药材
                  </Do>
                </div>
                <small>
                  快速治疗恢复25健康。两种治疗均解除风寒；劳累时劳动多耗5体力。
                </small>
              </>
            )}
          </aside>
        </div>
        <Growth s={s} />
      </div>
    </Frame>
  );
}
function Intel({ s, act }: Props) {
  const navigate = useContext(NavigationContext);
  const [category, setCategory] = useWorkspaceValue<string>(
    'intel.category',
    '全部',
  );
  const [selected, setSelected] = useWorkspaceValue<string>(
    'intel.selected',
    '',
  );
  const entries = s.intel.filter(
    (i) => category === '全部' || i.category === category,
  );
  const i = entries.find((i) => i.id === selected) ?? entries[0];
  return (
    <Frame
      className="intel-panel"
      scene="teahouse"
      title="茶馆与市井"
      note="问清出处，过几日回访：街巷里的消息未必都能兑现。"
    >
      <div className="toolbar">
        <Do s={s} act={act} action={{ type: 'tea' }}>
          茶馆听消息 · 8文
        </Do>
        <label>
          题材{' '}
          <select
            aria-label="情报分类"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSelected('');
            }}
          >
            {['全部', ...new Set(s.intel.map((i) => i.category))].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {entries.map((e) => (
              <button
                key={e.id}
                className={`list-item ${i?.id === e.id ? 'selected' : ''}`}
                onClick={() => setSelected(e.id)}
              >
                <span>
                  <strong>{e.title ?? `${e.category} · ${e.source}`}</strong>
                  <small>
                    {e.source} · 第{e.heardDay}日 ·{' '}
                    {e.customerId
                      ? '人物供货机会'
                      : e.worldId
                        ? '行情线索'
                        : '市井见闻'}
                  </small>
                </span>
                <small>
                  {!e.visited || e.status === 'new'
                    ? '待验证'
                    : e.status === 'confirmed'
                      ? '已有后续'
                      : e.status === 'wrong'
                        ? '未兑现'
                        : '已过期'}
                </small>
              </button>
            ))}
            {!entries.length && (
              <p>还没有这一类消息。每天可在茶馆听取三条不同题材的内容。</p>
            )}
          </div>
        </div>
        <aside className="detail">
          {i ? (
            <>
              <div className="speaker-heading">
                <span className="speaker-seal" aria-hidden="true">
                  {i.source.slice(0, 1)}
                </span>
                <h2>{i.source}的消息</h2>
              </div>
              {i.customerId && (
                <Btn subtle onClick={() => navigate('orders')}>
                  查看供货订单
                </Btn>
              )}
              <TextPages
                key={i.id}
                text={
                  i.text +
                  ((i.asked || i.visited) && i.followUp
                    ? `\n${i.visited ? '核对结果' : '追问所得'}：${i.followUp}`
                    : '')
                }
                size={160}
              />
              <div className="actions">
                <Do s={s} act={act} action={{ type: 'askIntel', id: i.id }}>
                  追问出处
                </Do>
                <Do s={s} act={act} action={{ type: 'visitIntel', id: i.id }}>
                  回访核对
                </Do>
              </div>
            </>
          ) : (
            <p>选一条消息查看全文及后续。</p>
          )}
        </aside>
      </div>
    </Frame>
  );
}
function Assets({ s }: Props) {
  const [selected, setSelected] = useWorkspaceValue<string>(
    'assets.selected',
    '',
  );
  const goods = GOOD_IDS.filter((g) => quantity(s, g) > 0);
  const categories = ['货物', '在制品', '设备', '设施', '房产'];
  const rows = categories.flatMap((category) =>
    (category === '货物'
      ? goods.map((g) => ({
          id: g,
          name: GOODS[g].name,
          summary: `${num(quantity(s, g))}${GOODS[g].unit}`,
          value: Math.floor(quantity(s, g) * quote(s, g).sell),
        }))
      : category === '在制品'
        ? s.jobs
            .filter((j) => j.status === 'queued')
            .map((j) => ({
              id: String(j.id),
              name: RECIPES.find((r) => r.id === j.recipeId)!.name,
              summary: `${j.quantity}批 · ${productionCompletionLabel(s, j)}`,
              value: j.inputCost,
            }))
        : category === '设备'
          ? s.equipment.map((e) => ({
              id: String(e.id),
              name: EQUIPMENT[e.kind].name,
              summary: e.jobId ? '生产中' : e.installed ? '已安装' : '封存中',
              value: Math.floor(EQUIPMENT[e.kind].cost * 0.6),
            }))
          : category === '设施'
            ? [
                ...s.home.facilities.map((f) => ({
                  id: f.kind,
                  name: FACILITIES[f.kind].name,
                  summary: f.installed ? '已安装' : '封存中',
                  value: Math.floor(FACILITIES[f.kind].cost * 0.6),
                })),
                ...(s.home.cart
                  ? [
                      {
                        id: 'cart',
                        name: '手推车',
                        summary: '搬运工具 · 当前不可出售',
                        value: 0,
                      },
                    ]
                  : []),
              ]
            : HOUSING[s.housing.id].kind === 'owned'
              ? [
                  {
                    id: s.housing.id,
                    name: HOUSING[s.housing.id].name,
                    summary: '自有产权',
                    value: Math.floor(HOUSING[s.housing.id].cost * 0.72),
                  },
                ]
              : []
    ).map((row) => ({ ...row, category, key: `${category}:${row.id}` })),
  );
  const chosen = rows.find((r) => r.key === selected) ?? rows[0];
  const category = chosen?.category ?? '货物';
  const good = category === '货物' && chosen ? (chosen.id as Good) : null;
  const eq =
    category === '设备'
      ? s.equipment.find((e) => String(e.id) === chosen?.id)
      : null;
  const job =
    category === '在制品'
      ? s.jobs.find((j) => String(j.id) === chosen?.id)
      : null;
  const goodsValue = goods.reduce(
    (v, g) => v + Math.floor(quantity(s, g) * quote(s, g).sell),
    0,
  );
  const equipmentValue = s.equipment.reduce(
    (v, e) => v + Math.floor(EQUIPMENT[e.kind].cost * 0.6),
    s.home.facilities.reduce(
      (n, f) => n + Math.floor(FACILITIES[f.kind].cost * 0.6),
      0,
    ),
  );
  const propertyValue =
    HOUSING[s.housing.id].kind === 'owned'
      ? Math.floor(HOUSING[s.housing.id].cost * 0.72)
      : 0;
  return (
    <Frame
      title="我的资产"
      note={`现金 ${money(s.cash)} · 冻结保证金 ${money(s.commerce.orders.filter((o) => o.status === 'accepted').reduce((n, o) => n + o.deposit, 0))} · 货物估值 ${money(goodsValue)} · 设备/设施/房产回收价 ${money(equipmentValue + propertyValue)}`}
    >
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {categories.map((group) => (
              <section className="inventory-group" key={group}>
                <h3>{group}</h3>
                {rows
                  .filter((r) => r.category === group)
                  .map((r) => (
                    <button
                      key={r.key}
                      className={`list-item ${chosen?.key === r.key ? 'selected' : ''}`}
                      onClick={() => setSelected(r.key)}
                    >
                      <span>
                        <strong className="icon-label">
                          {r.category === '货物' && (
                            <GoodIcon good={r.id as Good} />
                          )}
                          {r.category === '设备' && (
                            <GameIcon
                              kind={
                                s.equipment.find((e) => String(e.id) === r.id)!
                                  .kind
                              }
                            />
                          )}
                          {r.category === '房产' && (
                            <GameIcon kind={s.housing.id} />
                          )}{' '}
                          {r.name}
                        </strong>
                        <small>{r.summary}</small>
                      </span>
                      <span>{money(r.value)}</span>
                    </button>
                  ))}
                {!rows.some((r) => r.category === group) && (
                  <small>暂无{group}</small>
                )}
              </section>
            ))}
          </div>
        </div>
        <aside className="detail">
          <h2>{chosen?.name ?? '资产说明'}</h2>
          {good && (
            <>
              <dl className="facts">
                <div>
                  <dt>持有数量 / 成本总额</dt>
                  <dd>
                    {num(quantity(s, good))}
                    {GOODS[good].unit} / {money(inventoryCost(s, good))}
                  </dd>
                </div>
                <div>
                  <dt>参考卖价 / 预计盈亏</dt>
                  <dd>
                    {money(quote(s, good).sell)} /{' '}
                    {money(chosen!.value - inventoryCost(s, good))}
                  </dd>
                </div>
              </dl>
              <TextPages
                key={good}
                size={140}
                text={
                  good === 'hen'
                    ? s.hens
                        .map(
                          (h, i) =>
                            `第${i + 1}只：成本${h.cost}文，连续${h.hunger}夜未喂。`,
                        )
                        .join('\n')
                    : s.batches
                        .filter((b) => b.good === good)
                        .map(
                          (b) =>
                            `${num(b.units / 10)}${GOODS[good].unit}，成本${money(b.cost)}，${b.origin === 'buy' ? '购入' : b.origin === 'production' ? '自产' : '获赠'}；${b.remainingMinutes == null ? '无固定保鲜期限' : `剩余保鲜${num(b.remainingMinutes / 60)}小时${b.remainingMinutes <= 1440 ? '（临期）' : ''}，凉储保护期间流逝减半`}。`,
                        )
                        .join('\n')
                }
              />
            </>
          )}
          {eq && (
            <p>
              {eq.installed
                ? '已安装，占用1个设备位。'
                : '已封存，可在生产页重装。'}
              {eq.jobId ? '在制品需先完成或放弃，才能出售设备。' : ''}购置价
              {money(EQUIPMENT[eq.kind].cost)}，固定回收价{money(chosen!.value)}
              。
            </p>
          )}
          {job && (
            <p>
              投入成本{money(job.inputCost)}，成品预留{job.outputUnits / 10}
              份仓储。第{job.startDay}日开工；
              {s.equipment.find((e) => e.id === job.equipmentId)?.installed
                ? '正常加工'
                : '设备封存，生产暂停'}
              。在制品尚不能出售。
            </p>
          )}
          {category === '房产' && chosen && (
            <p>
              产权参考回收价{money(chosen.value)}
              。出售条件和维护情况请到住宅页查看。
            </p>
          )}
          <small>
            货物按当前市场卖价估值；在制品单独列投入成本，不计入可变现合计。设备和产权实际出售仍须满足操作条件。
          </small>
          <p>
            参考可变现合计：
            <strong>
              {money(s.cash + goodsValue + equipmentValue + propertyValue)}
            </strong>
          </p>
        </aside>
      </div>
    </Frame>
  );
}
function StatusEffects({ s }: { s: GameState }) {
  const effects = (
    ['cold', 'tired', 'outsider', 'regular', 'warm'] as Buff[]
  ).filter((k) => active(s, k));
  return (
    <div className="status-effects">
      <span>当前状态</span>
      <TooltipProvider>
        <div className="status-tags">
          {effects.map((k) => (
            <Tooltip key={k}>
              <TooltipTrigger
                className="status-tag"
                aria-describedby={`status-help-${k}`}
              >
                {BUFFS[k].name}
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="status-explanation"
                role="tooltip"
                id={`status-help-${k}`}
              >
                {BUFFS[k].detail}；第{Math.floor(s.buffs[k]! / 1440) + 1}日
                {formatClock(s.buffs[k]!)}到期
              </TooltipContent>
            </Tooltip>
          ))}
          {s.housing.maintenanceSuspended && (
            <Tooltip>
              <TooltipTrigger
                className="status-tag"
                aria-describedby="status-help-maintenance"
              >
                维护暂停
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="status-explanation"
                role="tooltip"
                id="status-help-maintenance"
              >
                补缴维护后恢复生产
              </TooltipContent>
            </Tooltip>
          )}
          {!effects.length && !s.housing.maintenanceSuspended && (
            <span>平稳 · 无异常</span>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

function Ledger({ s }: Props) {
  const l = s.ledger;
  const logs = [...s.logs].reverse();
  return (
    <Frame
      title="账本"
      note={`修正分类账从第${l.sinceDay}日起记录；现金流与毛利分开。`}
    >
      <div className="split">
        <div className="ledger-grid">
          {[
            ['贸易毛利', l.tradeRevenue - l.tradeCost],
            ['生产毛利', l.productionRevenue - l.productionCost],
            ['采购支出', l.purchases],
            ['劳动收入', l.workIncome],
            ['学费', l.tuition],
            ['设备 / 回收', `${money(l.equipment)} / ${money(l.returns)}`],
            ['住宅 / 生活', `${money(l.housing)} / ${money(l.living)}`],
            ['交际开支', money(l.social)],
            ['饲料 / 医疗', `${money(l.feed)} / ${money(l.medical)}`],
            ['损耗', l.losses],
            [
              '冻结保证金',
              s.commerce.orders
                .filter((o) => o.status === 'accepted')
                .reduce((n, o) => n + o.deposit, 0),
            ],
            [
              '保证金缴付 / 返还',
              `${money(l.depositsPaid)} / ${money(l.depositsReturned)}`,
            ],
            ['违约损失', l.depositLosses],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{typeof v === 'number' ? money(v) : v}</strong>
            </div>
          ))}
        </div>
        <aside className="detail">
          <h2>近期流水</h2>
          <div className="log-list">
            {logs.map((x) => (
              <div className="log" key={x.id}>
                <small>
                  第{x.day}日 {x.cash ? money(x.cash) : ''}
                </small>
                <TextPages
                  text={x.text + (x.items ? ' ' + x.items : '')}
                  size={65}
                />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Frame>
  );
}
function CitySchedule({ s }: { s: GameState }) {
  return (
    <details className="city-schedule" open>
      <summary>接下来的一天 · 时辰表</summary>
      <p>
        市场／招工／学艺 08:00—18:00 · 熟客 08:00—20:00 · 茶馆 09:00—21:00 ·
        夜市 18:00—24:00 · 食肆
        06:00—24:00。交易手续须在打烊前办妥，搬运可继续；其他活动须在营业内完成，住所随时可回。
      </p>
      {citySchedule(s.clock.minute).map((item) => (
        <p key={item.at}>
          <strong>{relativeMoment(item.at, s.clock.minute)}</strong> ·{' '}
          {item.text}
        </p>
      ))}
    </details>
  );
}

function Street({ s, act }: Props) {
  const navigate = useContext(NavigationContext);
  const [plans, setPlans] = useWorkspaceValue<string>(
    `street.plans.${s.seed}.${s.day}`,
    '',
  );
  const selected = plans.split('|').filter(Boolean);
  const goHome = () => {
    setWorkspacePreference('housing.view', '生活');
    navigate('housing');
  };
  const short = actionPreview(s, { type: 'short' });
  const next = citySchedule(s.clock.minute)[0];
  const waitForNight = s.clock.minute % 1440 < 1080;
  const waitAt = nextDailyTime(s.clock.minute, waitForNight ? 1080 : 480);
  const offers = publicOpportunities(s);
  const deliverable = offers.requests.find(
    (r) =>
      availableSurplus(s, r.good) >= 1 &&
      !actionPreview(s, { type: 'supplyRequest', requestId: r.id, quantity: 1 })
        .error,
  );
  const hungry = s.hens.filter((h) => !s.life.fed.includes(h.id)).length;
  return (
    <Frame
      className="street-panel"
      title="此刻的汴梁"
      note={`第${s.day}日 ${formatClock(s.clock.minute)} · 下一件城中变化：${relativeMoment(next.at, s.clock.minute)}，${next.text}。`}
    >
      <div className="split street-body">
        <div className="list-column">
          <SceneArt scene="street" className="street-scene">
            <span className="scene-kicker">东京 · 市井之间</span>
            <strong>今日从哪里开始？</strong>
            <div className="scene-destinations">
              <button onClick={() => navigate('market')}>
                逛州桥市 <small>行情与买卖</small>
              </button>
              <button onClick={() => navigate('intel')}>
                去茶馆 <small>09:00—21:00</small>
              </button>
              <button onClick={goHome}>
                回住所 <small>饭食与歇息</small>
              </button>
              <button onClick={() => navigate('production')}>
                进作坊 <small>手艺与生产</small>
              </button>
            </div>
          </SceneArt>
          <section className="detail">
            <h2>招工告示</h2>
            <p>
              每天08:00—18:00，须在18:00前收工。短工最迟16:00开工，重活最迟14:00开工。
            </p>
            <div className="care-grid">
              <Do s={s} act={act} action={{ type: 'short' }}>
                短工 · 25文
              </Do>
              <Do s={s} act={act} action={{ type: 'heavy' }}>
                重活 · 40文
              </Do>
            </div>
            <p>体力不足时可回家休息；短暂休息不能替代睡眠。</p>
          </section>
          <section className="detail">
            <h2>眼下可以做什么</h2>
            {s.day === 1 && (
              <p>
                刚安顿下来，不必一直等到晚上。白天可找活计、看收货告示，也可以先备好饭食和鸡粮。逛页面不耗时间，办事才会推进时辰。
              </p>
            )}
            <p>
              {short.error
                ? '招工暂不可做，原因见招工告示。'
                : `做一趟短工可得25文，${relativeMoment(short.finishAt, s.clock.minute)}收工。`}
            </p>
            {deliverable ? (
              <>
                <p>
                  有人正在收你手里的{GOODS[deliverable.good].name}
                  ，可先交一份现货。收益需结合进货成本判断。
                </p>
                <Do
                  s={s}
                  act={act}
                  action={{
                    type: 'supplyRequest',
                    requestId: deliverable.id,
                    quantity: 1,
                  }}
                >
                  交付1{GOODS[deliverable.good].unit}
                  {GOODS[deliverable.good].name}
                </Do>
              </>
            ) : (
              <>
                <p>
                  看看今日收货价和进货成本，再决定要不要做一趟生意；目前没有可直接交付的闲置现货。
                </p>
                <Btn
                  onClick={() => {
                    setWorkspacePreference('market.opportunities', true);
                    navigate('market');
                  }}
                >
                  查看收货与货盘
                </Btn>
              </>
            )}
            <p>
              {s.hens.length
                ? `家中${s.hens.length}只母鸡，${hungry}只还没喂。${relativeMoment(nextDailyTime(s.clock.minute, 360), s.clock.minute)}才会检查产蛋，先备好粟米。`
                : '先安排饭食与住处，留好生活开支。'}
              {s.life.ateCycle === lifeCycle(s.clock.minute)
                ? '已经吃过主餐。'
                : `记得在${relativeMoment(nextDailyTime(s.clock.minute, 360), s.clock.minute)}前吃主餐。`}
            </p>
            <Btn onClick={goHome}>回家安排饭食与鸡群</Btn>
          </section>
          <section className="detail">
            <h2>今日打算</h2>
            <p>
              最多记三件事，办妥后取消勾选。只作备忘，不会自动办事；新的一日另起一页。
            </p>
            {[
              '做一趟短工',
              '看收货告示',
              '备好饭食与鸡粮',
              '逛夜市',
              '早些睡觉',
            ].map((name) => (
              <label className="plan-item" key={name}>
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  disabled={!selected.includes(name) && selected.length >= 3}
                  onChange={(e) =>
                    setPlans(
                      (e.target.checked
                        ? [...selected, name]
                        : selected.filter((v) => v !== name)
                      ).join('|'),
                    )
                  }
                />
                {name}
              </label>
            ))}
          </section>
        </div>
        <aside className="detail">
          <CitySchedule s={s} />
          <h2>有想等的时辰</h2>
          <p>等候会推进保鲜、房费和疲劳；有临近交期时，先处理手头的事。</p>
          <Do
            s={s}
            act={act}
            action={{
              type: 'waitUntil',
              target: {
                kind: 'opening',
                venue: waitForNight ? 'nightMarket' : 'market',
              },
            }}
          >
            等到
            {relativeMoment(waitAt, s.clock.minute)}
            {waitForNight ? '夜市开张' : '早市开门'}
          </Do>
          <Btn onClick={goHome}>回住所歇息</Btn>
        </aside>
      </div>
    </Frame>
  );
}

type LifePreferences = {
  meal: Exclude<Meal, 'none'>;
  bed: Bed;
  eatFirst: boolean;
};
const LifeContext = createContext<{
  preferences: LifePreferences;
  update: (key: keyof LifePreferences, value: string | boolean) => void;
}>({
  preferences: { meal: 'diner', bed: 'inn', eatFirst: true },
  update: () => {},
});
function LifePreferencesProvider({
  s,
  children,
}: {
  s: GameState | null;
  children: React.ReactNode;
}) {
  const key = `life.${s?.seed ?? 0}`;
  const [meal, setMeal] = useWorkspaceValue<Exclude<Meal, 'none'>>(
    `${key}.meal`,
    'diner',
  );
  const [bed, setBed] = useWorkspaceValue<Bed>(
    `${key}.bed`,
    s && s.housing.id !== 'street' ? s.housing.id : 'inn',
  );
  const [eatFirst, setEatFirst] = useWorkspaceValue<boolean>(
    `${key}.eatFirst`,
    true,
  );
  return (
    <LifeContext.Provider
      value={{
        preferences: { meal, bed, eatFirst },
        update: (name, value) => {
          if (name === 'meal') setMeal(value as Exclude<Meal, 'none'>);
          if (name === 'bed') setBed(value as Bed);
          if (name === 'eatFirst') setEatFirst(value as boolean);
        },
      }}
    >
      {children}
    </LifeContext.Provider>
  );
}
function CloseDayButton({
  s,
  act,
  compact = false,
}: Props & { compact?: boolean }) {
  const { preferences } = useContext(LifeContext);
  const action: Action = {
    type: 'closeDay',
    bed: preferences.bed,
    ...(preferences.eatFirst ? { meal: preferences.meal } : {}),
  };
  if (compact)
    return (
      <div className="compact-close">
        <Btn
          disabled={!!actionPreview(s, action).error}
          onClick={() => act(action)}
        >
          按当前安排收工
        </Btn>
      </div>
    );
  return (
    <Do s={s} act={act} action={action}>
      今日收工 ·{' '}
      {relativeMoment(nextDailyTime(s.clock.minute, 480), s.clock.minute)}起身
    </Do>
  );
}
function LifeControls({ s, act }: Props) {
  const {
    preferences: { meal, bed, eatFirst },
    update,
  } = useContext(LifeContext);
  const [hours, setHours] = useState('8');
  const hungry = s.hens.filter((h) => !s.life.fed.includes(h.id)).length;
  const validBed = ['inn', 'temple', 'street', s.housing.id].includes(bed);
  return (
    <div className="detail life-detail">
      <h2>生活与睡眠</h2>
      <p>
        {fatigueLabel(s.clock.fatigueMinutes)} · 睡眠债
        {s.clock.sleepDebt.toFixed(1)}小时 ·{' '}
        {s.life.ateCycle === lifeCycle(s.clock.minute)
          ? '已用主餐'
          : `请在${relativeMoment(nextDailyTime(s.clock.minute, 360), s.clock.minute)}前吃主餐`}
      </p>
      <div className="life-primary">
        <section className="life-section">
          <h3>饭食与短休</h3>
          <select
            aria-label="主餐"
            value={meal}
            onChange={(e) => update('meal', e.target.value)}
          >
            <option value="diner">食肆18文</option>
            <option value="bread">炊饼一个</option>
            <option value="egg">鸡蛋两枚</option>
            <option value="saltedEgg">咸蛋一个</option>
            <option value="grain">粟米一份</option>
          </select>
          <Do s={s} act={act} action={{ type: 'eat', meal }}>
            用主餐 · 30分钟
          </Do>
          <Do s={s} act={act} action={{ type: 'rest' }}>
            休息1小时
          </Do>
        </section>
        <section className="life-section">
          <h3>今日收工</h3>
          <select
            aria-label="住宿"
            value={validBed ? bed : ''}
            onChange={(e) => update('bed', e.target.value)}
          >
            {!validBed && (
              <option value="" disabled>
                原住所已失效，请重新选择
              </option>
            )}
            <option value="inn">客栈30文</option>
            <option value="temple">庙廊（有失窃风险）</option>
            <option value="street">街头（有失窃与健康风险）</option>
            {s.housing.id !== 'street' && (
              <option value={s.housing.id}>{HOUSING[s.housing.id].name}</option>
            )}
          </select>
          <label className="auto-feed-setting">
            <input
              type="checkbox"
              checked={eatFirst}
              onChange={(e) => update('eatFirst', e.target.checked)}
            />
            先吃所选主餐（已经吃过则省略）
          </label>
          <CloseDayButton s={s} act={act} />
          <Do
            s={s}
            act={act}
            action={{ type: 'waitUntil', target: { kind: 'morning' } }}
          >
            等到08:00
          </Do>
        </section>
      </div>
      <details className="life-secondary">
        <summary>午休、自选睡眠与等待</summary>
        <div className="actions">
          <input
            aria-label="睡眠小时"
            type="number"
            min="1"
            max="10"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <Do
            s={s}
            act={act}
            action={{ type: 'sleep', minutes: Number(hours) * 60, bed }}
          >
            入睡 · 醒于
            {relativeMoment(
              s.clock.minute + Number(hours) * 60,
              s.clock.minute,
            )}
          </Do>
          <Do s={s} act={act} action={{ type: 'wait', minutes: 30 }}>
            等待30分钟
          </Do>
          <Do
            s={s}
            act={act}
            action={{
              type: 'waitUntil',
              target: { kind: 'opening', venue: 'nightMarket' },
            }}
          >
            等到夜市开张
          </Do>
        </div>
      </details>
      {s.hens.length > 0 && (
        <details className="life-secondary">
          <summary>
            鸡群 · {s.hens.length}只母鸡 · 待喂{hungry}只
          </summary>
          <p>
            下一次产蛋检查：
            {relativeMoment(nextDailyTime(s.clock.minute, 360), s.clock.minute)}
            。
          </p>
          {hungry > 0 && (
            <Do s={s} act={act} action={{ type: 'feed', count: hungry }}>
              喂养未喂的{hungry}只母鸡
            </Do>
          )}
          <label className="auto-feed-setting">
            <input
              type="checkbox"
              checked={s.life.autoFeed}
              onChange={(e) =>
                act({ type: 'autoFeed', enabled: e.target.checked })
              }
            />
            每天清晨05:30，用存粮自动喂鸡
          </label>
          <p>
            下次自动喂鸡：
            {relativeMoment(nextDailyTime(s.clock.minute, 330), s.clock.minute)}
            。只使用现有粟米，不足时不自动购买。
          </p>
        </details>
      )}
    </div>
  );
}
function Encounter({ s, act }: Props) {
  const e = s.event!;
  return (
    <Frame title={e.title} note="先读经过和线索，再选择如何回应。">
      <div className="split">
        <div className="detail">
          <TextPages
            text={
              e.text +
              '\n线索：' +
              e.clue +
              (e.inspected ? '\n查问：' + e.inspection : '')
            }
            size={170}
          />
          <Do s={s} act={act} action={{ type: 'inspect' }}>
            向附近人查问 · 5文
          </Do>
        </div>
        <aside className="detail">
          <h2>你的回应</h2>
          <div className="encounter-choices">
            {e.choices.map((c) => (
              <section key={c.id}>
                <TextPages text={c.hint} size={100} />
                <p>现金消耗 {money(c.cost.cash ?? 0)}</p>
                <Do
                  s={s}
                  act={act}
                  action={{ type: 'choice', id: c.id, eventId: e.id }}
                >
                  {c.label}
                </Do>
              </section>
            ))}
          </div>
        </aside>
      </div>
    </Frame>
  );
}
export default function Home() {
  const [s, setS] = useState<GameState | null>(null);
  const ref = useRef<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rawExists, setRawExists] = useState(false);
  const [oldKeys, setOldKeys] = useState<string[]>([]);
  const [, setError] = useState('');
  const [, setFeedback] = useState('');
  const [result, setResult] = useState<OperationResult>();
  const [todayOpen, setTodayOpen] = useState(false);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [dismissedCelebration, setDismissedCelebration] = useState(-1);
  const [storageError, setStorageError] = useState('');
  const [tab, setTab] = useState<Tab>('market');
  const [restart, setRestart] = useState<3000 | 30000 | null>(null);
  const [pending, setPending] = useState<{
    action: Action;
    revision: number;
    message: string;
  } | null>(null);
  const save = (next: GameState) => {
    ref.current = next;
    setS(next);
    setRawExists(true);
    try {
      const previous = localStorage.getItem(SAVE);
      const backupKey = `${SAVE}-before-ux-revision-2`;
      if (
        previous &&
        JSON.parse(previous).saveRevision !== 3 &&
        !localStorage.getItem(backupKey)
      ) {
        localStorage.setItem(backupKey, previous);
        setOldKeys((keys) => [...new Set([...keys, backupKey])]);
      }
      localStorage.setItem(SAVE, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('本次操作已完成，但保存失败。请导出当前进度再关闭页面。');
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(SAVE);
        setRawExists(!!raw);
        setOldKeys(
          Object.keys(localStorage).filter(
            (k) => /bianliang.*save|save.*bianliang/.test(k) && k !== SAVE,
          ),
        );
        if (raw) setSaved(readSave(raw));
        setReduceMotion(
          localStorage.getItem('bianliang-reduce-motion') === 'true',
        );
      } catch (e) {
        setStorageError((e as Error).message);
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(
    () =>
      registerGameTools(
        (document as Document & { modelContext?: ModelContext }).modelContext,
        () => ref.current,
        (a, r) => {
          if (!ref.current) return { error: '请先开始游戏' };
          const result = dispatch(ref.current, a, r);
          if (result.error || isOperatingAction(a)) setResult(result.result);
          if (result.error) {
            setError(result.error);
            setFeedback(`操作未执行：${result.error}`);
            return { error: result.error, result: result.result };
          }
          setError('');
          setFeedback(result.state.lastResponse ?? result.state.story);
          save(result.state);
          return {};
        },
      ),
    [],
  );
  const execute = (a: Action, revision = ref.current?.revision) => {
    if (!ref.current) return;
    const r = dispatch(ref.current, a, revision);
    if (r.error || isOperatingAction(a)) setResult(r.result);
    if (r.error) {
      setError(r.error);
      setFeedback(`操作未执行：${r.error}`);
    } else {
      setError('');
      setFeedback(r.state.lastResponse ?? r.state.story);
      save(r.state);
    }
    setPending(null);
  };
  const act: Act = (a) => {
    if (!ref.current) return;
    const p = actionPreview(ref.current, a);
    const destructive = [
      'cancelProduction',
      'endLease',
      'sellHousing',
      'sellEquipment',
      'abandonOrder',
    ].includes(a.type);
    if (!p.error && (p.confirmation || destructive))
      setPending({
        action:
          a.type === 'acceptOrder'
            ? {
                ...a,
                confirm: orderTerms(
                  ref.current.commerce.orders.find((o) => o.id === a.orderId)!,
                ),
              }
            : a.type === 'return'
              ? { ...a, confirm: returnTerms(ref.current) }
              : a,
        revision: ref.current.revision,
        message:
          p.warning ||
          '此操作会出售资产或暂停经营；放弃生产不退原料，退租不退租金。',
      });
    else execute(a);
  };
  const start = (target: 3000 | 30000) => {
    save(newGame(crypto.getRandomValues(new Uint32Array(1))[0], target));
    setRestart(null);
    setError('');
    setStorageError('');
    setSaved(null);
    setTab('market');
    setFeedback('新旅程已开始，带着800文走进汴梁。');
    setResult(undefined);
  };
  const requestStart = (target: 3000 | 30000) => {
    if (rawExists || s) setRestart(target);
    else start(target);
  };
  const download = (key = SAVE) => {
    const raw =
      key === SAVE && ref.current
        ? JSON.stringify(ref.current)
        : localStorage.getItem(key);
    if (!raw) {
      setError('没有可导出的存档');
      return;
    }
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${key}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const currentResult = result ?? s?.operationHistory.at(-1);
  const highlight = s ? celebration(result, s) : '';
  const tasks = s ? todayTasks(s) : [];
  const navigate = (target: Tab, good?: Good) => {
    if (good) {
      setWorkspacePreference('market.opportunities', false);
      setWorkspacePreference('market.category', GOODS[good].category);
      setWorkspacePreference('market.good', good);
      setWorkspacePreference('market.history', false);
    }
    setTab(target);
    setNavigationRevision((v) => v + 1);
  };
  const openTask = (task: TodayTask) => {
    if (!s || s.event || s.phase === 'ended') return;
    if (task.preference) setWorkspacePreference(...task.preference);
    if (task.target === 'housing')
      setWorkspacePreference(
        'housing.view',
        task.id === 'maintenance' ? '房屋' : '生活',
      );
    if (task.id.startsWith('order:'))
      setWorkspacePreference('orders.mode', '进行中');
    if (task.id.startsWith('customer:'))
      setWorkspacePreference('orders.mode', '熟客');
    if (task.target === 'intel')
      setWorkspacePreference('intel.category', '全部');
    navigate(task.target, task.good);
    setTodayOpen(false);
  };
  return (
    <FeedbackContext.Provider value={currentResult}>
      <LifePreferencesProvider key={s?.seed ?? 0} s={s}>
        <NavigationContext.Provider value={navigate}>
          <main
            data-period={s ? dayPeriod(s.clock.minute) : 'day'}
            className={`game ${s ? 'playing' : 'welcome'} ${reduceMotion ? 'reduce-motion' : ''}`}
          >
            <header className="masthead">
              <div className="brand">
                <span className="seal">宋</span>汴梁归途{' '}
                <small>长期经营手记</small>
              </div>
              <div className="toolbar">
                <label className="motion-setting">
                  <input
                    type="checkbox"
                    checked={reduceMotion}
                    onChange={(e) => {
                      setReduceMotion(e.target.checked);
                      try {
                        localStorage.setItem(
                          'bianliang-reduce-motion',
                          String(e.target.checked),
                        );
                      } catch {
                        /* Preferences do not affect game saves. */
                      }
                    }}
                  />
                  减少动态
                </label>
                {(rawExists || s) && (
                  <Btn subtle onClick={() => download()}>
                    导出存档
                  </Btn>
                )}
                {oldKeys.map((k) => (
                  <Btn key={k} subtle onClick={() => download(k)}>
                    {k.includes('before-') ? '导出修复前备份' : '导出旧版存档'}
                  </Btn>
                ))}
                {s && (
                  <Btn subtle onClick={() => requestStart(s.target)}>
                    重新开始
                  </Btn>
                )}
              </div>
            </header>
            {!s ? (
              <section className="opening">
                <Image
                  unoptimized
                  width={1440}
                  height={960}
                  priority
                  className="opening-art"
                  src="/art/scenes/bianhe-hero-v1.webp"
                  alt="汴河舟船与沿岸市井"
                />
                <p>崇宁二年 · 东京城外</p>
                <h1>
                  城门开了。
                  <br />
                  你的归途，还很远。
                </h1>
                <p>
                  八百文起步，经营没有期限。看行情，学手艺，安置一间自己的作坊。
                </p>
                <div className="watch">只认现金 · 三千文归航 / 三万文长途</div>
                {storageError && <p className="reason">{storageError}</p>}
                <div className="actions">
                  {saved && (
                    <Btn
                      onClick={() => {
                        ref.current = saved;
                        setS(saved);
                      }}
                    >
                      继续第{saved.day}日 · {money(saved.cash)}
                    </Btn>
                  )}
                  <Btn disabled={!loaded} onClick={() => requestStart(3000)}>
                    走进汴梁 · 3000文
                  </Btn>
                  <Btn
                    disabled={!loaded}
                    subtle
                    onClick={() => requestStart(30000)}
                  >
                    挑战三万文
                  </Btn>
                </div>
                <small>新局会在确认后替换当前进度；旧版存档单独保留。</small>
              </section>
            ) : (
              <>
                <div className="city-clock-note">
                  <span title="清醒累积疲劳，睡眠每分钟消除2分钟负荷；超过16小时才累积睡眠债，超过18小时劳动更费力，超过24小时损害健康。">
                    {fatigueLabel(s.clock.fatigueMinutes)}
                  </span>
                  <span>
                    {relativeMoment(
                      citySchedule(s.clock.minute).filter((item) =>
                        /开门|开张|受理|打烊/.test(item.text),
                      )[0].at,
                      s.clock.minute,
                    )}{' '}
                    ·{' '}
                    {
                      citySchedule(s.clock.minute).filter((item) =>
                        /开门|开张|受理|打烊/.test(item.text),
                      )[0].text
                    }
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setTodayOpen(true)}
                  >
                    时辰表与今日要事
                  </button>
                  <button
                    className="text-button"
                    disabled={!!s.event || s.phase === 'ended'}
                    onClick={() => navigate('street')}
                  >
                    此刻能做什么 · 招工告示
                  </button>
                </div>
                <section className="status">
                  <div>
                    <span>
                      <StatusIcon kind="date" /> 第{s.day}日 · {s.weather}
                    </span>
                    <strong>
                      {s.phase === 'ended'
                        ? '旅程结束'
                        : `${formatClock(s.clock.minute)} · ${{ dawn: '清晨', day: '日间', dusk: '傍晚', evening: '夜间', late: '深夜' }[dayPeriod(s.clock.minute)]}`}
                    </strong>
                  </div>
                  <div>
                    <span>
                      <StatusIcon kind="cash" /> 现金 / 目标
                    </span>
                    <strong>
                      {money(s.cash)} / {money(s.target)}
                      <ResourceDelta
                        value={result?.cash ?? 0}
                        revision={result?.id ?? 0}
                      />
                    </strong>
                    <progress max={s.target} value={s.cash} />
                  </div>
                  <div>
                    <div className="vital">
                      <span>
                        <StatusIcon kind="health" />
                        健康 <b>{num(s.health)}/100</b>
                        <ResourceDelta
                          value={result?.health ?? 0}
                          revision={result?.id ?? 0}
                        />
                      </span>
                      <progress aria-label="健康" max={100} value={s.health} />
                    </div>
                    <div className="vital">
                      <span>
                        <StatusIcon kind="stamina" /> 体力{' '}
                        <b>
                          {num(s.stamina)}/{num(staminaMax(s))}
                        </b>
                        <ResourceDelta
                          value={result?.stamina ?? 0}
                          revision={result?.id ?? 0}
                        />
                      </span>
                      <progress
                        aria-label="体力"
                        max={staminaMax(s)}
                        value={s.stamina}
                      />
                    </div>
                  </div>
                  <div>
                    <span>
                      <StatusIcon kind="storage" /> {HOUSING[s.housing.id].name}{' '}
                      · 仓储
                    </span>
                    <strong>
                      {num(occupied(s) / 10)} / {capacity(s) / 10}
                      <small>
                        在制预留{num((reserved(s) - occupied(s)) / 10)}
                      </small>
                    </strong>
                    <progress
                      aria-label="仓储（含在制预留）"
                      max={capacity(s)}
                      value={reserved(s)}
                    />
                  </div>
                  <StatusEffects s={s} />
                  <Btn
                    subtle
                    onClick={() => {
                      setTodayOpen(true);
                    }}
                  >
                    今日要事 ({tasks.length})
                  </Btn>
                </section>
                <div className="game-layout">
                  <PersistentAssets s={s} onAssets={() => navigate('assets')} />
                  <div className="work-column">
                    <nav className="workspaces" aria-label="经营工作区">
                      {Object.entries(tabs).map(([id, label]) => (
                        <button
                          key={id}
                          disabled={!!s.event || s.phase === 'ended'}
                          aria-current={tab === id ? 'page' : undefined}
                          className={tab === id ? 'active' : ''}
                          onClick={() => {
                            setTab(id as Tab);
                            setError('');
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </nav>
                    <div className="workspace" key={navigationRevision}>
                      {s.phase === 'ended' ? (
                        <Frame
                          title={
                            s.ending === 'return' ? '归去来兮' : '旅程终章'
                          }
                          note={`经营${s.stats.days}日 · ${s.deathCause || '归航的光亮起了。'}`}
                        >
                          <div className="split">
                            <div className="detail">
                              <h2>这一程的收获</h2>
                              <p>
                                生产{s.stats.productionRuns}批 · 产蛋
                                {s.stats.eggs}枚 · 交易{s.stats.trades}次
                              </p>
                              <p>最高流动资产{money(s.stats.peakAssets)}</p>
                              <TextPages
                                text={
                                  achievements(s)
                                    .filter(([, ok]) => ok)
                                    .map(([name]) => name)
                                    .join(' · ') || '每一步都记在手记里。'
                                }
                              />
                            </div>
                            <aside className="detail">
                              <TextPages text={s.story} />
                              <Btn onClick={() => requestStart(s.target)}>
                                再走一程
                              </Btn>
                            </aside>
                          </div>
                        </Frame>
                      ) : s.event ? (
                        <Encounter key={s.event.id} s={s} act={act} />
                      ) : tab === 'market' ? (
                        <Market s={s} act={act} />
                      ) : tab === 'street' ? (
                        <Street key={`${s.seed}:${s.day}`} s={s} act={act} />
                      ) : tab === 'assets' ? (
                        <Assets s={s} act={act} />
                      ) : tab === 'production' ? (
                        <Production s={s} act={act} />
                      ) : tab === 'housing' ? (
                        <Housing s={s} act={act} />
                      ) : tab === 'people' ? (
                        <People s={s} act={act} />
                      ) : tab === 'intel' ? (
                        <Intel s={s} act={act} />
                      ) : tab === 'orders' ? (
                        <Orders
                          s={s}
                          act={act}
                          onMarket={(good) => navigate('market', good)}
                        />
                      ) : (
                        <Ledger s={s} act={act} />
                      )}
                    </div>
                    <footer className="bottom-bar">
                      <div className="actions">
                        {!s.event &&
                          s.phase !== 'ended' &&
                          s.cash >= s.target && (
                            <Do s={s} act={act} action={{ type: 'return' }}>
                              支付{money(s.target)}归航
                            </Do>
                          )}
                        {!s.event && s.phase === 'day' && (
                          <>
                            {tab === 'housing' ? (
                              <CloseDayButton s={s} act={act} compact />
                            ) : (
                              <Btn
                                onClick={() => {
                                  setWorkspacePreference(
                                    'housing.view',
                                    '生活',
                                  );
                                  navigate('housing');
                                }}
                              >
                                回住所安排生活
                              </Btn>
                            )}
                            <details className="footer-wait">
                              <summary>等待安排</summary>
                              <Do
                                s={s}
                                act={act}
                                action={{ type: 'wait', minutes: 30 }}
                              >
                                等待30分钟
                              </Do>
                              <Do
                                s={s}
                                act={act}
                                action={{
                                  type: 'waitUntil',
                                  target: {
                                    kind: 'opening',
                                    venue:
                                      s.clock.minute % 1440 < 1080
                                        ? 'nightMarket'
                                        : 'market',
                                  },
                                }}
                              >
                                等到下一场货市
                              </Do>
                            </details>
                          </>
                        )}
                      </div>
                    </footer>
                  </div>
                  <RecordFeed s={s} current={currentResult} />
                </div>
              </>
            )}
            <Dialog
              open={restart !== null}
              onOpenChange={(open) => {
                if (!open) setRestart(null);
              }}
            >
              <DialogContent className="confirm" showCloseButton={false}>
                <DialogTitle>重新走进汴梁？</DialogTitle>
                <DialogDescription>
                  新目标：{restart === 30000 ? '三万文' : '三千文'}
                  。开始新局会覆盖当前存档，请先导出需要保留的进度。
                </DialogDescription>
                <div className="actions">
                  <Btn subtle onClick={() => setRestart(null)}>
                    保留当前旅程
                  </Btn>
                  <Btn onClick={() => restart && start(restart)}>开始新局</Btn>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={pending !== null}
              onOpenChange={(open) => {
                if (!open) setPending(null);
              }}
            >
              <DialogContent className="confirm" showCloseButton={false}>
                <DialogTitle>确认这次安排</DialogTitle>
                <DialogDescription>{pending?.message}</DialogDescription>
                <div className="actions">
                  <Btn subtle onClick={() => setPending(null)}>
                    返回调整
                  </Btn>
                  <Btn
                    onClick={() =>
                      pending && execute(pending.action, pending.revision)
                    }
                  >
                    确认执行
                  </Btn>
                </div>
              </DialogContent>
            </Dialog>
            {storageError && s && (
              <div className="save-alert" role="alert">
                {storageError}
                <button className="text-button" onClick={() => download()}>
                  导出当前进度
                </button>
              </div>
            )}
            {highlight && currentResult?.id !== dismissedCelebration && (
              <output className="celebration">
                {highlight}
                <button
                  className="text-button"
                  onClick={() =>
                    setDismissedCelebration(currentResult?.id ?? -1)
                  }
                >
                  收下这份喜悦
                </button>
              </output>
            )}
            <Dialog open={todayOpen} onOpenChange={setTodayOpen}>
              <DialogContent className="confirm history-dialog">
                <DialogTitle>今日要事与市集日历</DialogTitle>
                <DialogDescription>
                  先处理风险，再安排生意；日历仅公开主题，实际价格会波动。
                </DialogDescription>
                {s && <CitySchedule s={s} />}
                {tasks.map((task) => (
                  <div className="today-task" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{task.detail}</small>
                    </div>
                    <Btn
                      subtle
                      disabled={!!s?.event || s?.phase === 'ended'}
                      onClick={() => openTask(task)}
                    >
                      前往处理
                    </Btn>
                  </div>
                ))}
                {!tasks.length && <p>暂无待办，可以按自己的节奏经营。</p>}
                {!!s?.event && (
                  <p className="reason">先处理眼前遭遇，再继续经营。</p>
                )}
              </DialogContent>
            </Dialog>
          </main>
        </NavigationContext.Provider>
      </LifePreferencesProvider>
    </FeedbackContext.Provider>
  );
}

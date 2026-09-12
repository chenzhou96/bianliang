'use client';
import {
  formatMoment,
  formatDuration,
  relativeMoment,
  type Transport,
} from '@/lib/game/time';
import { useState } from 'react';
import {
  CUSTOMERS,
  CUSTOMER_IDS,
  MILESTONES,
  customerStage,
  milestoneProgress,
} from '@/lib/game/commerce';
import { GOODS } from '@/lib/game/config';
import { actionPreview, orderPreview } from '@/lib/game/engine';
import { useWorkspaceValue } from '@/hooks/use-workspace-value';
import type { Action, GameState, Good } from '@/lib/game/types';
import { GoodIcon } from './game-icons';
import { InfoHint } from './game-hint';

function Execute({
  s,
  act,
  action,
  label,
}: {
  s: GameState;
  act: (a: Action) => void;
  action: Action;
  label: string;
}) {
  const p = actionPreview(s, action);
  const latest = s.operationHistory.at(-1);
  const matched =
    latest?.success &&
    Object.entries(action).every(([key, value]) =>
      latest.actionKey.split('|').includes(`${key}:${String(value)}`),
    );
  return (
    <fieldset className="action action-card" aria-label={label}>
      <div className="action-heading">
        <button
          className="btn"
          disabled={!!p.error}
          onClick={() => act(action)}
        >
          {label}
        </button>
        <InfoHint label={`操作详情：${label}`}>
          <span>
            {formatDuration(p.minutes)} ·{' '}
            {relativeMoment(p.finishAt, s.clock.minute)}完成 ·{' '}
            {Math.ceil(p.energy)}体力
          </span>
          {p.error && <span>{p.error}</span>}
          {p.warning && <span>{p.warning}</span>}
        </InfoHint>
      </div>
      <small>
        {p.error ||
          `${formatDuration(p.minutes)} · ${relativeMoment(p.finishAt, s.clock.minute)}完成 · ${Math.ceil(p.energy)}体力`}
      </small>
      {p.earlierTarget && (
        <button
          className="btn subtle"
          onClick={() => act({ type: 'waitUntil', target: p.earlierTarget! })}
        >
          先等到可交货时刻
        </button>
      )}
      {matched && <small className="inline-success">✓ {latest.title}</small>}
      {!p.error && p.warning && <small className="reason">{p.warning}</small>}
    </fieldset>
  );
}
export function Orders({
  s,
  act,
  onMarket,
}: {
  s: GameState;
  act: (a: Action) => void;
  onMarket: (good: Good) => void;
}) {
  const [selected, select] = useWorkspaceValue<number>('orders.selected', 0);
  const [transport, setTransport] = useState<Transport>('self');
  const orders = s.commerce.orders
    .filter((o) => o.status !== 'offered' || o.postedDay === s.day)
    .toReversed();
  const order = orders.find((o) => o.id === selected) ?? orders[0];
  const preview = order && orderPreview(s, order);
  return (
    <section className="panel">
      <div className="panel-head">
        <h1>供货订单</h1>
        <p>同时最多2单 · 合同价固定 · 截止日20:00前交齐</p>
      </div>
      <div className="flat-scroll orders-workbench">
        <label>
          交货搬运
          <select
            aria-label="交货搬运方式"
            value={transport}
            onChange={(e) => setTransport(e.target.value as Transport)}
          >
            <option value="self">自己搬</option>
            <option value="cart" disabled={!s.home.cart}>
              手推车
            </option>
            <option value="porter">脚夫 · 08—18时</option>
          </select>
        </label>

        <div className="split">
          <div className="list-column">
            <div className="item-list">
              {['可接订单', '进行中', '近期记录'].map((group) => (
                <section className="inventory-group" key={group}>
                  <h3>{group}</h3>
                  {orders
                    .filter((o) =>
                      group === '可接订单'
                        ? o.status === 'offered'
                        : group === '进行中'
                          ? o.status === 'accepted'
                          : !['offered', 'accepted'].includes(o.status),
                    )
                    .map((o) => (
                      <button
                        key={o.id}
                        className={`list-item ${o.id === order?.id ? 'selected' : ''}`}
                        onClick={() => {
                          select(o.id);
                        }}
                      >
                        <span>
                          <strong>{o.title}</strong>
                          <small>
                            {CUSTOMERS[o.customer].name} ·{' '}
                            {o.highRisk ? '高风险' : '普通'}
                          </small>
                        </span>
                        <span>
                          {o.price.toLocaleString()}文
                          <small>{formatMoment(o.deadlineAt)}截止</small>
                        </span>
                      </button>
                    ))}
                </section>
              ))}
              {!orders.length && (
                <p>
                  {s.day < 4
                    ? '第4日起，城中客户会开始张贴供货单。'
                    : '当前没有此类订单。新的机会将在次日出现。'}
                </p>
              )}
            </div>
          </div>
          <aside className="detail order-detail">
            {order && preview ? (
              <>
                <div className="detail-head">
                  <h2>{order.title}</h2>
                </div>
                <small>
                  {CUSTOMERS[order.customer].name} · 关系
                  {s.commerce.relations[order.customer]} ·{' '}
                  {order.highRisk ? '高风险订单' : '普通订单'}
                </small>
                <section className="contract-terms">
                  <p>{order.description}</p>
                  <div className="order-goods">
                    {Object.entries(order.goods).map(([id, q]) => (
                      <span key={id}>
                        <GoodIcon good={id as Good} />
                        {GOODS[id as Good].name} ×{q}
                      </span>
                    ))}
                  </div>
                  <dl className="facts">
                    <div>
                      <dt>合同报酬 / 保证金</dt>
                      <dd>
                        {order.price.toLocaleString()}文 /{' '}
                        {order.deposit.toLocaleString()}文
                      </dd>
                    </div>
                    <div>
                      <dt>截止时间</dt>
                      <dd>{formatMoment(order.deadlineAt)}（完成时刻）</dd>
                    </div>
                    <div>
                      <dt>违约最大损失</dt>
                      <dd>
                        {order.deposit}文保证金，关系−{order.highRisk ? 2 : 1}
                      </dd>
                    </div>
                  </dl>
                  <small>
                    交齐返还保证金；放弃与逾期同样结算，没有额外追债。
                  </small>
                  <div className="actions">
                    {order.status === 'offered' && (
                      <>
                        <Execute
                          s={s}
                          act={act}
                          action={{ type: 'acceptOrder', orderId: order.id }}
                          label="接取订单"
                        />
                        <Execute
                          s={s}
                          act={act}
                          action={{ type: 'declineOrder', orderId: order.id }}
                          label="暂不接取"
                        />
                      </>
                    )}
                    {order.status === 'accepted' && (
                      <>
                        <Execute
                          s={s}
                          act={act}
                          action={{
                            type: 'deliverOrder',
                            orderId: order.id,
                            transport,
                          }}
                          label="交付全部货物"
                        />
                        <Execute
                          s={s}
                          act={act}
                          action={{
                            type: 'waitUntil',
                            target: {
                              kind: 'delivery',
                              orderId: order.id,
                              transport,
                            },
                          }}
                          label="等到最晚交货开始时刻"
                        />
                        <Execute
                          s={s}
                          act={act}
                          action={{ type: 'abandonOrder', orderId: order.id }}
                          label="放弃订单"
                        />
                      </>
                    )}
                    {['delivered', 'failed', 'declined'].includes(
                      order.status,
                    ) && (
                      <p>
                        第{order.settledDay}日
                        {order.status === 'delivered'
                          ? '已交付'
                          : order.status === 'declined'
                            ? '未接取，不扣款也不降低关系'
                            : '已违约结算'}
                        ，不会重复扣款。
                      </p>
                    )}
                  </div>
                </section>
                <section className="order-estimate">
                  <h3>备货估算</h3>
                  <table className="material-table">
                    <thead>
                      <tr>
                        <th>货物</th>
                        <th>已有/需要</th>
                        <th>缺少</th>
                        <th>自产理论完工</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.materials.map((m) => (
                        <tr key={m.good}>
                          <td>{GOODS[m.good].name}</td>
                          <td>
                            {m.owned}/{m.required}
                          </td>
                          <td>{m.missing}</td>
                          <td>
                            {m.earliest === null
                              ? '需采购/添置条件'
                              : formatMoment(m.earliest)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    补货约{preview.purchaseCost}文 · 预计毛利{preview.profit}
                    文 · 交货搬运{preview.carrying}体力
                  </p>
                  <small>
                    毛利不含生活、住房、学费；自产时间是材料和体力足够时的参考。
                  </small>
                  <p className="reason">{preview.risk}</p>
                  {preview.materials
                    .filter((m) => m.missing > 0)
                    .map((m) => (
                      <button
                        key={m.good}
                        className="btn subtle"
                        onClick={() => onMarket(m.good)}
                      >
                        前往采购{GOODS[m.good].name}
                      </button>
                    ))}
                </section>
              </>
            ) : (
              <p>选择一张订单，查看完整交期与损失后再决定。</p>
            )}
          </aside>
        </div>
        <section className="customers-section">
          <h2>熟客</h2>
          <Customers s={s} act={act} />
        </section>
      </div>
    </section>
  );
}

function Customers({ s, act }: { s: GameState; act: (a: Action) => void }) {
  const [selected, select] = useWorkspaceValue<string>(
    'customers.selected',
    'baker',
  );
  const ids = CUSTOMER_IDS.filter((id) => s.commerce.customers[id]?.met);
  const id = ids.find((id) => id === selected) ?? ids[0];
  const c = id && s.commerce.customers[id]!;
  return (
    <div className="split">
      <div className="item-list">
        {ids.map((id) => (
          <button
            className={`list-item ${id === selected ? 'selected' : ''}`}
            key={id}
            onClick={() => select(id)}
          >
            <strong>{CUSTOMERS[id].name}</strong>
            <small>关系 {s.commerce.relations[id]}</small>
          </button>
        ))}
        {!ids.length && (
          <p>在茶馆追问人物消息，或接取供货订单，可以认识城里的客户。</p>
        )}
      </div>
      <aside className="detail">
        {id && c ? (
          <>
            <h2>{CUSTOMERS[id].name}</h2>
            <p>
              {c.visited
                ? CUSTOMERS[id].stories[
                    Math.min(CUSTOMERS[id].stories.length - 1, c.visited - 1)
                  ]
                : '你们已经相识，找个空闲时候去拜访一下。'}
            </p>
            <small>
              关系{s.commerce.relations[id]}
              ；达到3可接高风险订单，达到10解锁至交后续。人物后续
              {c.visited}/{CUSTOMERS[id].stories.length}。
            </small>
            <Execute
              s={s}
              act={act}
              action={{ type: 'visitCustomer', customerId: id }}
              label="拜访与回访"
            />
            <small>
              {customerStage(s, id) > c.visited
                ? '有新的后续可以回访。'
                : '继续履行订单，积累信任。'}
            </small>
          </>
        ) : (
          <p>尚未认识固定客户。</p>
        )}
      </aside>
    </div>
  );
}

export function Growth({ s }: { s: GameState }) {
  return (
    <section className="growth-section" aria-label="经营成长">
      <h2>经营成长</h2>
      <div className="growth-grid">
        {MILESTONES.map((m) => (
          <article key={m.id}>
            <strong>
              {m.name} · {s.commerce.milestones[m.id] ? '已达成' : '进行中'}
            </strong>
            <p>{milestoneProgress(s, m.id)}</p>
            <small>
              {m.requirement} · 奖励：{m.reward}
            </small>
            {s.commerce.milestones[m.id] && (
              <small>第{s.commerce.milestones[m.id]}日记</small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

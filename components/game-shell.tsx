'use client';
import { clockDay, nextDailyTime, relativeMoment } from '@/lib/game/time';
import { productionCompletionLabel } from '@/lib/game/production-time';
import { FACILITIES } from '@/lib/game/home';
import { useEffect, useRef } from 'react';
import {
  GOODS,
  GOOD_IDS,
  EQUIPMENT,
  EQUIPMENT_IDS,
  HOUSING,
  RECIPE_MAP,
} from '@/lib/game/config';
import { quantity } from '@/lib/game/engine';
import type { GameState, OperationResult } from '@/lib/game/types';
import { OperationDetails } from './game-feedback';
const number = (n: number) => (Math.round(n * 10) / 10).toLocaleString('zh-CN');

export function PersistentAssets({
  s,
  onAssets,
}: {
  s: GameState;
  onAssets: () => void;
}) {
  const goods = GOOD_IDS.filter((g) => quantity(s, g) > 0);
  const jobs = s.jobs.filter((j) => j.status === 'queued');
  const equipment = EQUIPMENT_IDS.filter((k) =>
    s.equipment.some((e) => e.kind === k),
  );
  const frozen = s.commerce.orders
    .filter((o) => o.status === 'accepted')
    .reduce((n, o) => n + o.deposit, 0);
  return (
    <aside className="asset-rail" aria-label="常驻资产清单">
      <div className="rail-heading">
        <h2>我的资产</h2>
        <button className="text-button" onClick={onAssets}>
          明细
        </button>
      </div>
      <div className="fixed-assets">
        <section>
          <h3>
            货物 <small>{goods.length}类</small>
          </h3>
          <div className="stock-cells">
            {goods.map((g) => (
              <div
                key={g}
                title={`${GOODS[g].name} ${number(quantity(s, g))}${GOODS[g].unit}`}
              >
                <span>{GOODS[g].name}</span>
                <b>{number(quantity(s, g))}</b>
              </div>
            ))}
          </div>
          {!goods.length && <p>暂无货物</p>}
        </section>
        <section>
          <h3>
            在制品 <small>{jobs.length}项</small>
          </h3>
          <div className="job-cells">
            {jobs.map((j) => (
              <div key={j.id}>
                <span>
                  {RECIPE_MAP[j.recipeId].name} ×{number(j.outputUnits / 10)}
                </span>
                <small>{productionCompletionLabel(s, j)}</small>
              </div>
            ))}
          </div>
          {!jobs.length && <p>暂无在制品</p>}
        </section>
        <section>
          <h3>
            设备与设施{' '}
            <small>
              {equipment.length +
                s.home.facilities.length +
                (s.home.cart ? 1 : 0)}
              类
            </small>
          </h3>
          <div className="equipment-cells">
            {equipment.map((k) => {
              const rows = s.equipment.filter((e) => e.kind === k);
              return (
                <div key={k}>
                  <span>{EQUIPMENT[k].name}</span>
                  <small>
                    {rows.some((e) => e.jobId)
                      ? '生产中'
                      : rows.some((e) => e.installed)
                        ? '空闲'
                        : '封存'}
                    {rows.length > 1 ? ` ×${rows.length}` : ''}
                  </small>
                </div>
              );
            })}
            {s.home.facilities.map((f) => (
              <div key={f.kind}>
                <span>{FACILITIES[f.kind].name}</span>
                <small>{f.installed ? '使用中' : '封存'}</small>
              </div>
            ))}
            {s.home.cart && (
              <div>
                <span>手推车</span>
                <small>可用</small>
              </div>
            )}
          </div>
          {!equipment.length && !s.home.facilities.length && !s.home.cart && (
            <p>暂无设备</p>
          )}
        </section>
        <section>
          <h3>房产</h3>
          <b>{HOUSING[s.housing.id].name}</b>
          <p>
            {HOUSING[s.housing.id].kind === 'owned'
              ? '自有产权'
              : s.housing.id === 'street'
                ? '尚无住所'
                : s.housing.paidThrough === null
                  ? `租赁 · ${relativeMoment(nextDailyTime(s.clock.minute, 360), s.clock.minute)}首次缴费`
                  : `租赁 · 已结清第${clockDay(s.housing.paidThrough)}日费用`}
            {s.housing.maintenanceSuspended ? ' · 维护暂停' : ''}
          </p>
        </section>
      </div>
      <div className="asset-summary">
        现金 {number(s.cash)}文<br />
        冻结保证金 {number(frozen)}文
      </div>
    </aside>
  );
}
export function RecordFeed({
  s,
  current,
}: {
  s: GameState;
  current?: OperationResult;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const records = s.operationHistory.toReversed();
  if (current?.success === false) records.unshift(current);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [current]);
  return (
    <aside className="record-rail" aria-label="常驻完整记录">
      <div className="rail-heading">
        <h2>完整记录</h2>
        <small>最近50次</small>
      </div>
      <section
        className="record-feed"
        ref={scroller}
        // Keyboard users can focus this scrollable record region.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label="完整记录内容"
      >
        {records.map((r, i) => (
          <article key={`${r.id}:${i}`} className={r.success ? '' : 'failed'}>
            <OperationDetails result={r} />
            {r.details.map((d, n) => (
              <p className="record-narrative" key={n}>
                {d}
              </p>
            ))}
          </article>
        ))}
        {!records.length && <p>{s.story}</p>}
      </section>
      <output
        className="record-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {current
          ? `${current.title}。${current.error ?? `现金变化${current.cash}文，健康变化${current.health}，体力变化${current.stamina}。`}`
          : ''}
      </output>
    </aside>
  );
}

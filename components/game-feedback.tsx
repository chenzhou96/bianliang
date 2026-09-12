'use client';

import { useEffect, useState } from 'react';
import {
  BUFFS,
  GOODS,
  RECIPE_MAP,
  SKILLS,
  SKILL_LEVELS,
} from '@/lib/game/config';
import type { GameState, OperationResult } from '@/lib/game/types';
import { GoodIcon } from './game-icons';
import { MILESTONES, CUSTOMERS } from '@/lib/game/commerce';

export const signed = (n: number) =>
  `${n > 0 ? '+' : ''}${n.toLocaleString('zh-CN')}`;

export function ResourceDelta({
  value,
  revision,
}: {
  value: number;
  revision: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!value) return;
    const start = setTimeout(() => setVisible(true), 0);
    const end = setTimeout(() => setVisible(false), 1200);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [value, revision]);
  return visible ? (
    <em
      key={revision}
      aria-hidden="true"
      className={`resource-delta ${value > 0 ? 'gain' : 'loss'}`}
    >
      {signed(value)}
    </em>
  ) : null;
}

export function OperationFeedback({
  result,
  s,
  onHistory,
}: {
  result?: OperationResult;
  s: GameState;
  onHistory: () => void;
}) {
  return (
    <div
      className={`operation-feedback ${result?.success === false ? 'failed' : ''}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="result-heading">
        <strong>{result?.title ?? '经营准备就绪'}</strong>
        <button className="text-button" onClick={onHistory}>
          完整记录
        </button>
      </div>
      {result?.error ? (
        <p className="reason">{result.error}</p>
      ) : (
        <div className="result-changes">
          {result && (
            <>
              {result.cash !== 0 && <span>现金 {signed(result.cash)}文</span>}
              {!!result.depositLoss && (
                <span className="reason">
                  保证金损失 {result.depositLoss}文
                </span>
              )}
              {result.health !== 0 && <span>健康 {signed(result.health)}</span>}
              {result.stamina !== 0 && (
                <span>
                  体力 {signed(result.stamina)} → {s.stamina}
                </span>
              )}
              {result.items.slice(0, 3).map((i) => (
                <span key={i.good}>
                  <GoodIcon good={i.good} />
                  {GOODS[i.good].name} {signed(i.quantity)}
                </span>
              ))}
              {result.items.length > 3 && (
                <span>另有{result.items.length - 3}项物品变化，见完整记录</span>
              )}
              {(result.skills.length > 1 ||
                result.states.length > 1 ||
                (result.customers?.length ?? 0) > 1 ||
                result.jobs.length > 1) && <span>还有变化，见完整记录</span>}
              {result.workRemaining !== null && (
                <span>今日还可打工{result.workRemaining}次</span>
              )}
              {result.sale && (
                <span>
                  已售成本 {result.sale.cost}文 · 毛利{' '}
                  {signed(result.sale.profit)}文
                </span>
              )}
              {result.jobs.slice(0, 1).map((j) => (
                <span key={j.id}>
                  {RECIPE_MAP[j.recipeId]?.name}{' '}
                  {j.status === 'queued'
                    ? `第${j.readyDay}日完工`
                    : j.status === 'ready'
                      ? '已完工入库'
                      : '已放弃'}
                </span>
              ))}
              {result.skills.slice(0, 1).map((k) => (
                <span key={k.skill}>
                  {SKILLS[k.skill].name}经验 {signed(k.xp)}
                  {k.level ? `，进阶${k.level}级` : ''}
                </span>
              ))}
              {result.states.slice(0, 1).map((b) => (
                <span key={b.buff}>
                  {BUFFS[b.buff].name}
                  {b.active ? '生效' : '解除'}
                </span>
              ))}
              {result.customers?.slice(0, 1).map((c) => (
                <span key={c.id}>
                  {CUSTOMERS[c.id].name}关系 {signed(c.change)}
                </span>
              ))}
            </>
          )}
          {!result && <span>选一件事，开始今天的经营。</span>}
        </div>
      )}
    </div>
  );
}

export function OperationDetails({ result }: { result: OperationResult }) {
  const entries = [
    ...(result.depositLoss ? [`保证金损失 ${result.depositLoss}文`] : []),
    ...result.items.map(
      (i) => GOODS[i.good].name + ' ' + signed(i.quantity) + GOODS[i.good].unit,
    ),
    ...result.skills.map(
      (k) =>
        SKILLS[k.skill].name +
        '：经验' +
        signed(k.xp) +
        (k.level ? '，进阶' + k.level + '级' : ''),
    ),
    ...result.states.map(
      (b) => BUFFS[b.buff].name + '：' + (b.active ? '生效' : '解除'),
    ),
    ...result.jobs.map(
      (j) =>
        (RECIPE_MAP[j.recipeId]?.name ?? j.recipeId) +
        (j.status === 'queued'
          ? '：第' + j.readyDay + '日完工'
          : j.status === 'ready'
            ? '：已完工入库'
            : '：已放弃'),
    ),
    ...(result.customers ?? []).map(
      (c) => CUSTOMERS[c.id].name + '关系 ' + signed(c.change),
    ),
    ...(result.milestones ?? []).map(
      (id) => '达成：' + MILESTONES.find((m) => m.id === id)?.name,
    ),
  ];
  return (
    <>
      <h3>
        第{result.day}日 · {result.title}
      </h3>
      <p>
        现金 {signed(result.cash)}文 · 健康 {signed(result.health)} · 体力{' '}
        {signed(result.stamina)}
      </p>
      {result.error && <p className="reason">{result.error}</p>}
      {result.sale && (
        <p>
          实收{result.sale.revenue}文 · 已售成本{result.sale.cost}文 · 毛利
          {signed(result.sale.profit)}文
        </p>
      )}
      <div className="result-detail-grid">
        {entries.map((entry, i) => (
          <span key={i}>{entry}</span>
        ))}
      </div>
    </>
  );
}

export function celebration(result: OperationResult | undefined, s: GameState) {
  if (!result?.success) return '';
  if (result.milestones?.length)
    return (
      result.milestones
        .map((id) => `达成「${MILESTONES.find((m) => m.id === id)?.name}」`)
        .join('，') + '，新的供货机会已解锁。'
    );
  if (result.action === 'buyHousing')
    return '有了自己的家，汴梁也多了一份牵挂。';
  return result.skills
    .filter((k) => k.level > 0)
    .map(
      (k) =>
        `${SKILLS[k.skill].name}达到${SKILL_LEVELS[s.skills[k.skill]]}，新的手艺已经掌握。`,
    )
    .join(' ');
}

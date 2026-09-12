'use client';
import Image from 'next/image';

import type { ReactNode } from 'react';
import { EQUIPMENT, HOUSING } from '@/lib/game/config';
import { FACILITIES } from '@/lib/game/home';
import { formatClock } from '@/lib/game/time';
import type { EquipmentKind, GameState } from '@/lib/game/types';

export function SceneArt({
  scene,
  children,
  className = '',
}: {
  scene: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`scene-art ${className}`}>
      <Image
        unoptimized
        width={1440}
        height={960}
        src={`/art/scenes/${scene}-v1.webp`}
        alt=""
      />
      {children && <div className="scene-caption">{children}</div>}
    </div>
  );
}

export function EquipmentArt({
  kind,
  s,
  compact = false,
}: {
  kind: EquipmentKind;
  s?: GameState;
  compact?: boolean;
}) {
  const owned = s?.equipment.filter((e) => e.kind === kind) ?? [];
  const busy = owned.some((e) => e.jobId);
  const status = !owned.length
    ? '未购置'
    : busy
      ? '生产中'
      : owned.some((e) => e.installed)
        ? '已安装 · 空闲'
        : '已封存';
  return (
    <figure
      className={`equipment-art ${compact ? 'compact' : ''} ${busy ? 'is-working' : ''}`}
      data-equipment={kind}
    >
      <Image
        unoptimized
        src={`/art/equipment/${kind}-v1.webp`}
        alt=""
        width="420"
        height="420"
        loading="lazy"
      />
      {!compact && (
        <figcaption>
          <strong>{EQUIPMENT[kind].name}</strong>
          {s && <span className={busy ? 'working-label' : ''}>{status}</span>}
          {owned.length > 1 && <small>持有 {owned.length} 台</small>}
        </figcaption>
      )}
    </figure>
  );
}

export function HomeEstate({ s }: { s: GameState }) {
  const sheltered = s.housing.id !== 'street';
  const installed = s.equipment.filter((e) => e.installed);
  const kinds = [...new Set(installed.map((e) => e.kind))];
  const hungry = s.hens.filter((hen) => !s.life.fed.includes(hen.id)).length;
  return (
    <section className="home-estate" aria-label="我的生活空间">
      <SceneArt
        scene={
          {
            street: 'street',
            room: 'home-room',
            courtyard: 'home-empty',
            yard: 'home-yard',
            mansion: 'home-mansion',
          }[s.housing.id]
        }
      >
        <span className="scene-kicker">
          第 {s.day} 日 · {formatClock(s.clock.minute)}
        </span>
        <strong>{HOUSING[s.housing.id].name}</strong>
        <span>
          {sheltered
            ? '一处安身之所，一份经营的起点。'
            : '先安顿下来，再慢慢置办家业。'}
        </span>
      </SceneArt>
      <div className="estate-inventory">
        <div className="estate-heading">
          <strong>家中布置</strong>
          <span>
            {s.hens.length} 只母鸡 · {hungry ? `${hungry}只待喂` : '无需补喂'}
          </span>
        </div>
        <div className="estate-equipment">
          {kinds.map((kind) => (
            <div key={kind}>
              <EquipmentArt kind={kind} compact />
              <span>
                {EQUIPMENT[kind].name} ×
                {installed.filter((e) => e.kind === kind).length}
              </span>
            </div>
          ))}
          {!kinds.length && <p>尚无已安装设备，可到作坊置办。</p>}
        </div>
        <div className="estate-facilities">
          {s.home.facilities
            .filter((f) => f.installed)
            .map((f) => (
              <span key={f.kind}>{FACILITIES[f.kind].name}</span>
            ))}
        </div>
      </div>
    </section>
  );
}

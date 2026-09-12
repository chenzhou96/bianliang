'use client';
import { useState, type SetStateAction } from 'react';
import { GOODS, GOOD_IDS, HOUSING_IDS, SKILL_IDS } from '@/lib/game/config';

const remembered = new Map<string, unknown>();
const prefix = 'bianliang-ui:';
export function setWorkspacePreference(
  key: string,
  value: string | number | boolean,
) {
  remembered.set(key, value);
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    /* Optional preferences. */
  }
}
const choices: Record<string, readonly string[]> = {
  'market.category': [
    '全部',
    ...new Set(Object.values(GOODS).map((g) => g.category)),
  ],
  'market.good': GOOD_IDS,
  'production.mode': ['配方', '设备', '队列'],
  'housing.id': HOUSING_IDS,
  'housing.view': ['生活', '房屋', '设施'],
  'people.id': ['身体', '成长', ...SKILL_IDS],
  'orders.mode': ['可接订单', '进行中', '近期记录', '熟客'],
  'assets.category': ['货物', '在制品', '设备', '设施', '房产'],
};
export function useWorkspaceValue<T extends string | number | boolean>(
  key: string,
  initial: T,
) {
  const [value, update] = useState<T>(() => {
    try {
      const stored = remembered.has(key)
        ? remembered.get(key)
        : typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem(prefix + key) ?? 'null')
          : null;
      if (
        typeof stored === typeof initial &&
        (!choices[key] || choices[key].includes(String(stored))) &&
        (!key.endsWith('.meal') ||
          ['diner', 'bread', 'egg', 'saltedEgg', 'grain'].includes(
            String(stored),
          )) &&
        (!key.endsWith('.bed') ||
          ['inn', 'temple', 'street', ...HOUSING_IDS].includes(
            String(stored),
          )) &&
        (typeof stored !== 'number' || (Number.isFinite(stored) && stored >= 0))
      )
        return stored as T;
    } catch {
      /* Invalid preferences never prevent loading a game. */
    }
    return initial;
  });
  const setValue = (next: SetStateAction<T>) => {
    const resolved = typeof next === 'function' ? next(value) : next;
    setWorkspacePreference(key, resolved);
    update(resolved);
  };
  return [value, setValue] as const;
}

import type {
  Good,
  EquipmentKind,
  HousingId,
  SkillId,
  Buff,
} from '@/lib/game/types';
import {
  Heart,
  Zap,
  CloudSun,
  Coins,
  Warehouse,
  CircleAlert,
  Leaf,
  ShieldCheck,
} from 'lucide-react';

// Original paper-and-ink silhouettes. Labels remain visible next to every icon.
const paths: Record<Good, string> = {
  grain:
    'M8 8Q16 4 24 8L22 12Q29 26 23 28H9Q3 26 10 12ZM10 12H22M12 17L14 20M20 17L18 20M15 23L17 25',
  wheat:
    'M12 29L20 3M18 9Q9 3 13 13L17 15M17 16Q6 10 11 20L15 22M19 11Q29 8 24 16L17 18M16 22Q25 17 22 25L14 27',
  flour: 'M8 6H24L21 11L25 27H7L11 11ZM11 11H21M12 23V16H20V23ZM16 16V23',
  salt: 'M5 21H27L24 28H8ZM8 21L16 9L25 21M14 18L16 14L18 18M6 6H8M24 9H26',
  firewood:
    'M4 22L23 8L28 14L9 28ZM5 13L9 7L27 21L23 27ZM9 7L11 12M21 19L23 27',
  hemp: 'M9 28L14 5M15 28L18 4M21 28L24 7M7 23H24M10 15H25M13 8L11 4M18 8L22 3',
  thread:
    'M10 5H22V9H20V24H23V28H9V24H12V9H10ZM12 12L20 15M12 17L20 20M12 22L20 24',
  silkRaw:
    'M8 23C1 16 10 5 19 6C29 5 29 16 22 23C14 32 7 29 8 23ZM11 20Q17 8 22 10M10 25Q18 14 24 14',
  silk: 'M8 6H25V23Q21 29 15 26L7 28V11Q7 6 11 6Q16 6 16 10H8M16 10V26M19 13Q23 15 25 12M18 19Q22 21 25 18',
  bread:
    'M4 20C3 10 10 6 16 7C24 5 30 14 28 22Q16 30 4 22ZM10 12L12 16M16 11L18 15M22 12L24 16M6 23Q17 27 27 22',
  hen: 'M8 14Q6 7 11 9Q9 2 15 7Q22 3 21 10L27 13L22 15Q26 26 14 26Q5 26 5 18L2 12ZM13 26V30M20 26V30M18 11H19M10 17Q14 23 19 18',
  egg: 'M16 4C10 4 5 17 6 22C8 31 25 31 27 22C28 17 22 4 16 4ZM11 17Q9 21 12 24',
  saltedEgg:
    'M11 5C6 6 2 17 4 23Q7 29 15 26M21 12C16 10 11 19 13 25C17 33 29 29 29 22C28 17 25 13 21 12ZM20 19C14 20 19 29 24 25C27 22 24 18 20 19Z',
  cloth: 'M5 7H24V25H5ZM9 7V25M14 7V25M19 7V25M5 12H24M5 18H24M8 28H28V10',
  tea: 'M7 28Q13 16 25 5Q29 24 10 25M12 22L21 12M12 19L12 12Q5 4 4 10Q2 19 12 19',
  wine: 'M12 3H20V8L25 14L26 25Q16 32 6 25L7 14L12 8ZM11 8H21M7 15H25M12 18H20V25H12Z',
  herb: 'M5 14H27V28H5ZM5 18H27M16 14V28M11 14Q2 3 10 5L16 12Q23 1 27 7Q26 12 17 14M14 6L17 2',
};
export function GoodIcon({
  good,
  large = false,
}: {
  good: Good;
  large?: boolean;
}) {
  return (
    <svg
      className={`good-icon ${large ? 'large' : ''}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="var(--icon-wash, #eee4cf)"
        stroke="none"
      />
      <path
        d={paths[good]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const objects: Record<EquipmentKind | HousingId, string> = {
  mill: 'M4 16Q16 8 28 16V22Q16 30 4 22ZM4 16Q16 24 28 16M16 6V14M16 6H25M9 24V29M24 24V29',
  stove:
    'M5 11H27V28H5ZM3 8H29M10 8V4H22V8M10 26V19Q16 12 22 19V26M15 24Q11 20 16 17Q21 21 18 24',
  pickleVat: 'M7 9H25L27 23Q26 29 16 29Q6 29 5 23ZM5 6Q16 2 27 6V9H5ZM8 18H24',
  brewVat:
    'M8 4H24V8L27 12V25Q16 31 5 25V12L8 8ZM8 8H24M5 15H27M5 23H27M13 18H19',
  spinningWheel:
    'M16 5A10 10 0 1 0 16 25A10 10 0 1 0 16 5ZM16 5V25M6 15H26M9 8L23 22M9 22L23 8M10 25L6 30M22 25L26 30',
  loom: 'M5 3V29M27 3V29M5 7H27M5 24H27M9 7V24M14 7V24M19 7V24M23 7V24M7 12L25 19M7 17L25 12',
  coop: 'M3 12L16 3L29 12M6 11V28H26V11M11 28V18H21V28M10 12H22M13 22H19',
  street: 'M2 26H30M5 25V9M5 9L18 6L27 14M9 25V16H21V25M5 9L24 18M24 18V26',
  room: 'M3 14L16 4L29 14M6 13V28H26V13M12 28V19H20V28M10 14H22',
  courtyard:
    'M2 14L8 8L14 14M18 14L24 8L30 14M4 14V27H28V14M12 27V20H20V27M14 14L16 11L18 14',
  yard: 'M2 11L16 2L30 11M5 11V28H27V11M10 15H14V19H10ZM19 15H23V19H19ZM13 28V23H19V28',
  mansion:
    'M2 10L16 2L30 10M5 10V17M27 10V17M2 18L16 12L30 18M5 18V29H27V18M13 29V22H19V29M11 10H21',
};
export function GameIcon({
  kind,
  large = false,
}: {
  kind: EquipmentKind | HousingId | SkillId | Buff;
  large?: boolean;
}) {
  const skill: Partial<Record<SkillId, Good>> = {
    food: 'bread',
    husbandry: 'hen',
    textile: 'cloth',
    brewing: 'wine',
  };
  if (kind in skill)
    return <GoodIcon good={skill[kind as SkillId]!} large={large} />;
  if (kind in objects)
    return (
      <svg
        className={`good-icon ${large ? 'large' : ''}`}
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="16" r="15" fill="#dde8df" />
        <path
          d={objects[kind as EquipmentKind | HousingId]}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  const Icon =
    kind === 'tired' || kind === 'cold'
      ? CircleAlert
      : kind === 'warm'
        ? Heart
        : kind === 'regular'
          ? ShieldCheck
          : Leaf;
  return <Icon className="state-icon" aria-hidden="true" />;
}
export function StatusIcon({
  kind,
}: {
  kind: 'health' | 'stamina' | 'date' | 'cash' | 'storage';
}) {
  const Icon = {
    health: Heart,
    stamina: Zap,
    date: CloudSun,
    cash: Coins,
    storage: Warehouse,
  }[kind];
  return <Icon className="state-icon" aria-hidden="true" />;
}

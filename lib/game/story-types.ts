import type { CustomerId, Good, SkillId } from './types.ts';

export type StoryFocus = 'all' | 'trade' | 'craft' | 'neighbors';
export type StoryStatus = 'offered' | 'active' | 'waiting' | 'ended';
export type StoryDestination =
  | 'intel'
  | 'market'
  | 'production'
  | 'street'
  | 'housing';

export interface StoryCost {
  cash?: number;
  stamina?: number;
  goods?: Partial<Record<Good, number>>;
}
export interface StoryReward {
  cash?: number;
  reputation?: number;
  customer?: CustomerId;
  skill?: SkillId;
  xp?: number;
  /** A finite, time-limited opportunity attached to this story only. */
  opportunity?: { good: Good; quantity: number; price: number; days: number };
}
export interface StoryChoice {
  influence?: {
    method: import('./market-control.ts').MarketMethod;
    good: Good;
    caughtNext?: string;
  };
  id: string;
  label: string;
  text: string;
  minutes: number;
  cost?: StoryCost;
  reward?: StoryReward;
  next: string;
  destination?: StoryDestination;
  skill?: { id: SkillId; level: number };
  evidence?: string;
  reveal?: string;
  produced?: { good: Good; quantity: number };
}
export interface StoryStage {
  id: string;
  title: string;
  person: string;
  text: string;
  objective: string;
  choices: StoryChoice[];
  productionGoal?: { good: Good; quantity: number };
  /** Relative to entering this stage, never relative to viewing it. */
  waitMinutes?: number;
  deadlineMinutes?: number;
  timeout?: string;
  ending?: boolean;
}
export interface StoryDefinition {
  id: string;
  title: string;
  focus: Exclude<StoryFocus, 'all'>;
  opening: string;
  stages: StoryStage[];
}
export interface StoryRecord {
  stage: string;
  choice: string;
  label: string;
  text: string;
  at: number;
}
export interface StoryInstance {
  id: number;
  definitionId: string;
  stage: string;
  status: StoryStatus;
  discoveredAt: number;
  enteredAt: number;
  availableAt: number;
  deadlineAt: number | null;
  source: 'tea' | 'encounter';
  unread: boolean;
  evidence: string[];
  produced: Partial<Record<Good, number>>;
  history: StoryRecord[];
  opportunity: {
    good: Good;
    remaining: number;
    price: number;
    expiresAt: number;
  } | null;
}

export interface StreetScene {
  id: string;
  family: string;
  title: string;
  person: string;
  text: string;
  clue: string;
  inspection: string;
  inspectMinutes: number;
  inspectCash: number;
  contexts: ('trade' | 'work')[];
  storyId?: string;
  choices: {
    id: string;
    label: string;
    text: string;
    minutes: number;
    cost?: StoryCost;
    reward?: StoryReward;
    storyStage?: string;
    evidence?: string;
  }[];
}

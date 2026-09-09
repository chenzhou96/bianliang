export type Good =
  | 'grain'
  | 'bread'
  | 'hen'
  | 'egg'
  | 'cloth'
  | 'tea'
  | 'wine'
  | 'herb';
export type Meal = 'bread' | 'egg' | 'grain' | 'diner' | 'none';
export type Bed = 'inn' | 'temple' | 'street' | 'home';
export type Phase = 'day' | 'market' | 'night' | 'last' | 'ended';
export type Buff = 'outsider' | 'regular' | 'tired' | 'cold' | 'warm';
export interface Batch {
  id: number;
  good: Good;
  units: number;
  cost: number;
  expires: number | null;
  origin: 'buy' | 'gift' | 'production';
}
export interface Price {
  buy: number;
  sell: number;
}
export interface Effect {
  cash?: number;
  health?: number;
  stamina?: number;
  reputation?: number;
  good?: Good;
  units?: number;
  buff?: Buff;
  help?: boolean;
  chain?: 'widow' | 'porter';
}
export interface OutcomeDefinition {
  weight: number;
  text: string;
  effect: Effect;
  minRep?: number;
}
export interface EventChoice {
  id: string;
  label: string;
  hint: string;
  cost: { cash?: number; ap?: number; stamina?: number };
  outcomes: OutcomeDefinition[];
}
export interface EventVariant {
  id: string;
  person: string;
  fact: string;
  texts: [string, string];
  clue: string;
  inspection: string;
  choices: EventChoice[];
}
export interface EventFamily {
  id: string;
  title: string;
  variants: EventVariant[];
}
export interface EventInstance {
  id: number;
  family: string;
  variant: string;
  person: string;
  title: string;
  text: string;
  clue: string;
  hiddenFact: string;
  inspection: string;
  inspected: boolean;
  choices: EventChoice[];
}
export interface ScheduledFollowUp {
  chain: 'widow' | 'porter';
  person: string;
  due: number;
  branch: 'gift' | 'work' | 'request';
  source: number;
}
export interface WorldEvent {
  id: number;
  family: string;
  name: string;
  good: Good;
  start: number;
  expected: number;
  duration: number;
  factor: number;
  truth: 'normal' | 'delay' | 'small' | 'false';
  publicText: string;
  heard: boolean;
  clueKnown: boolean;
  source: string;
  clue: string;
}
export interface Log {
  id: number;
  day: number;
  text: string;
  cash: number;
  items: string;
}
export interface GameState {
  version: number;
  rules: string;
  seed: number;
  rng: number;
  revision: number;
  nextId: number;
  day: number;
  phase: Phase;
  cash: number;
  health: number;
  stamina: number;
  reputation: number;
  ap: number;
  rented: boolean;
  coop: boolean;
  teaDay: number;
  encounterDay: number;
  weather: string;
  batches: Batch[];
  hens: { id: number; hunger: number; cost: number }[];
  buffs: Partial<Record<Buff, number>>;
  prices: Record<Good, Price>;
  history: { day: number; prices: Record<Good, Price> }[];
  trend: Record<Good, number>;
  trendUntil: number;
  worlds: WorldEvent[];
  event: EventInstance | null;
  followups: ScheduledFollowUp[];
  relations: Record<string, number>;
  seen: string[];
  cooldowns: Record<string, number>;
  familyCounts: Record<string, number>;
  logs: Log[];
  story: string;
  ending: null | 'return' | 'death' | 'stay';
  deathCause: string;
  beforeReturn: number;
  stats: {
    trades: number;
    profit: number;
    maxProfit: number;
    eggs: number;
    eggRevenue: number;
    feedCost: number;
    productionCostSold: number;
    workIncome: number;
    helped: number;
    events: number;
    peakAssets: number;
    survivedLow: boolean;
    lowDay: number;
    maxHens: number;
  };
}
export type Action =
  | {
      type:
        | 'market'
        | 'leave'
        | 'tea'
        | 'short'
        | 'heavy'
        | 'rest'
        | 'rent'
        | 'coop'
        | 'endDay'
        | 'return'
        | 'stay'
        | 'inspect';
    }
  | { type: 'trade'; good: Good; quantity: number; side: 'buy' | 'sell' }
  | { type: 'choice'; id: string; eventId: number }
  | { type: 'night'; meal: Meal; bed: Bed; feed: number };

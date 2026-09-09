export type Good =
  | 'grain'
  | 'wheat'
  | 'flour'
  | 'salt'
  | 'firewood'
  | 'hemp'
  | 'thread'
  | 'silkRaw'
  | 'silk'
  | 'bread'
  | 'hen'
  | 'egg'
  | 'saltedEgg'
  | 'cloth'
  | 'tea'
  | 'wine'
  | 'herb';
export type Meal = 'bread' | 'egg' | 'saltedEgg' | 'grain' | 'diner' | 'none';
export type Bed =
  | 'inn'
  | 'temple'
  | 'street'
  | 'room'
  | 'courtyard'
  | 'yard'
  | 'mansion';
export type Phase = 'day' | 'market' | 'night' | 'ended';
export type Buff = 'outsider' | 'regular' | 'tired' | 'cold' | 'warm';
export type SkillId = 'husbandry' | 'food' | 'textile' | 'brewing';
export type HousingId = 'street' | 'room' | 'courtyard' | 'yard' | 'mansion';
export type EquipmentKind =
  | 'coop'
  | 'mill'
  | 'stove'
  | 'pickleVat'
  | 'spinningWheel'
  | 'loom'
  | 'brewVat';

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
  cost: { cash?: number; stamina?: number; ap?: number };
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
export interface IntelTemplate {
  id: string;
  category: string;
  source: string;
  semantic: string;
  skeleton: string;
  title: string;
  variants: [string, string, string];
  kind:
    | 'market'
    | 'supply'
    | 'demand'
    | 'recipe'
    | 'teacher'
    | 'housing'
    | 'life';
  resolved?: string;
  clue?: string;
  good?: Good;
  recipeId?: string;
  skill?: SkillId;
}
export interface IntelEntry {
  id: string;
  templateId: string;
  title?: string;
  category: string;
  source: string;
  semantic: string;
  text: string;
  heardDay: number;
  usefulUntil: number;
  status: 'new' | 'confirmed' | 'expired' | 'wrong';
  worldId?: number;
  good?: Good;
  followUp?: string;
  asked?: boolean;
  visited?: boolean;
  reportVersion?: number;
  resolution?: { due: number; happens: boolean; text: string; clue: string };
}
export interface Equipment {
  id: number;
  kind: EquipmentKind;
  installed: boolean;
  jobId: number | null;
}
export interface ProductionJob {
  id: number;
  recipeId: string;
  quantity: number;
  equipmentId: number;
  startDay: number;
  readyDay: number;
  inputCost: number;
  outputUnits: number;
  status: 'queued' | 'ready' | 'abandoned';
}
export interface Recipe {
  id: string;
  name: string;
  industry: SkillId;
  inputs: Partial<Record<Good, number>>;
  output: Good;
  outputUnits: number;
  stamina: number;
  duration: number;
  shelfLife: number | null;
  equipment: EquipmentKind;
  minSkill: number;
  batchLabel: string;
}
export interface HousingState {
  id: HousingId;
  paidThrough: number | null;
  maintenanceSuspended?: boolean;
}
export interface DailyState {
  work: number;
  lessons: number;
  treatment: number;
  rest: number;
  snack: number;
  tradeUnits: number;
}
export interface Log {
  id: number;
  day: number;
  text: string;
  cash: number;
  items: string;
}
export interface Ledger {
  purchases: number;
  returns: number;
  losses: number;
  feedPending: number;
  sinceDay: number;
  tradeRevenue: number;
  tradeCost: number;
  productionRevenue: number;
  productionCost: number;
  tuition: number;
  equipment: number;
  housing: number;
  living: number;
  feed: number;
  medical: number;
  workIncome: number;
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
  target: 3000 | 30000;
  cash: number;
  health: number;
  stamina: number;
  reputation: number;
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
  teaDay: number;
  encounterDay: number;
  followups: ScheduledFollowUp[];
  relations: Record<string, number>;
  seen: string[];
  cooldowns: Record<string, number>;
  familyCounts: Record<string, number>;
  intel: IntelEntry[];
  intelSeen: Record<string, number>;
  skills: Record<SkillId, number>;
  skillXp: Record<SkillId, number>;
  equipment: Equipment[];
  jobs: ProductionJob[];
  housing: HousingState;
  daily: DailyState;
  ledger: Ledger;
  logs: Log[];
  lastResponse?: string;
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
    productionRuns: number;
    lessons: number;
    days: number;
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
        | 'endDay'
        | 'return'
        | 'stay'
        | 'inspect'
        | 'snack';
    }
  | { type: 'treat'; mode: 'fast' | 'slow' }
  | { type: 'rent' | 'coop' }
  | { type: 'rentHousing' | 'buyHousing'; housing: HousingId }
  | { type: 'sellHousing' | 'endLease' | 'maintain' }
  | { type: 'askIntel' | 'visitIntel'; id: string }
  | { type: 'learn'; skill: SkillId }
  | { type: 'install'; equipment: EquipmentKind }
  | { type: 'uninstall' | 'sellEquipment'; equipmentId: number }
  | { type: 'produce'; recipeId: string; quantity: number }
  | { type: 'cancelProduction'; jobId: number }
  | { type: 'trade'; good: Good; quantity: number; side: 'buy' | 'sell' }
  | { type: 'choice'; id: string; eventId: number }
  | { type: 'night'; meal: Meal; bed: Bed; feed: number };

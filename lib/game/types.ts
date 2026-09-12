import type { MarketOpportunities } from './market-opportunities.ts';
import type { HomeAssets, FacilityKind } from './home.ts';
import type { Transport } from './time.ts';
import type { GameClock } from './time.ts';
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
export type Phase = 'day' | 'ended';
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
  remainingMinutes: number | null;
  id: number;
  good: Good;
  units: number;
  cost: number;
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
  cost: { cash?: number; stamina?: number };
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
  dueAt: number;
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
  customerId?: CustomerId;
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
  remainingMinutes: number;
  id: number;
  recipeId: string;
  quantity: number;
  equipmentId: number;
  startDay: number;
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
  depositsPaid: number;
  depositsReturned: number;
  depositLosses: number;
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
  social: number;
  medical: number;
  workIncome: number;
}

export interface OperationResult {
  startedAt: number;
  finishedAt: number;
  depositLoss?: number;
  milestones?: string[];
  tradeMilestones?: string[];
  customers?: { id: CustomerId; change: number }[];
  id: number;
  day: number;
  action: Action['type'];
  actionKey: string;
  title: string;
  success: boolean;
  error?: string;
  cash: number;
  health: number;
  stamina: number;
  items: { good: Good; quantity: number }[];
  skills: { skill: SkillId; xp: number; level: number }[];
  states: { buff: Buff; active: boolean }[];
  jobs: {
    id: number;
    recipeId: string;
    readyAt: number | null;
    status: ProductionJob['status'];
  }[];
  sale: { revenue: number; cost: number; profit: number } | null;
  workRemaining: number | null;
  details: string[];
}

export interface GameState {
  pendingTrade?: {
    cash: number;
    batches: Batch[];
    hens: { id: number; hunger: number; cost: number }[];
    units: number;
  };
  clock: GameClock;
  home: HomeAssets;
  marketOffers: MarketOpportunities;
  life: {
    ateCycle: number;
    fed: number[];
    autoFeed: boolean;
    lastDawn: number;
    wakeSummary: { at: number; lines: string[] } | null;
  };
  commerce: CommerceState;
  saveRevision: number;
  operationHistory: OperationResult[];
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
  /** Absolute expiry minute; inactive exactly at this timestamp. */
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
  /** Earliest absolute minute each encounter family can recur. */
  cooldowns: Record<string, number>;
  familyCounts: Record<string, number>;
  intel: IntelEntry[];
  /** Absolute next-eligible minute for semantic, skeleton and market keys. */
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
  | { type: 'buyLot'; lotId: string; transport?: Transport }
  | {
      type: 'supplyRequest';
      requestId: string;
      quantity: number;
      transport?: Transport;
    }
  | { type: 'reserveRequest'; requestId: string }
  | { type: 'host'; customer: CustomerId }
  | { type: 'buyCart' }
  | {
      type: 'installFacility' | 'removeFacility' | 'sellFacility';
      facility: FacilityKind;
    }
  | { type: 'coldPriority'; goods: Good[] }
  | { type: 'eat'; meal: Exclude<Meal, 'none'> }
  | { type: 'feed'; count: number }
  | { type: 'sleep'; minutes: number; bed: Bed }
  | { type: 'wait'; minutes: number }
  | { type: 'autoFeed'; enabled: boolean }
  | { type: 'acceptOrder'; orderId: number; confirm?: string }
  | {
      type: 'deliverOrder' | 'abandonOrder' | 'declineOrder';
      orderId: number;
      transport?: Transport;
    }
  | { type: 'meetCustomer' | 'visitCustomer'; customerId: CustomerId }
  | {
      type:
        | 'market'
        | 'leave'
        | 'tea'
        | 'short'
        | 'heavy'
        | 'rest'
        | 'stay'
        | 'inspect'
        | 'snack';
    }
  | { type: 'return'; confirm?: string }
  | { type: 'treat'; mode: 'fast' | 'slow' }
  | { type: 'rent' | 'coop' }
  | { type: 'rentHousing' | 'buyHousing'; housing: HousingId }
  | { type: 'sellHousing' | 'endLease' | 'maintain' }
  | { type: 'askIntel' | 'visitIntel'; id: string }
  | { type: 'learn'; skill: SkillId }
  | { type: 'install'; equipment: EquipmentKind }
  | { type: 'uninstall' | 'sellEquipment'; equipmentId: number }
  | { type: 'produce'; recipeId: string; quantity: number }
  | { type: 'refill'; recipeId: string; quantity: number }
  | { type: 'cancelProduction'; jobId: number }
  | {
      type: 'trade';
      good: Good;
      quantity: number;
      side: 'buy' | 'sell';
      transport?: Transport;
    }
  | { type: 'choice'; id: string; eventId: number };

export type CustomerId =
  | 'baker'
  | 'clothier'
  | 'innkeeper'
  | 'eggSeller'
  | 'merchant'
  | 'ferryman';
export type OrderStatus =
  | 'offered'
  | 'declined'
  | 'accepted'
  | 'delivered'
  | 'failed'
  | 'expired';
export interface Order {
  id: number;
  templateId: string;
  customer: CustomerId;
  title: string;
  description: string;
  goods: Partial<Record<Good, number>>;
  prices: Partial<Record<Good, number>>;
  price: number;
  deposit: number;
  highRisk: boolean;
  postedDay: number;
  /** Absolute completion deadline in game minutes. */
  deadlineAt: number;
  status: OrderStatus;
  settledDay: number | null;
}
export interface CommerceState {
  rng: number;
  enabledDay: number;
  generatedDay: number;
  orders: Order[];
  relations: Record<CustomerId, number>;
  customers: Partial<
    Record<
      CustomerId,
      {
        met: boolean;
        visited: number;
        lastOutcome: 'delivered' | 'failed' | null;
      }
    >
  >;
  seen: Record<string, number>;
  completed: number;
  failed: number;
  milestones: Record<string, number>;
  positiveDays: number;
  profitAtDawn: number;
  profitSinceDay: number;
}

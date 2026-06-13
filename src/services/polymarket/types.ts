// Shared Polymarket service types. Server-safe (no React imports).

export type Tier = "S" | "A" | "B" | "C" | "D";

export type CategoryName =
  | "Politics"
  | "Crypto"
  | "Sports"
  | "Economics"
  | "Technology"
  | "World Events"
  | "Pop Culture"
  | "Other";

export interface Trade {
  /** Unix seconds */
  timestamp: number;
  /** USDC notional of the trade */
  usdcSize: number;
  /** "BUY" | "SELL" | "MERGE" | "SPLIT" | "REDEEM" | ... */
  side: string;
  /** "TRADE" | "REWARD" | "REDEEM" | "MERGE" | "SPLIT" */
  type: string;
  conditionId: string;
  eventSlug?: string;
  marketTitle?: string;
  /** Inferred category, see categories.ts */
  category: CategoryName;
  /** Realised PnL on this transaction in USDC, if available */
  pnl?: number;
}

export interface Position {
  conditionId: string;
  marketTitle?: string;
  eventSlug?: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  /** cash invested */
  initialValue: number;
  /** current value at current price */
  currentValue: number;
  /** realised + unrealised PnL on this position when API exposes it */
  cashPnl: number;
  realizedPnl: number;
  redeemable: boolean;
  category: CategoryName;
}

export interface Profile {
  address: string;
  proxyWallet?: string;
  username?: string;
  displayUsername?: string;
  pfpUrl?: string;
  /** Unix seconds the wallet first appeared on Polymarket. May be undefined. */
  createdAt?: number;
  warning?: string;
  debug?: unknown;
}

export interface CategoryShare {
  name: CategoryName;
  pct: number;
}

export interface TimelinePoint {
  date: string;
  volume: number;
  trades: number;
}

export interface ScoreBreakdown {
  volume: number;
  activity: number;
  diversity: number;
  profitability: number;
  loyalty: number;
}

export interface SybilSignal {
  score: number;
  level: "Low" | "Medium" | "High";
  reasons: string[];
}

export interface Recommendation {
  label: string;
  current: number;
  target: number;
  unit: string;
}

export interface Metrics {
  totalVolume: number;
  totalTrades: number;
  markets: number;
  avgPosition: number;
  winRate: number;
  pnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  portfolioValue: number;
  bestMarket: string;
  worstMarket: string;
  largestTrade: number;
  accountAgeDays: number;
  activeDays: number;
}

export interface Analysis {
  input: string;
  username: string;
  wallet: string;
  pfpUrl?: string;
  total: number;
  tier: Tier;
  percentile: number;
  breakdown: ScoreBreakdown;
  metrics: Metrics;
  timeline: TimelinePoint[];
  categories: CategoryShare[];
  strengths: string[];
  weaknesses: string[];
  recommendations: Recommendation[];
  sybil: SybilSignal;
  allocation: { conservative: number; likely: number; optimistic: number };
  /** Non-fatal data-source warnings (rate limit, partial data, etc). */
  warnings: string[];
  /** ISO timestamp when this snapshot was generated. */
  generatedAt: string;
  debug?: unknown;
}

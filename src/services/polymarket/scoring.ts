// Airdrop readiness scoring engine.
// Pure functions — inputs are normalized metrics, outputs are scores + insights.

import type {
  Analysis,
  CategoryShare,
  Metrics,
  Recommendation,
  ScoreBreakdown,
  SybilSignal,
  Tier,
  Trade,
} from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

export const WEIGHTS = {
  volume: 0.15,
  activity: 0.2,
  diversity: 0.1,
  profitability: 0.1,
  loyalty: 0.1,
  rewards: 0.15,
  balance: 0.1,
  sponsoredMakerRewards: 0.1,
} as const;

export function tierFor(score: number): Tier {
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  if (score >= 35) return "C";
  return "D";
}

export function nextTier(t: Tier): Tier {
  const order: Tier[] = ["D", "C", "B", "A", "S"];
  const i = order.indexOf(t);
  return i < 0 || i === order.length - 1 ? "S" : order[i + 1];
}

function herfindahl(shares: CategoryShare[]): number {
  const total = shares.reduce((s, c) => s + c.pct, 0) || 100;
  return shares.reduce((s, c) => s + Math.pow(c.pct / total, 2), 0);
}

export function computeBreakdown(
  m: Pick<Metrics, "totalVolume" | "activeDays" | "accountAgeDays" | "markets" | "pnl" | "liquidityRewards" | "cashBalance" | "sponsoredRewards" | "makerRebate">,
  categories: CategoryShare[],
): ScoreBreakdown {
  const volume = round((Math.log10(Math.max(1, m.totalVolume)) / Math.log10(250_000)) * 100);
  const activity = round(clamp01(m.activeDays / 180) * 60 + clamp01(m.accountAgeDays / 365) * 40);
  const uniq = clamp01(m.markets / 50) * 50;
  const hhi = herfindahl(categories);
  const diversity = round(uniq + (1 - hhi) * 50);
  const pnlRatio = m.totalVolume > 0 ? m.pnl / m.totalVolume : 0;
  const profitability = round(((Math.tanh(pnlRatio * 5) + 1) / 2) * 100);
  const loyalty = round(clamp01(m.accountAgeDays / 540) * 60 + clamp01(m.activeDays / 365) * 40);
  
  // 100 score at $500 total liquidity rewards earned
  const rewards = round((Math.log10(Math.max(1, m.liquidityRewards || 0)) / Math.log10(500)) * 100);
  // 100 score at $10,000 wallet balance (USDC/portfolio value)
  const balance = round((Math.log10(Math.max(1, m.cashBalance || 0)) / Math.log10(10_000)) * 100);
  // 100 score at $500 total sponsored & maker rewards earned
  const sponsoredMakerRewards = round(
    (Math.log10(Math.max(1, (m.sponsoredRewards || 0) + (m.makerRebate || 0))) / Math.log10(500)) * 100
  );

  return { volume, activity, diversity, profitability, loyalty, rewards, balance, sponsoredMakerRewards };
}

export function totalFromBreakdown(b: ScoreBreakdown): number {
  return round(
    b.volume * WEIGHTS.volume +
      b.activity * WEIGHTS.activity +
      b.diversity * WEIGHTS.diversity +
      b.profitability * WEIGHTS.profitability +
      b.loyalty * WEIGHTS.loyalty +
      b.rewards * WEIGHTS.rewards +
      b.balance * WEIGHTS.balance +
      b.sponsoredMakerRewards * WEIGHTS.sponsoredMakerRewards,
  );
}

export function detectSybil(
  m: Pick<Metrics, "accountAgeDays" | "markets" | "activeDays" | "totalVolume">,
  categories: CategoryShare[],
  trades: Trade[],
): SybilSignal {
  let score = 0;
  const reasons: string[] = [];

  if (m.accountAgeDays > 0 && m.accountAgeDays < 30) {
    score += 25;
    reasons.push("Wallet less than 30 days old");
  }
  if (m.markets > 0 && m.markets < 8) {
    score += 20;
    reasons.push("Active in very few unique markets");
  }
  if (categories[0]?.pct >= 70) {
    score += 18;
    reasons.push(`Volume heavily concentrated in ${categories[0].name}`);
  }
  if (m.activeDays > 0 && m.activeDays < 5 && m.totalVolume > 1000) {
    score += 22;
    reasons.push("Significant volume packed into very few days");
  }

  // Single-day volume concentration
  if (trades.length > 0 && m.totalVolume > 0) {
    const byDay = new Map<string, number>();
    for (const t of trades) {
      if (t.type !== "TRADE") continue;
      const day = new Date(t.timestamp * 1000).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + t.usdcSize);
    }
    const maxDay = Math.max(0, ...byDay.values());
    if (maxDay / m.totalVolume > 0.6 && byDay.size > 1) {
      score += 15;
      reasons.push("Over 60% of lifetime volume on a single day");
    }

    // Repetitive trade-size variance check
    const sizes = trades.filter((t) => t.type === "TRADE").map((t) => t.usdcSize);
    if (sizes.length >= 10) {
      const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const variance = sizes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sizes.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      if (cv < 0.15) {
        score += 12;
        reasons.push("Trade sizes are unusually uniform");
      }
    }
  }

  if (reasons.length === 0) reasons.push("Natural distribution across markets and time");
  score = Math.min(100, score);
  const level = score < 25 ? "Low" : score < 55 ? "Medium" : "High";
  return { score, level, reasons };
}

export function buildStrengthsWeaknesses(b: ScoreBreakdown): {
  strengths: string[];
  weaknesses: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const push = (k: keyof ScoreBreakdown, strong: string, weak: string) => {
    if (b[k] >= 70) strengths.push(strong);
    else if (b[k] < 45) weaknesses.push(weak);
  };
  push("volume", "Strong lifetime trading volume", "Below-average trading volume");
  push("activity", "Consistent trading cadence", "Low recent activity");
  push("diversity", "Wide spread across categories", "Limited category exposure");
  push("profitability", "Profitable track record", "Inconsistent profitability");
  push("loyalty", "Long-tenured Polymarket user", "Relatively new account");
  return { strengths, weaknesses };
}

export function buildRecommendations(m: Metrics, categories: CategoryShare[]): Recommendation[] {
  return [
    {
      label: "Lift lifetime volume",
      current: m.totalVolume,
      target: Math.max(m.totalVolume + 5_000, Math.round(m.totalVolume * 1.4 + 2_500)),
      unit: "$",
    },
    {
      label: "Trade more unique markets",
      current: m.markets,
      target: m.markets + Math.max(10, Math.round(m.markets * 0.5)),
      unit: "markets",
    },
    {
      label: "Add active trading days",
      current: m.activeDays,
      target: m.activeDays + Math.max(8, Math.round(m.activeDays * 0.3)),
      unit: "days",
    },
    {
      label: "Diversify across categories",
      current: categories.filter((c) => c.pct >= 8).length,
      target: 6,
      unit: "categories",
    },
  ];
}

export function percentileFromScore(total: number): number {
  return Math.max(1, Math.min(99, Math.round(100 - total * 0.95)));
}

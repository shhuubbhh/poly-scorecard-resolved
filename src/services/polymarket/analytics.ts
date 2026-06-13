// Pure derivation of dashboard metrics from raw Polymarket data.

import { ALL_CATEGORIES } from "./categories";
import type { CategoryShare, Metrics, Position, Profile, TimelinePoint, Trade } from "./types";

const DAY = 86_400;

export function computeTrading(
  trades: Trade[],
  positions: Position[],
  tradedMarkets: number,
  portfolioValue: number,
): Metrics & { dailyVolume: Map<string, number>; categoryVolume: Map<string, number> } {
  const tradeEvents = trades.filter((t) => t.type === "TRADE" && t.usdcSize > 0);

  const summedVolume = tradeEvents.reduce((s, t) => s + t.usdcSize, 0);
  const totalVolume = summedVolume;
  const totalTrades = tradeEvents.length;

  const marketSet = new Set<string>();
  const dailyVolume = new Map<string, number>();
  const categoryVolume = new Map<string, number>();
  const pnlByMarket = new Map<string, { title: string; pnl: number }>();
  const dayBucket = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

  let largest = 0;
  let firstSeen = Infinity;
  let lastSeen = 0;
  const activeDaySet = new Set<string>();

  for (const t of tradeEvents) {
    if (t.conditionId) marketSet.add(t.conditionId);
    largest = Math.max(largest, t.usdcSize);
    if (t.timestamp) {
      firstSeen = Math.min(firstSeen, t.timestamp);
      lastSeen = Math.max(lastSeen, t.timestamp);
      const day = dayBucket(t.timestamp);
      activeDaySet.add(day);
      dailyVolume.set(day, (dailyVolume.get(day) ?? 0) + t.usdcSize);
    }
    categoryVolume.set(t.category, (categoryVolume.get(t.category) ?? 0) + t.usdcSize);

    if (typeof t.pnl === "number" && t.conditionId) {
      const ex = pnlByMarket.get(t.conditionId) ?? {
        title: t.marketTitle ?? t.conditionId,
        pnl: 0,
      };
      ex.pnl += t.pnl;
      ex.title = ex.title || (t.marketTitle ?? t.conditionId);
      pnlByMarket.set(t.conditionId, ex);
    }
  }

  // Fold positions into market set and PnL aggregates.
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  for (const p of positions) {
    if (p.conditionId) marketSet.add(p.conditionId);
    realizedPnl += p.realizedPnl || 0;
    const unrl = (p.curPrice - p.avgPrice) * p.size;
    unrealizedPnl += Number.isFinite(unrl) ? unrl : 0;
    if (p.conditionId) {
      const ex = pnlByMarket.get(p.conditionId) ?? {
        title: p.marketTitle ?? p.conditionId,
        pnl: 0,
      };
      ex.pnl += (p.realizedPnl || 0) + (Number.isFinite(unrl) ? unrl : 0);
      pnlByMarket.set(p.conditionId, ex);
    }
  }

  // If trade-level PnL was unavailable, fall back to position-derived totals.
  if (realizedPnl === 0) {
    for (const t of tradeEvents) if (typeof t.pnl === "number") realizedPnl += t.pnl;
  }
  const pnl = realizedPnl + unrealizedPnl;

  // Win rate from non-zero realised-PnL markets.
  const finished = [...pnlByMarket.values()].filter((m) => m.pnl !== 0);
  const winRate = finished.length
    ? Math.round((finished.filter((m) => m.pnl > 0).length / finished.length) * 1000) / 10
    : 0;

  let best = { title: "—", pnl: -Infinity };
  let worst = { title: "—", pnl: Infinity };
  for (const m of pnlByMarket.values()) {
    if (m.pnl > best.pnl) best = m;
    if (m.pnl < worst.pnl) worst = m;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const accountAgeDays = (() => {
    const candidates = [firstSeen, Infinity].filter(Number.isFinite);
    if (!candidates.length) return 0;
    const first = Math.min(...candidates);
    return Math.max(0, Math.round((nowSec - first) / DAY));
  })();

  return {
    totalVolume: Math.round(totalVolume),
    totalTrades,
    markets: Math.max(marketSet.size, tradedMarkets),
    avgPosition: totalTrades > 0 ? Math.round(totalVolume / totalTrades) : 0,
    winRate,
    pnl: Math.round(pnl),
    realizedPnl: Math.round(realizedPnl),
    unrealizedPnl: Math.round(unrealizedPnl),
    portfolioValue: Math.round(portfolioValue),
    bestMarket: best.title === "—" ? "—" : best.title,
    worstMarket: worst.title === "—" || worst.pnl === best.pnl ? "—" : worst.title,
    largestTrade: Math.round(largest),
    accountAgeDays,
    activeDays: activeDaySet.size,
    dailyVolume,
    categoryVolume,
  };
}

export function buildTimeline(dailyVolume: Map<string, number>, days = 30): TimelinePoint[] {
  const out: TimelinePoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const vol = dailyVolume.get(key) ?? 0;
    out.push({
      date: key.slice(5),
      volume: Math.round(vol),
      trades: 0, // optional, not surfaced in current UI
    });
  }
  return out;
}

export function buildCategoryShares(categoryVolume: Map<string, number>): CategoryShare[] {
  const total = [...categoryVolume.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) {
    return ALL_CATEGORIES.slice(0, 4).map((name) => ({ name, pct: 0 }));
  }
  const raw = ALL_CATEGORIES.map((name) => ({
    name,
    pct: Math.round(((categoryVolume.get(name) ?? 0) / total) * 100),
  }))
    .filter((c) => c.pct > 0)
    .sort((a, b) => b.pct - a.pct);
  return raw.length ? raw : [{ name: "Other", pct: 100 }];
}

/** Convenience: combine account-age computation with createdAt fallback. */
export function effectiveAccountAge(metricsAge: number, profile: Profile): number {
  if (profile.createdAt) {
    const age = Math.floor((Date.now() / 1000 - profile.createdAt) / DAY);
    return Math.max(metricsAge, age);
  }
  return metricsAge;
}

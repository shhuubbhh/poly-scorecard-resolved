import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveWallet } from "@/services/polymarket/profile";
import { fetchAllActivity } from "@/services/polymarket/activity";
import { MAX_TRADES } from "@/services/polymarket/activity";
import { fetchSponsoredRewards } from "@/services/polymarket/sponsored";
import {
  fetchPortfolioValue,
  fetchPositions,
  fetchTradedMarkets,
  fetchLeaderboardStats,
  fetchOnChainCashBalance,
} from "@/services/polymarket/positions";
import {
  buildCategoryShares,
  buildTimeline,
  computeTrading,
  effectiveAccountAge,
} from "@/services/polymarket/analytics";
import {
  buildRecommendations,
  buildStrengthsWeaknesses,
  computeBreakdown,
  detectSybil,
  percentileFromScore,
  tierFor,
  totalFromBreakdown,
} from "@/services/polymarket/scoring";
import { NotFoundError } from "@/services/polymarket/http";
import type { Analysis } from "@/services/polymarket/types";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input.toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function performWalletAnalysis(input: string): Promise<Analysis> {
  const warnings: string[] = [];

  let profile;
  try {
    profile = await resolveWallet(input);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new Error(`USER_NOT_FOUND:${input}`);
    }
    throw err;
  }

  const address = profile.address;
  const walletUsedForAnalysis = profile.proxyWallet || address;

  if (profile.warning) {
    warnings.push(profile.warning);
  }

  const [activitySettled, positionsSettled, valueSettled, tradedSettled, leaderboardSettled, sponsoredSettled, cashSettled] =
    await Promise.allSettled([
      fetchAllActivity(walletUsedForAnalysis),
      fetchPositions(walletUsedForAnalysis),
      fetchPortfolioValue(walletUsedForAnalysis),
      fetchTradedMarkets(walletUsedForAnalysis),
      fetchLeaderboardStats(walletUsedForAnalysis),
      fetchSponsoredRewards(walletUsedForAnalysis),
      fetchOnChainCashBalance(walletUsedForAnalysis),
    ]);

  const trades = activitySettled.status === "fulfilled" ? activitySettled.value : [];
  const positions = positionsSettled.status === "fulfilled" ? positionsSettled.value : [];
  const positionsValue = valueSettled.status === "fulfilled" ? valueSettled.value : 0;
  const tradedVolume = tradedSettled.status === "fulfilled" ? tradedSettled.value : 0;
  const leaderboard = leaderboardSettled.status === "fulfilled" ? leaderboardSettled.value : null;
  const sponsoredRewards = sponsoredSettled.status === "fulfilled" ? sponsoredSettled.value : 0;
  const cashBalance = cashSettled.status === "fulfilled" ? cashSettled.value : 0;

  if (activitySettled.status === "rejected")
    warnings.push("Activity data partially unavailable.");
  if (positionsSettled.status === "rejected") warnings.push("Positions data unavailable.");
  if (valueSettled.status === "rejected") warnings.push("Portfolio value unavailable.");
  if (tradedSettled.status === "rejected") warnings.push("Lifetime market count unavailable.");
  if (sponsoredSettled.status === "rejected") warnings.push("Sponsored dashboard data unavailable.");
  if (cashSettled.status === "rejected") warnings.push("On-chain cash balance unavailable.");
  if (trades.length >= MAX_TRADES) {
    warnings.push(
      "Trade history is limited to the latest 4,000 fills by Polymarket's public API.",
    );
  }

  const tradingRaw = computeTrading(trades, positions, tradedVolume, positionsValue, cashBalance);
  if (leaderboard) {
    tradingRaw.totalVolume = Math.round(leaderboard.vol);
    tradingRaw.pnl = Math.round(leaderboard.pnl);
    tradingRaw.avgPosition = tradingRaw.totalTrades > 0 ? Math.round(leaderboard.vol / tradingRaw.totalTrades) : 0;
  }
  const accountAgeDays = effectiveAccountAge(tradingRaw.accountAgeDays, profile);
  const categories = buildCategoryShares(tradingRaw.categoryVolume);
  const timeline = buildTimeline(tradingRaw.dailyVolume, 30);

  const metrics = {
    totalVolume: tradingRaw.totalVolume,
    totalTrades: tradingRaw.totalTrades,
    markets: tradingRaw.markets,
    avgPosition: tradingRaw.avgPosition,
    winRate: tradingRaw.winRate,
    pnl: tradingRaw.pnl,
    realizedPnl: tradingRaw.realizedPnl,
    unrealizedPnl: tradingRaw.unrealizedPnl,
    portfolioValue: tradingRaw.portfolioValue,
    bestMarket: tradingRaw.bestMarket,
    worstMarket: tradingRaw.worstMarket,
    largestTrade: tradingRaw.largestTrade,
    accountAgeDays,
    activeDays: tradingRaw.activeDays,
    liquidityRewards: tradingRaw.liquidityRewards,
    makerRebate: tradingRaw.makerRebate,
    takerRebate: tradingRaw.takerRebate,
    referralRewards: tradingRaw.referralRewards,
    sponsoredRewards,
    cashBalance: tradingRaw.cashBalance,
  };

  const breakdown = computeBreakdown(metrics, categories);
  const total = totalFromBreakdown(breakdown);
  const tier = tierFor(total);
  const sybil = detectSybil(metrics, categories, trades);
  const { strengths, weaknesses } = buildStrengthsWeaknesses(breakdown);
  const recommendations = buildRecommendations(metrics, categories);

  const analysis: Analysis = {
    input,
    username: profile.displayUsername || profile.username || address.slice(0, 6),
    wallet: address,
    pfpUrl: profile.pfpUrl,
    total,
    tier,
    percentile: percentileFromScore(total),
    breakdown,
    metrics,
    timeline,
    categories,
    strengths,
    weaknesses,
    recommendations,
    sybil,
    warnings,
    generatedAt: new Date().toISOString(),
    debug: profile.debug
      ? {
          ...profile.debug,
          marketsCount: metrics.markets,
          tradesCount: metrics.totalTrades,
        }
      : undefined,
  };

  // Persist anonymized snapshot for leaderboard (best-effort).
  try {
    const hash = await sha256Hex(address);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wallet_snapshots").upsert(
      {
        wallet_hash: hash,
        username: profile.username ?? null,
        score: total,
        tier,
        volume: metrics.totalVolume,
        trades: metrics.totalTrades,
        markets: metrics.markets,
        active_days: metrics.activeDays,
        diversity_score: breakdown.diversity,
        activity_score: breakdown.activity,
        maker_rebate: metrics.makerRebate,
        liquidity_rewards: metrics.liquidityRewards,
        sponsored_rewards: metrics.sponsoredRewards,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet_hash" },
    );
  } catch (err) {
    console.warn("[polyscore] leaderboard upsert failed", err);
  }

  return analysis;
}

export const getWalletAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: { input: string }) =>
    z.object({ input: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }): Promise<Analysis> => {
    return performWalletAnalysis(data.input);
  });

const SORT_FIELDS = ["score", "volume", "active_days", "diversity_score", "maker_rebate", "liquidity_rewards", "sponsored_rewards"] as const;
type SortField = (typeof SORT_FIELDS)[number];

export interface LeaderboardEntry {
  wallet_hash: string;
  username: string | null;
  score: number;
  tier: string;
  volume: number;
  trades: number;
  markets: number;
  active_days: number;
  diversity_score: number;
  activity_score: number;
  maker_rebate: number;
  liquidity_rewards: number;
  sponsored_rewards: number;
}

export const getLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((input: { sort?: SortField; limit?: number } | undefined) =>
    z
      .object({
        sort: z.enum(SORT_FIELDS).default("score"),
        limit: z.number().int().min(1).max(100).default(25),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<LeaderboardEntry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("wallet_snapshots")
      .select(
        "wallet_hash, username, score, tier, volume, trades, markets, active_days, diversity_score, activity_score, maker_rebate, liquidity_rewards, sponsored_rewards",
      )
      .order(data.sort, { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeaderboardEntry[];
  });

export interface SearchResult {
  entry: LeaderboardEntry;
  ranks: Record<SortField, number>;
}

export const searchLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) =>
    z.object({ query: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }): Promise<SearchResult | null> => {
    const q = data.query.trim().toLowerCase();
    if (!q) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Find the entry by username or wallet_hash
    let queryBuilder = supabaseAdmin.from("wallet_snapshots").select("*");
    let isAddressSearch = q.startsWith("0x") && q.length === 42;
    let resolvedHash = "";
    if (isAddressSearch) {
      resolvedHash = await sha256Hex(q);
      queryBuilder = queryBuilder.eq("wallet_hash", resolvedHash);
    } else {
      const usernameClean = q.replace(/^@/, "");
      queryBuilder = queryBuilder.ilike("username", usernameClean);
    }

    let { data: rows, error } = await queryBuilder.limit(1);

    // If not found in database, automatically perform wallet analysis to create the entry!
    if (!rows || rows.length === 0) {
      try {
        console.log(`[polyscore] User "${q}" not found in snapshot DB, triggering dynamic on-the-fly analysis...`);
        const analysis = await performWalletAnalysis(q);
        
        // Re-query the database to get the newly upserted entry
        const hashToQuery = isAddressSearch ? resolvedHash : await sha256Hex(analysis.wallet);
        const { data: newRows } = await supabaseAdmin
          .from("wallet_snapshots")
          .select("*")
          .eq("wallet_hash", hashToQuery)
          .limit(1);
          
        if (newRows && newRows.length > 0) {
          rows = newRows;
        }
      } catch (err) {
        console.error(`[polyscore] Dynamic analysis for "${q}" failed:`, err);
        return null;
      }
    }

    if (error || !rows || rows.length === 0) return null;
    const entry = rows[0] as LeaderboardEntry;

    // 2. Calculate ranks for all sort fields
    const ranks = {} as Record<SortField, number>;
    for (const field of SORT_FIELDS) {
      const val = entry[field];
      const { count } = await supabaseAdmin
        .from("wallet_snapshots")
        .select("*", { count: "exact", head: true })
        .gt(field, val);
      
      ranks[field] = (count ?? 0) + 1;
    }

    return { entry, ranks };
  });

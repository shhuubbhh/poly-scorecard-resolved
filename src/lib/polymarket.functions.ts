import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "crypto";

import { resolveWallet, getProfileByAddress } from "@/services/polymarket/profile";
import { fetchAllActivity } from "@/services/polymarket/activity";
import { MAX_TRADES } from "@/services/polymarket/activity";
import { fetchSponsoredRewards, fetchAllSponsors } from "@/services/polymarket/sponsored";
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

  // Query BetMoar stats for enrichment
  let betMoarData: any = null;
  try {
    const res = await fetch(`https://www.betmoar.fun/api/profile-stats?user=${walletUsedForAnalysis}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (res.ok) {
      betMoarData = await res.json();
    }
  } catch (err) {
    console.warn("[polyscore] failed to fetch BetMoar stats", err);
  }

  const feesPaid = betMoarData?.feeSummary?.totalFeesPaid ?? 0;
  const lpRewards = betMoarData?.stats?.lpRewards ?? Math.max(tradingRaw.liquidityRewards, sponsoredRewards);
  const makerRebate = betMoarData?.stats?.makerRebates ?? tradingRaw.makerRebate;
  const sponsored = betMoarData?.stats?.sponsoredRewards ?? sponsoredRewards;
  
  const rawPortfolioVal = betMoarData?.stats?.portfolioValue ?? tradingRaw.portfolioValue;
  const rawCashBalance = betMoarData?.stats?.usdcBalance ?? tradingRaw.cashBalance;
  const totalAssets = rawPortfolioVal + rawCashBalance;

  const metrics = {
    totalVolume: betMoarData?.stats?.totalVolume ?? tradingRaw.totalVolume,
    totalTrades: tradingRaw.totalTrades,
    markets: tradingRaw.markets,
    avgPosition: tradingRaw.avgPosition,
    winRate: tradingRaw.winRate,
    pnl: betMoarData?.stats?.overallPNL ?? tradingRaw.pnl,
    realizedPnl: tradingRaw.realizedPnl,
    unrealizedPnl: tradingRaw.unrealizedPnl,
    portfolioValue: totalAssets, // Account Balance card displays total assets!
    bestMarket: tradingRaw.bestMarket,
    worstMarket: tradingRaw.worstMarket,
    largestTrade: tradingRaw.largestTrade,
    accountAgeDays,
    activeDays: tradingRaw.activeDays,
    liquidityRewards: lpRewards,
    makerRebate: makerRebate,
    takerRebate: tradingRaw.takerRebate,
    referralRewards: tradingRaw.referralRewards,
    sponsoredRewards: sponsored,
    cashBalance: rawCashBalance,
    feesPaid,
    totalAssets
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
  updated_at: string;
  address?: string;
}

export const getLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((input: { sort?: SortField; page?: number; limit?: number } | undefined) =>
    z
      .object({
        sort: z.enum(SORT_FIELDS).default("maker_rebate"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(100),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<LeaderboardEntry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sort, page, limit } = data;

    if (sort === "liquidity_rewards" || sort === "sponsored_rewards") {
      const sponsors = await fetchAllSponsors();
      
      // Sort list by the chosen metric
      const sortedSponsors = [...sponsors].sort((a, b) => {
        if (sort === "liquidity_rewards") {
          return (b.net || 0) - (a.net || 0);
        } else {
          return (b.sponsored || 0) - (a.sponsored || 0);
        }
      });

      // Slice the list based on page/limit
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const slice = sortedSponsors.slice(startIndex, endIndex);

      if (slice.length === 0) return [];

      // Compute wallet hashes to query DB in one batch
      const hashToAddress = new Map<string, string>();
      const hashes = slice.map((item) => {
        const addr = item.address.toLowerCase();
        const hash = crypto.createHash("sha256").update(addr).digest("hex");
        hashToAddress.set(hash, addr);
        return hash;
      });

      // Fetch existing snapshots in one query
      const { data: dbRows } = await supabaseAdmin
        .from("wallet_snapshots")
        .select("wallet_hash, username, tier, score, volume, trades, markets, active_days, diversity_score, activity_score, maker_rebate, liquidity_rewards, sponsored_rewards, updated_at")
        .in("wallet_hash", hashes);

      const dbRowMap = new Map(dbRows?.map((r) => [r.wallet_hash, r]) ?? []);

      // Resolve usernames/profiles in parallel for this slice
      const entries: LeaderboardEntry[] = await Promise.all(
        slice.map(async (item, i) => {
          const hash = hashes[i];
          const address = item.address.toLowerCase();
          const dbRow = dbRowMap.get(hash);

          let username = dbRow?.username || null;
          if (!username) {
            try {
              // Quick on-the-fly fetch for missing usernames
              const profile = await getProfileByAddress(address);
              username = profile.username || null;
            } catch (err) {
              // Ignore profile resolution errors, fallback to null/address
            }
          }

          return {
            wallet_hash: hash,
            username,
            score: dbRow?.score ?? 0,
            tier: dbRow?.tier ?? "D",
            volume: dbRow?.volume ?? 0,
            trades: dbRow?.trades ?? 0,
            markets: dbRow?.markets ?? 0,
            active_days: dbRow?.active_days ?? 0,
            diversity_score: dbRow?.diversity_score ?? 0,
            activity_score: dbRow?.activity_score ?? 0,
            maker_rebate: dbRow?.maker_rebate ?? 0,
            liquidity_rewards: item.net,
            sponsored_rewards: item.sponsored,
            updated_at: dbRow?.updated_at ?? new Date().toISOString(),
            address,
          };
        }),
      );

      return entries;
    }

    // Default db pagination fallback (for maker_rebate, score, volume, active_days, diversity_score)
    const offset = (page - 1) * limit;
    let query = supabaseAdmin
      .from("wallet_snapshots")
      .select(
        "wallet_hash, username, score, tier, volume, trades, markets, active_days, diversity_score, activity_score, maker_rebate, liquidity_rewards, sponsored_rewards, updated_at",
      );

    if (sort === "maker_rebate") {
      query = query.gte("maker_rebate", 1);
    }

    const { data: rows, error } = await query
      .order(sort, { ascending: false })
      .range(offset, offset + limit - 1);

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
    let resolvedAddress = "";

    if (isAddressSearch) {
      resolvedAddress = q;
      resolvedHash = crypto.createHash("sha256").update(q).digest("hex");
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
        resolvedAddress = analysis.wallet;
        
        // Re-query the database to get the newly upserted entry
        const hashToQuery = isAddressSearch ? resolvedHash : crypto.createHash("sha256").update(analysis.wallet.toLowerCase()).digest("hex");
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
    } else {
      // Check if the snapshot is older than 5 minutes, and if so, trigger a re-analysis to update it
      const entry = rows[0] as LeaderboardEntry;
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
      const updatedAt = new Date(entry.updated_at || 0);
      if (updatedAt < fiveMinutesAgo) {
        try {
          console.log(`[polyscore] Snapshot for "${q}" is older than 5 minutes, triggering dynamic re-analysis to update it...`);
          const analysis = await performWalletAnalysis(entry.username || q);
          resolvedAddress = analysis.wallet;
          
          // Re-query the database to get the updated entry
          const hashToQuery = entry.wallet_hash;
          const { data: newRows } = await supabaseAdmin
            .from("wallet_snapshots")
            .select("*")
            .eq("wallet_hash", hashToQuery)
            .limit(1);
            
          if (newRows && newRows.length > 0) {
            rows = newRows;
          }
        } catch (err) {
          console.error(`[polyscore] Dynamic re-analysis for "${q}" failed:`, err);
        }
      }
    }

    if (error || !rows || rows.length === 0) return null;
    const entry = rows[0] as LeaderboardEntry;

    // Resolve address if not already known
    if (!resolvedAddress) {
      if (entry.username) {
        try {
          const profile = await resolveWallet(entry.username);
          resolvedAddress = profile.address;
        } catch (err) {
          // ignore
        }
      }
    }

    // 2. Fetch global sponsors list to calculate exact global ranks for LP & Sponsored rewards
    const sponsors = await fetchAllSponsors();
    const cleanAddr = resolvedAddress.toLowerCase();

    // Calculate LP rewards rank
    const lpSorted = [...sponsors].sort((a, b) => (b.net || 0) - (a.net || 0));
    const lpIndex = lpSorted.findIndex((s) => s.address.toLowerCase() === cleanAddr);
    const lpRank = lpIndex !== -1 ? lpIndex + 1 : sponsors.length + 1;
    const lpVal = lpIndex !== -1 ? lpSorted[lpIndex].net : 0;

    // Calculate Sponsored rewards rank
    const spSorted = [...sponsors].sort((a, b) => (b.sponsored || 0) - (a.sponsored || 0));
    const spIndex = spSorted.findIndex((s) => s.address.toLowerCase() === cleanAddr);
    const spRank = spIndex !== -1 ? spIndex + 1 : sponsors.length + 1;
    const spVal = spIndex !== -1 ? spSorted[spIndex].sponsored : 0;

    // Override the DB values with the live global ones
    entry.liquidity_rewards = lpVal;
    entry.sponsored_rewards = spVal;
    if (resolvedAddress) {
      entry.address = resolvedAddress;
    }

    // 3. Calculate ranks for all sort fields
    const ranks = {} as Record<SortField, number>;
    for (const field of SORT_FIELDS) {
      if (field === "liquidity_rewards") {
        ranks[field] = lpRank;
      } else if (field === "sponsored_rewards") {
        ranks[field] = spRank;
      } else {
        const val = entry[field];
        const { count } = await supabaseAdmin
          .from("wallet_snapshots")
          .select("*", { count: "exact", head: true })
          .gt(field, val);
        
        ranks[field] = (count ?? 0) + 1;
      }
    }

    return { entry, ranks };
  });


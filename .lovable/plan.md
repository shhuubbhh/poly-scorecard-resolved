## Goal

Replace the deterministic mock analytics in PolyScope with live Polymarket data, fronted by a typed service layer, cached via TanStack Query, and persisted (anonymized) in Lovable Cloud for leaderboards.

## Polymarket API surface (public, no key)

- `https://gamma-api.polymarket.com/profiles?address={addr}` — username/handle/pfp/createdAt
- `https://data-api.polymarket.com/positions?user={addr}&limit=...` — open positions (size, avgPrice, curPrice, realizedPnl, cashPnl, market info, eventSlug)
- `https://data-api.polymarket.com/activity?user={addr}&limit=500&offset=...` — trades/redemptions/splits/merges with `timestamp`, `usdcSize`, `side`, `market`, `eventSlug`, category tags
- `https://data-api.polymarket.com/value?user={addr}` — current portfolio USD value
- `https://data-api.polymarket.com/traded?user={addr}` — lifetime traded volume
- `https://gamma-api.polymarket.com/events?slug={slug}` — category enrichment when needed

All called server-side via `createServerFn` to avoid CORS, with caching and paging.

## Architecture

```text
Browser (Route /wallet/$id)
  └─ useSuspenseQuery(walletQueryOptions(id))
        └─ createServerFn: getWalletAnalysis(input)
              ├─ services/polymarket/profile.ts   → resolveWallet(input)
              ├─ services/polymarket/activity.ts  → fetchAllActivity(addr)
              ├─ services/polymarket/positions.ts → fetchPositions(addr), fetchPortfolioValue
              ├─ services/polymarket/analytics.ts → trading/activity/diversity metrics
              ├─ services/polymarket/scoring.ts   → breakdown + total + tier + sybil + recs
              └─ persist anonymized snapshot → Supabase (leaderboard)
```

## Files to create / change

**New service layer** (pure, server-safe, no React):

- `src/services/polymarket/http.ts` — fetch wrapper: timeout, retry w/ backoff on 429/5xx, JSON parse, typed errors (`PolymarketError`, `NotFoundError`, `RateLimitError`).
- `src/services/polymarket/profile.ts` — `resolveWallet(input)` (accepts `0x…` or `@username`; username→address via `/profiles?username=`), `getProfile(address)`.
- `src/services/polymarket/activity.ts` — `fetchAllActivity(address)` paginates `/activity` until exhausted or 2k cap; returns normalized `Trade[]`.
- `src/services/polymarket/positions.ts` — `fetchPositions`, `fetchPortfolioValue`, `fetchTradedVolume`.
- `src/services/polymarket/categories.ts` — slug/tag → category map (Politics, Crypto, Sports, Economics, Tech, World, Other).
- `src/services/polymarket/analytics.ts` — `computeTrading`, `computeActivity`, `computeDiversity`, `buildTimeline(30d)`.
- `src/services/polymarket/scoring.ts` — `score(metrics) → { total, tier, breakdown, sybil, strengths, weaknesses, recommendations }` per spec weights (30/25/20/15/10). Exports `recompute(metrics, delta)` for what-if.
- `src/services/polymarket/types.ts` — shared TS types.

**Server fns** (`src/lib/polymarket.functions.ts`):

- `getWalletAnalysis({ input })` — orchestrates above, returns serializable `Analysis` DTO. Persists anonymized snapshot (sha256 of address) via admin client.
- `getLeaderboard({ sort })` — reads top N from `wallet_snapshots`.

**Lovable Cloud (Supabase)**:

- Enable Cloud. Migration creates `wallet_snapshots` (wallet_hash unique, score, volume, trades, diversity_score, activity_score, tier, updated_at) with RLS (public SELECT, no INSERT from clients; writes only via service role inside server fn). Grants per template rules.

**Routes / UI**:

- `src/routes/wallet.$id.tsx` — switch to `ensureQueryData` + `useSuspenseQuery`, add `pendingComponent` (skeleton), `errorComponent`, `notFoundComponent`. Wire what-if simulator to `recompute` (client-side, no refetch).
- `src/routes/leaderboard.tsx` — new route, four tabs (Readiness/Volume/Active/Diversity).
- `src/routes/index.tsx` — add link to leaderboard + disclaimer footer.
- Add disclaimer banner component reused on dashboard + landing footer.
- Delete `src/lib/analytics.ts` mock (kept types moved into service layer).

**Caching**:

- Route loader uses `ensureQueryData` with `staleTime: 5 min`, `gcTime: 30 min`.
- HTTP layer in-memory memoization per server invocation for activity pages.

## Scoring formulas (in `scoring.ts`)

- volume: `clamp01(log10(max(1,totalVolume))/log10(250_000)) * 100`
- activity: `clamp01(activeDays/180)*60 + clamp01(ageDays/365)*40`
- diversity: `clamp01(uniqueMarkets/50)*50 + (1 - HHI(categoryShares))*50`
- profitability: `(tanh((pnl/max(1,totalVolume))*5)+1)/2 * 100`
- loyalty: `clamp01(ageDays/540)*60 + clamp01(activeDays/365)*40`
- total = `v*.30 + a*.25 + d*.20 + p*.15 + l*.10`
- Tier: ≥88 S, ≥75 A, ≥60 B, ≥45 C, else D
- Sybil: additive penalties (recent age, low markets, single-category dominance, single-day volume concentration >60%, repetitive size variance).

## Error handling

- Invalid input → throw `notFound()` in server fn → `notFoundComponent`.
- Rate-limit/network → retry 3× then return partial `Analysis` w/ `error` field; route renders banner.
- Empty portfolio → render zero-state metrics, score still computed (likely D tier).

## Out of scope (kept stubs)

Telegram/Email alerts, watchlists, premium gating — `POLYMARKET_API_MAPPING.md` retains the PLANNED markers and gets updated with the now-LIVE endpoints.

## Confirm before I build

- OK to enable Lovable Cloud now (needed for leaderboard persistence)?
- OK to cap `/activity` paging at 2,000 trades per wallet (covers virtually all users; protects against abuse)?
- Keep username lookup best-effort (falls back to address-only if Gamma profile lookup misses)?

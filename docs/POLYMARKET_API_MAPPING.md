# Polymarket API Mapping

> Living document. Update this file whenever a new Polymarket endpoint is
> consumed, a metric formula changes, or the Supabase schema evolves.
> A new developer should be able to read this document alone and understand
> exactly how every PolyScope dashboard metric is produced — without reading
> the codebase.

**Status:** v2 — wallet identity, trades, positions, profile, portfolio value,
and market-count data are live. Sections marked _PLANNED_ remain future work.

---

## 1. Architecture Diagram

```text
                ┌─────────────────────────────────────┐
                │            Browser (React)          │
                │  routes/index.tsx                   │
                │  routes/wallet.$id.tsx              │
                │  components/dashboard/*             │
                └───────────────┬─────────────────────┘
                                │  useServerFn / useQuery
                                ▼
                ┌─────────────────────────────────────┐
                │     TanStack Start Server Fns       │
                │     src/lib/polymarket.functions.ts │
                │     - getWalletAnalysis             │
                │     - getLeaderboard                │
                └───────┬───────────────────┬─────────┘
                        │                   │
                        ▼                   ▼
        ┌──────────────────────┐   ┌───────────────────────┐
        │  Polymarket Public   │   │   Lovable Cloud        │
        │  APIs                │   │   (Supabase)           │
        │  - Data API          │   │   - cached_wallets     │
        │  - CLOB API          │   │   - wallet_snapshots   │
        │  - Gamma (markets)   │   │   - score_history      │
        │  - Subgraph (TheGraph)│  │   - watchlists         │
        └──────────────────────┘   └───────────────────────┘
                        │
                        ▼
                ┌─────────────────────────────────────┐
                │     Analytics Engine                │
                │     services/polymarket/            │
                │     analytics.ts + scoring.ts       │
                │     - normalize raw trades          │
                │     - compute breakdown + score     │
                │     - sybil heuristics              │
                │     - recommendations               │
                └─────────────────────────────────────┘
```

---

## 2. Data Flow Diagram

```text
User enters wallet/username
        │
        ▼
[Route /wallet/$id] ──► serverFn: getWalletAnalysis(input)
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
     resolveWallet()    fetchTrades()      fetchPositions()
     (Gamma search +    (Data API)         (Data API current
      public-profile)                       + closed positions)
            │                 │                  │
            └──────► merge + normalize ◄─────────┘
                              │
                              ▼
                     computeMetrics()
                     - totalVolume
                     - totalTrades
                     - activeDays
                     - winRate, pnl, …
                              │
                              ▼
                     computeBreakdown()
                     volume / activity / diversity /
                     profitability / loyalty  (0–100 each)
                              │
                              ▼
                     computeReadinessScore()
                     weighted sum → tier
                              │
                              ▼
                   sybilHeuristics() + recommendations()
                              │
                              ▼
                   Persist snapshot → wallet_snapshots
                              │
                              ▼
                       Return Analysis → UI
```

---

## 3. Polymarket Endpoints

All endpoints below are official public endpoints and require no authentication.
Base URLs are centralized in modules under `src/services/polymarket/`.

### 3.1 Gamma — Markets metadata

- **URL:** `https://gamma-api.polymarket.com/markets`
- **Method:** `GET`
- **Request Parameters:**
  - `limit` (int, default 100, max 500)
  - `offset` (int)
  - `active` (bool)
  - `closed` (bool)
  - `category` (string: Politics, Sports, Crypto, …)
- **Example Response (truncated):**
  ```json
  [
    {
      "id": "0x1234…",
      "question": "Will BTC close above $100k in 2025?",
      "category": "Crypto",
      "volume": 1284532.11,
      "liquidity": 84221.4,
      "endDate": "2025-12-31T23:59:59Z",
      "outcomes": ["Yes", "No"]
    }
  ]
  ```
- **Fields Used:** `id`, `question`, `category`, `endDate`, `volume`
- **Rate Limit Notes:** official `/markets` limit is 300 requests / 10 seconds.
  Cache responses for ≥5 minutes in `markets_cache`.

### 3.2 Data API — Wallet trades

- **URL:** `https://data-api.polymarket.com/trades`
- **Method:** `GET`
- **Request Parameters:**
  - `user` (wallet address, required)
  - `user` (canonical proxy wallet, required)
  - `limit` (documented max 10,000; PolyScope requests pages of 1,000)
  - `offset` (schema says max 10,000, but the live API rejects offsets above 3,000)
  - `takerOnly=false` (include both maker and taker fills)
- **Example Response:**
  ```json
  [
    {
      "proxyWallet": "0x4e8a…f12c",
      "conditionId": "0x1234…",
      "side": "BUY",
      "outcome": "Yes",
      "size": 250.0,
      "price": 0.62,
      "timestamp": 1714003200,
      "title": "Example market",
      "eventSlug": "example-event"
    }
  ]
  ```
- **Fields Used:** `proxyWallet`, `conditionId`, `side`, `size`, `price`,
  `timestamp`, `title`, `slug`, `eventSlug`, `outcome`. Trade notional is
  `size * price`.
- **Rate Limit Notes:** official limit is 200 requests / 10 seconds. The
  dashboard caches a completed analysis for five minutes and warns when the
  4,000-fill public-history window is reached.

### 3.3 Data API — Current and closed wallet positions

- **URL:** `https://data-api.polymarket.com/positions`
- **Method:** `GET`
- **URLs:** `/positions` and `/closed-positions`
- **Request Parameters:** `user` (canonical proxy wallet, required), `limit`,
  `offset`; current positions also use `sizeThreshold=0`. Closed positions are
  sorted by `TIMESTAMP DESC`.
- **Example Response:**
  ```json
  [
    {
      "conditionId": "0x1234…",
      "outcome": "Yes",
      "size": 80.0,
      "avgPrice": 0.54,
      "curPrice": 0.71,
      "currentValue": 56.8,
      "cashPnl": 13.6,
      "realizedPnl": 22.4
    }
  ]
  ```
- **Fields Used:** `conditionId`, `size`, `totalBought`, `avgPrice`, `curPrice`,
  `initialValue`, `currentValue`, `cashPnl`, `realizedPnl`, `title`,
  `eventSlug`, `outcome`.
- **Rate Limit Notes:** official limit is 150 requests / 10 seconds for each
  endpoint. Current positions allow 500 rows/page; closed positions allow 50.

### 3.4 Gamma — Canonical user profile resolution

- **URLs:** `https://gamma-api.polymarket.com/public-search` for usernames,
  then `https://gamma-api.polymarket.com/public-profile` for canonicalization
- **Method:** `GET`
- **Request Parameters:**
  - Search: `q`, `search_profiles=true`, `limit_per_type=20`
  - Profile: `address` (proxy wallet or user/signer address)
- **Example Response:**
  ```json
  {
    "proxyWallet": "0x4e8a…f12c",
    "name": "degen_alpha",
    "pseudonym": "Example-Pseudonym",
    "displayUsernamePublic": true,
    "createdAt": "2023-08-14T09:11:00Z"
  }
  ```
- **Fields Used:** `proxyWallet`, `name`, `pseudonym`,
  `displayUsernamePublic`, `profileImage`, `createdAt`.
- **Identity rule:** username search requires a case-insensitive **exact** match
  on `name` or `pseudonym`; partial search results are never accepted. Every
  match is then resolved through `/public-profile`, so entering a username,
  proxy wallet, or associated user address produces the same canonical proxy
  wallet and therefore the same statistics.
- **Rate Limit Notes:** `/public-search` is limited to 350 requests / 10
  seconds; Gamma general traffic is limited to 4,000 requests / 10 seconds.

### 3.5 Data API — Supporting aggregates

- **URLs:** `/value` and `/traded`
- **Method:** `GET`
- **Request Parameters:** `user` (canonical proxy wallet, required)
- **Example Responses:** `[ { "user": "0x…", "value": 1250.5 } ]` and
  `{ "user": "0x…", "traded": 83 }`
- **Fields Used:** `value` is current portfolio value; `traded` is the official
  count of distinct markets traded. **`traded` is not volume.**
- **Rate Limit Notes:** Data API general limit is 1,000 requests / 10 seconds.

### 3.6 Subgraph (The Graph) — Historical aggregates _(PLANNED, optional)_

- **URL:** `https://api.thegraph.com/subgraphs/name/polymarket/matic-markets`
- **Method:** `POST` (GraphQL)
- **Use:** backfill account age, lifetime volume when Data API pagination is
  too slow.
- **Rate Limit Notes:** 1000 req/day free tier; only used in background
  refresh jobs.

---

## 4. Dashboard Metric Definitions

All formulas are implemented in `src/services/polymarket/analytics.ts` and
`src/services/polymarket/scoring.ts`. Each metric lists the **source endpoint** that
provides its raw fields and the **calculation** applied.

### 4.1 Total Volume

- **Source Endpoint:** §3.2 `/trades`
- **Calculation:** `Sum(trade.size * trade.price)` across maker and taker fills.
- **Required Fields:** `size`, `price`, `timestamp`

### 4.2 Total Trades

- **Source Endpoint:** §3.2 `/trades`
- **Calculation:** `Count(trades)`
- **Required Fields:** returned trade rows (`transactionHash` is retained by the API)

### 4.3 Unique Markets Traded

- **Source Endpoint:** §3.5 `/traded`; recent-history fallback from §3.2 `/trades`
- **Calculation:** official `traded` distinct-market count, never lower than
  `Count(DISTINCT trade.conditionId)` in the fetched history.
- **Required Fields:** `traded`, `conditionId`

### 4.4 Active Trading Days

- **Source Endpoint:** §3.2 `/trades`
- **Calculation:** `Count(DISTINCT date(trade.timestamp))`
- **Required Fields:** `timestamp`

### 4.5 Account Age (days)

- **Source Endpoint:** §3.4 `/public-profile` (`createdAt`) — fallback to
  earliest trade timestamp from §3.2.
- **Calculation:** `floor((now - createdAt) / 86400)`
- **Required Fields:** `createdAt`

### 4.6 Average Position Size

- **Source Endpoint:** §3.2 `/trades`
- **Calculation:** `totalVolume / totalTrades`
- **Required Fields:** `size`, `price`

### 4.7 Win Rate

- **Source Endpoint:** §3.3 `/closed-positions` (resolved markets) plus current positions.
- **Calculation:** `Count(positions where realizedPnl > 0) / Count(resolved positions)`
- **Required Fields:** `realizedPnl`, market resolution state.

### 4.8 PnL (USDC)

- **Source Endpoint:** §3.3 `/positions`
- **Calculation:** `Sum(realizedPnl) + Sum((curPrice - avgPrice) * size)`
- **Required Fields:** `realizedPnl`, `curPrice`, `avgPrice`, `size`

### 4.9 Best / Worst Market

- **Source Endpoint:** §3.3 + §3.1 (join on `market` for question text)
- **Calculation:** `argMax / argMin(realizedPnl + unrealizedPnl)`
- **Required Fields:** `realizedPnl`, `unrealizedPnl`, `question`

### 4.10 Largest Trade

- **Source Endpoint:** §3.2 `/trades`
- **Calculation:** `Max(size * price)`
- **Required Fields:** `size`, `price`

### 4.11 Category Diversity (chart)

- **Source Endpoint:** §3.2 + §3.1 (join `market` → `category`)
- **Calculation:** For each category `c`,
  `share(c) = sum(size * price where category(conditionId) = c) / totalVolume`
- **Required Fields:** `size`, `price`, `conditionId`, event/market labels

### 4.12 30-day Volume Timeline (chart)

- **Source Endpoint:** §3.2 `/trades`
- **Calculation:** Bucket trades by `date(timestamp)` for the last 30
  calendar days; per bucket emit `{date, volume = sum(size * price), trades = count}`.
- **Required Fields:** `size`, `price`, `timestamp`

---

## 5. Breakdown Sub-scores (0–100 each)

Each sub-score is clamped to `[0,100]`. Thresholds are tunable constants
(`src/lib/analytics/constants.ts`, PLANNED).

### 5.1 Volume Score

- **Inputs:** `totalVolume`
- **Formula:** `min(100, 100 * log10(1 + totalVolume) / log10(1 + VOLUME_TOP))`
  where `VOLUME_TOP = 250_000` USDC (≈ top-1% trader).

### 5.2 Activity Score

- **Inputs:** `activeDays`, `accountAgeDays`
- **Formula:** `min(100, 60 * (activeDays / 180) + 40 * (activeDays / max(1, accountAgeDays)))`

### 5.3 Diversity Score

- **Inputs:** `uniqueMarkets`, category share vector `s`.
- **Formula:** `0.5 * min(100, uniqueMarkets * 2) + 0.5 * (100 * (1 - HHI(s)))`
  where `HHI(s) = Σ sᵢ²` (Herfindahl index).

### 5.4 Profitability Score

- **Inputs:** `pnl`, `totalVolume`, `winRate`.
- **Formula:** `clamp(0, 100, 50 + 50 * tanh(pnl / max(1, totalVolume * 0.1)) ) * 0.7 + winRate * 0.3`

### 5.5 Loyalty Score

- **Inputs:** `accountAgeDays`, `activeDays`.
- **Formula:** `min(100, 60 * (accountAgeDays / 365) + 40 * (activeDays / 365))`

---

## 6. Readiness Score

- **Inputs:**
  - Volume Score
  - Activity Score
  - Diversity Score
  - Profitability Score
  - Loyalty Score
- **Formula:**
  ```
  readiness = (volume        * 0.30)
            + (activity      * 0.25)
            + (diversity     * 0.20)
            + (profitability * 0.15)
            + (loyalty       * 0.10)
  ```
- **Tier Mapping:**
  | Score | Tier |
  | -------- | ---- |
  | ≥ 88 | S |
  | 75 – 87 | A |
  | 60 – 74 | B |
  | 45 – 59 | C |
  | < 45 | D |

---

## 7. Sybil Risk Heuristic

- **Source:** derived only (no dedicated endpoint).
- **Inputs:** `activeDays`, `uniqueMarkets`, top category share,
  `accountAgeDays`.
- **Formula (additive penalties on a 0–100 risk scale):**
  - `+30` if `activeDays < 30`
  - `+25` if `uniqueMarkets < 10`
  - `+20` if `categories[0].pct > 70`
  - `+15` if `accountAgeDays < 45`
- **Level:** `Low (<25)`, `Medium (25–54)`, `High (≥55)`.

---

## 8. API Service Structure

```
src/services/polymarket/
  http.ts              # fetch wrapper with timeout, retry, and backoff
  profile.ts           # exact username search + canonical wallet resolution
  activity.ts          # maker + taker trade-history pagination
  positions.ts         # current/closed positions + official aggregates
  categories.ts        # coarse market categorization
  analytics.ts         # normalized dashboard metrics
  scoring.ts           # score, tiers, sybil signals, and recommendations
  types.ts             # shared serializable DTO types

src/lib/polymarket.functions.ts   # createServerFn entry points
  - getWalletAnalysis({ input })       // top-level used by /wallet/$id
  - getLeaderboard({ sort, limit })    // analyzed-wallet snapshots
```

Each server fn:

1. Resolves wallet via §3.4 (handle → address) if needed.
2. Fetches profile, trades, current/closed positions, value, and market count
   in parallel; non-critical source failures become visible warnings.
3. Runs the analytics/scoring services, persists an anonymized leaderboard
   snapshot on a best-effort basis, and returns a plain `Analysis` DTO.

---

## 9. Lovable Cloud Schema Mapping

> The shipped `wallet_snapshots` table supports the anonymized leaderboard.
> Additional premium-support tables below remain planned.

### `cached_wallets`

| Column        | Type        | Notes                      |
| ------------- | ----------- | -------------------------- |
| `wallet`      | text PK     | lower-case 0x address      |
| `username`    | text        | Polymarket handle if known |
| `created_at`  | timestamptz | from §3.4 `createdAt`      |
| `last_synced` | timestamptz | last successful refresh    |

### `wallet_snapshots`

| Column       | Type        | Notes                                                        |
| ------------ | ----------- | ------------------------------------------------------------ |
| `id`         | uuid PK     | `gen_random_uuid()`                                          |
| `wallet`     | text FK     | → `cached_wallets.wallet`                                    |
| `taken_at`   | timestamptz | default `now()`                                              |
| `total`      | int         | readiness score (§6)                                         |
| `tier`       | text        | S/A/B/C/D                                                    |
| `breakdown`  | jsonb       | `{volume, activity, diversity, profitability, loyalty}` (§5) |
| `metrics`    | jsonb       | dashboard metrics (§4)                                       |
| `categories` | jsonb       | `[{name, pct}]` (§4.11)                                      |
| `timeline`   | jsonb       | 30-day series (§4.12)                                        |
| `sybil`      | jsonb       | `{score, level, reasons}` (§7)                               |

### `score_history`

| Column   | Type | Notes                         |
| -------- | ---- | ----------------------------- |
| `wallet` | text |                               |
| `day`    | date | unique together with `wallet` |
| `total`  | int  | end-of-day readiness score    |
| `tier`   | text |                               |

Primary key: `(wallet, day)`. Used for the score-change sparkline.

### `markets_cache`

| Column       | Type        | Notes            |
| ------------ | ----------- | ---------------- |
| `market_id`  | text PK     |                  |
| `question`   | text        |                  |
| `category`   | text        |                  |
| `end_date`   | timestamptz |                  |
| `payload`    | jsonb       | raw Gamma object |
| `fetched_at` | timestamptz | TTL ~6h          |

### `watchlists` (premium)

| Column       | Type        | Notes           |
| ------------ | ----------- | --------------- |
| `id`         | uuid PK     |                 |
| `user_id`    | uuid        | `auth.users.id` |
| `wallet`     | text        |                 |
| `label`      | text        |                 |
| `created_at` | timestamptz | default `now()` |

RLS: `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE.

### `alerts` (premium, PLANNED)

| Column    | Type    | Notes                       |
| --------- | ------- | --------------------------- |
| `id`      | uuid PK |                             |
| `user_id` | uuid    | `auth.users.id`             |
| `wallet`  | text    | wallet to monitor           |
| `channel` | text    | `email` \| `telegram`       |
| `rule`    | jsonb   | e.g. `{type:'tier_change'}` |
| `enabled` | boolean | default `true`              |

### Required GRANTs (template)

```sql
GRANT SELECT ON public.cached_wallets   TO anon, authenticated;
GRANT SELECT ON public.wallet_snapshots TO anon, authenticated;
GRANT SELECT ON public.score_history    TO anon, authenticated;
GRANT SELECT ON public.markets_cache    TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts     TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
```

---

## 10. Maintenance Rules

1. When you add or change a Polymarket call, update §3 in the same commit.
2. When you add a dashboard metric, add it to §4 with its source endpoint
   and exact formula.
3. When you change a sub-score weight or the readiness formula, update
   §5 / §6 — these are the single source of truth.
4. When you add or alter a table, update §9 and ship `GRANT`s with the
   migration.
5. Mark unfinished sections with _PLANNED_ so readers can distinguish
   shipped behavior from the roadmap.

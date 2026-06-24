import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Sparkles, Trophy, Search, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclaimer } from "@/components/Disclaimer";
import { fmtNum, fmtUSD } from "@/lib/format";
import { getLeaderboard, searchLeaderboard, type LeaderboardEntry, type SearchResult } from "@/lib/polymarket.functions";

type Sort = "score" | "volume" | "maker_rebate" | "liquidity_rewards" | "sponsored_rewards" | "active_days" | "diversity_score";

const leaderboardQueryOptions = (sort: Sort) =>
  queryOptions({
    queryKey: ["leaderboard", sort],
    queryFn: () => getLeaderboard({ data: { sort, limit: 25 } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — PolyScore" },
      {
        name: "description",
        content:
          "Top Polymarket wallets ranked by airdrop readiness, volume, activity, and diversity.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(leaderboardQueryOptions("score")),
  errorComponent: ({ error }) => (
    <div className="min-h-screen p-6 text-sm text-muted-foreground">
      Couldn't load leaderboard: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Leaderboard not found.</div>,
  component: LeaderboardPage,
});

const TABS: {
  value: Sort;
  label: string;
  metric: keyof LeaderboardEntry;
  format: (n: number) => string;
}[] = [
  { value: "score", label: "Readiness", metric: "score", format: (n) => `${n}` },
  { value: "volume", label: "Volume", metric: "volume", format: (n) => fmtUSD(n) },
  { value: "maker_rebate", label: "Maker Rebate", metric: "maker_rebate", format: (n) => fmtUSD(n) },
  { value: "liquidity_rewards", label: "Liquidity Provided", metric: "liquidity_rewards", format: (n) => fmtUSD(n) },
  { value: "sponsored_rewards", label: "Sponsored Provided", metric: "sponsored_rewards", format: (n) => fmtUSD(n) },
  {
    value: "active_days",
    label: "Most Active",
    metric: "active_days",
    format: (n) => `${fmtNum(n)} days`,
  },
  {
    value: "diversity_score",
    label: "Diversity",
    metric: "diversity_score",
    format: (n) => `${n}`,
  },
];

function LeaderboardPage() {
  const [sort, setSort] = useState<Sort>("score");
  const { data } = useSuspenseQuery(leaderboardQueryOptions(sort));
  const tab = TABS.find((t) => t.value === sort)!;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");

  const invokeSearch = useServerFn(searchLeaderboard);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setSearched(true);
    setSearchError("");
    setSearchResult(null);

    try {
      const res = await invokeSearch({ data: { query: q } });
      if (res) {
        setSearchResult(res);
      } else {
        setSearchResult(null);
      }
    } catch (err: any) {
      setSearchError(err.message || "Failed to search user");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">PolyScore</span>
          </Link>
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Trophy className="h-5 w-5 text-warning" /> Leaderboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Anonymized snapshots of every wallet analyzed on PolyScore. Wallet addresses are hashed
              on capture, only opt-in usernames are surfaced.
            </p>
          </div>

          <div className="flex gap-2 w-full md:max-w-md shrink-0">
            <input
              type="text"
              placeholder="Search address (0x...) or username"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 px-4 py-2 text-sm rounded-lg border border-border bg-secondary/20 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button onClick={handleSearch} disabled={isSearching} size="sm" className="cursor-pointer">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Search
            </Button>
          </div>
        </div>

        {searchError && (
          <div className="text-xs text-destructive p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            {searchError}
          </div>
        )}

        {searchResult && (
          <div className="glass-card p-5 border border-primary/40 bg-primary/5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xs uppercase tracking-wider text-primary font-semibold">User Found</h3>
                <div className="font-medium text-base mt-1">
                  {searchResult.entry.username ? `@${searchResult.entry.username}` : "Anonymous"}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  Hash: {searchResult.entry.wallet_hash}
                </div>
              </div>
              <span className="rounded-md border border-border bg-secondary/80 px-2 py-0.5 text-xs font-semibold">
                Tier {searchResult.entry.tier}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-border/40 text-xs">
              <div>
                <div className="text-muted-foreground">Readiness Rank</div>
                <div className="font-semibold font-mono text-sm mt-0.5">
                  #{searchResult.ranks.score} <span className="text-[10px] text-muted-foreground font-normal">({searchResult.entry.score})</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Volume Rank</div>
                <div className="font-semibold font-mono text-sm mt-0.5">
                  #{searchResult.ranks.volume} <span className="text-[10px] text-muted-foreground font-normal">({fmtUSD(searchResult.entry.volume)})</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Maker Rebate Rank</div>
                <div className="font-semibold font-mono text-sm mt-0.5">
                  #{searchResult.ranks.maker_rebate} <span className="text-[10px] text-muted-foreground font-normal font-mono">({fmtUSD(searchResult.entry.maker_rebate)})</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Liquidity Provided Rank</div>
                <div className="font-semibold font-mono text-sm mt-0.5">
                  #{searchResult.ranks.liquidity_rewards} <span className="text-[10px] text-muted-foreground font-normal font-mono">({fmtUSD(searchResult.entry.liquidity_rewards)})</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-border/20">
              <Button variant="ghost" size="sm" onClick={() => { setSearchResult(null); setSearchQuery(""); setSearched(false); }} className="text-xs cursor-pointer">
                Clear
              </Button>
              <Link to={`/wallet/${searchResult.entry.username || searchQuery}`}>
                <Button size="sm" className="text-xs cursor-pointer">
                  View Full Profile
                </Button>
              </Link>
            </div>
          </div>
        )}

        {searched && !searchResult && !isSearching && (
          <div className="glass-card p-5 border border-warning/40 bg-warning/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-warning">No snapshot found</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                This wallet/username has not been analyzed on PolyScore yet. Run the analysis first to add it.
              </p>
            </div>
            <Link to={`/wallet/${encodeURIComponent(searchQuery)}`}>
              <Button size="sm" className="bg-warning text-warning-foreground hover:bg-warning/90 cursor-pointer">
                Analyze "{searchQuery}"
              </Button>
            </Link>
          </div>
        )}

        <Tabs value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="data-[state=active]:bg-secondary/80 data-[state=active]:text-foreground border border-border/40 rounded-lg px-3 py-1.5 text-xs cursor-pointer"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="glass-card overflow-hidden">
          {data.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No wallets analyzed yet. Be the first — run an analysis from the home page.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Wallet</th>
                    <th className="px-4 py-3 text-left">Tier</th>
                    <th className="px-4 py-3 text-right">{tab.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.wallet_hash} className="border-b border-border/40 last:border-0 hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {row.username ? `@${row.username}` : "Anonymous"}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {row.wallet_hash.slice(0, 10)}…
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs">
                          {row.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {tab.format(Number(row[tab.metric]))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Disclaimer />
      </main>
    </div>
  );
}

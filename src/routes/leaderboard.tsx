import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Sparkles, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclaimer } from "@/components/Disclaimer";
import { fmtNum, fmtUSD } from "@/lib/format";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/polymarket.functions";

type Sort = "score" | "volume" | "active_days" | "diversity_score";

const leaderboardQueryOptions = (sort: Sort) =>
  queryOptions({
    queryKey: ["leaderboard", sort],
    queryFn: () => getLeaderboard({ data: { sort, limit: 25 } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — PolyScope" },
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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">PolyScope</span>
          </Link>
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trophy className="h-5 w-5 text-warning" /> Leaderboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Anonymized snapshots of every wallet analyzed on PolyScope. Wallet addresses are hashed
            on capture, only opt-in usernames are surfaced.
          </p>
        </div>

        <Tabs value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
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
            <table className="w-full text-sm">
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
                  <tr key={row.wallet_hash} className="border-b border-border/40 last:border-0">
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
          )}
        </div>

        <Disclaimer />
      </main>
    </div>
  );
}

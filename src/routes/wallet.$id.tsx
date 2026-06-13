import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Calendar,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { Disclaimer } from "@/components/Disclaimer";
import { fmtAddress, fmtNum, fmtUSD } from "@/lib/format";
import { getWalletAnalysis } from "@/lib/polymarket.functions";
import { nextTier, recompute } from "@/services/polymarket/scoring";
import type { Analysis } from "@/services/polymarket/types";

const walletQueryOptions = (input: string) =>
  queryOptions({
    queryKey: ["wallet-analysis", input.toLowerCase()],
    queryFn: () => getWalletAnalysis({ data: { input } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

export const Route = createFileRoute("/wallet/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${decodeURIComponent(params.id)} — PolyScope` },
      {
        name: "description",
        content: `Live Polymarket readiness report for ${decodeURIComponent(params.id)}.`,
      },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(walletQueryOptions(decodeURIComponent(params.id))),
  pendingComponent: () => (
    <>
      <DashboardHeader />
      <DashboardSkeleton />
    </>
  ),
  errorComponent: ErrorView,
  notFoundComponent: NotFoundView,
  component: WalletDashboard,
});

const TIER_TONE: Record<string, string> = {
  S: "from-[oklch(0.78_0.17_65)] to-[oklch(0.7_0.2_305)]",
  A: "from-[oklch(0.7_0.18_245)] to-[oklch(0.74_0.18_150)]",
  B: "from-[oklch(0.74_0.18_150)] to-[oklch(0.7_0.18_180)]",
  C: "from-[oklch(0.78_0.17_65)] to-[oklch(0.7_0.18_245)]",
  D: "from-[oklch(0.65_0.22_25)] to-[oklch(0.78_0.17_65)]",
};

function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)]">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">PolyScope</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/leaderboard">
            <Button variant="ghost" size="sm">
              <Trophy className="mr-1 h-4 w-4" /> Leaderboard
            </Button>
          </Link>
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> New analysis
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function WalletDashboard() {
  const { id } = Route.useParams();
  const input = decodeURIComponent(id);
  const { data } = useSuspenseQuery(walletQueryOptions(input));
  return (
    <div className="min-h-screen">
      <DashboardHeader />
      <DashboardBody data={data} />
    </div>
  );
}

function DashboardBody({ data }: { data: Analysis }) {
  const [volDelta, setVolDelta] = useState(0);
  const [dayDelta, setDayDelta] = useState(0);
  const [mktDelta, setMktDelta] = useState(0);
  const sim = useMemo(
    () => recompute(data, { volume: volDelta, activeDays: dayDelta, markets: mktDelta }),
    [data, volDelta, dayDelta, mktDelta],
  );

  const breakdownItems = [
    { key: "volume", label: "Volume", weight: 30, value: data.breakdown.volume },
    { key: "activity", label: "Activity", weight: 25, value: data.breakdown.activity },
    { key: "diversity", label: "Diversity", weight: 20, value: data.breakdown.diversity },
    {
      key: "profitability",
      label: "Profitability",
      weight: 15,
      value: data.breakdown.profitability,
    },
    { key: "loyalty", label: "Loyalty", weight: 10, value: data.breakdown.loyalty },
  ];

  const radarData = breakdownItems.map((b) => ({ subject: b.label, value: b.value }));
  const isEmpty = data.metrics.totalTrades === 0 && data.metrics.totalVolume === 0;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      {data.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Some data could not be loaded</div>
            <ul className="mt-1 space-y-0.5">
              {data.warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Debug Card */}
      {data.debug && import.meta.env.VITE_DEBUG_MODE === "true" && (
        <div className="rounded-xl border border-dashed border-primary/50 bg-secondary/15 p-6 font-mono text-xs text-muted-foreground transition-all hover:border-primary">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <h3 className="font-semibold text-foreground uppercase tracking-wider">
              Identity Debug Console
            </h3>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <span className="text-foreground font-semibold">Input:</span> {data.debug.userInput}
            </div>
            <div>
              <span className="text-foreground font-semibold">Resolved Username:</span>{" "}
              {data.debug.username}
            </div>
            <div>
              <span className="text-foreground font-semibold">Resolved Wallet:</span>{" "}
              {data.debug.wallet}
            </div>
            <div>
              <span className="text-foreground font-semibold">Proxy Wallet:</span>{" "}
              {data.debug.proxyWallet}
            </div>
            <div>
              <span className="text-foreground font-semibold">Wallet Used For Data API:</span>{" "}
              {data.debug.walletUsedForAnalysis}
            </div>
            <div>
              <span className="text-foreground font-semibold">Markets Returned:</span>{" "}
              {data.debug.marketsCount}
            </div>
            <div>
              <span className="text-foreground font-semibold">Trades Returned:</span>{" "}
              {data.debug.tradesCount}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="glass-card relative overflow-hidden p-6 md:p-8">
        <div
          className={`absolute -right-32 -top-32 h-72 w-72 rounded-full bg-gradient-to-br ${TIER_TONE[data.tier]} opacity-20 blur-3xl`}
        />
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Wallet analyzed
            </div>
            <h1 className="mt-2 font-mono text-xl md:text-2xl">{fmtAddress(data.wallet)}</h1>
            <div className="mt-1 text-muted-foreground">@{data.username}</div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Badge
                className={`bg-gradient-to-r ${TIER_TONE[data.tier]} border-0 px-3 py-1 text-base text-primary-foreground`}
              >
                Tier {data.tier}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Top {data.percentile}% of analyzed wallets
              </span>
            </div>

            <p className="mt-4 max-w-lg text-sm text-muted-foreground">
              {isEmpty
                ? "No on-chain Polymarket activity detected for this wallet yet. Start trading across categories to build readiness."
                : data.total >= 75
                  ? "Above-average user with consistent engagement. You're well-positioned — keep diversifying."
                  : data.total >= 55
                    ? "Solid foundation. A few targeted improvements can push you into the next tier."
                    : "Early-stage activity. Focus on the recommendations below to build airdrop readiness."}
            </p>
          </div>
          <div className="justify-self-center md:justify-self-end">
            <ScoreRing value={data.total} size={200} />
          </div>
        </div>
      </section>

      {/* Score breakdown */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Readiness breakdown</h2>
          </div>
          <div className="space-y-4">
            {breakdownItems.map((b) => (
              <div key={b.key}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>
                    {b.label}{" "}
                    <span className="text-xs text-muted-foreground">· weight {b.weight}</span>
                  </span>
                  <span className="font-mono">{b.value}/100</span>
                </div>
                <Progress value={b.value} className="h-2" />
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card p-6">
          <h2 className="mb-2 text-base font-semibold">Profile shape</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="oklch(1 0 0 / 0.1)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "oklch(0.7 0.02 250)", fontSize: 11 }}
                />
                <Radar
                  dataKey="value"
                  stroke="oklch(0.7 0.18 245)"
                  fill="oklch(0.7 0.18 245)"
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Metrics grid */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Trading analytics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={CircleDollarSign}
            label="Total volume"
            value={fmtUSD(data.metrics.totalVolume)}
          />
          <MetricCard
            icon={BarChart3}
            label="Total trades"
            value={fmtNum(data.metrics.totalTrades)}
          />
          <MetricCard icon={Layers} label="Markets" value={fmtNum(data.metrics.markets)} />
          <MetricCard icon={Coins} label="Avg trade" value={fmtUSD(data.metrics.avgPosition)} />
          <MetricCard
            icon={Trophy}
            label="Win rate"
            value={data.metrics.winRate > 0 ? `${data.metrics.winRate}%` : "—"}
            tone={data.metrics.winRate >= 55 ? "success" : "warning"}
          />
          <MetricCard
            icon={data.metrics.pnl >= 0 ? TrendingUp : TrendingDown}
            label="P&L"
            value={fmtUSD(data.metrics.pnl)}
            hint={`Realized ${fmtUSD(data.metrics.realizedPnl)} · Unrealized ${fmtUSD(data.metrics.unrealizedPnl)}`}
            tone={data.metrics.pnl >= 0 ? "success" : "danger"}
          />
          <MetricCard icon={Calendar} label="Active days" value={fmtNum(data.metrics.activeDays)} />
          <MetricCard
            icon={Activity}
            label="Account age"
            value={`${data.metrics.accountAgeDays}d`}
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="glass-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Best market
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="line-clamp-1 font-medium">{data.metrics.bestMarket}</span>
              <TrendingUp className="h-4 w-4 shrink-0 text-success" />
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Worst market
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="line-clamp-1 font-medium">{data.metrics.worstMarket}</span>
              <TrendingDown className="h-4 w-4 shrink-0 text-destructive" />
            </div>
          </div>
        </div>
      </section>

      {/* Timeline + Diversity */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">30-day volume</h2>
            <span className="text-xs text-muted-foreground">USD</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeline} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.18 245)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="oklch(0.7 0.18 245)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "oklch(0.65 0.02 250)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "oklch(0.65 0.02 250)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.21 0.025 252)",
                    border: "1px solid oklch(1 0 0 / 0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="oklch(0.7 0.18 245)"
                  strokeWidth={2}
                  fill="url(#volFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass-card p-6">
          <h2 className="mb-4 text-base font-semibold">Category diversity</h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.categories}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: "oklch(0.75 0.02 250)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={92}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.21 0.025 252)",
                    border: "1px solid oklch(1 0 0 / 0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v}%`, "Share"]}
                />
                <Bar dataKey="pct" fill="oklch(0.74 0.18 150)" radius={[6, 6, 6, 6]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Diversity score:{" "}
            <span className="font-mono text-foreground">{data.breakdown.diversity}/100</span>
          </div>
        </div>
      </section>

      {/* Health */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-success" /> Strengths
          </h2>
          <ul className="space-y-2 text-sm">
            {data.strengths.length === 0 && (
              <li className="text-muted-foreground">No major strengths detected yet.</li>
            )}
            {data.strengths.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <ShieldAlert className="h-4 w-4 text-warning" /> Weaknesses
          </h2>
          <ul className="space-y-2 text-sm">
            {data.weaknesses.length === 0 && (
              <li className="text-muted-foreground">No major weaknesses detected.</li>
            )}
            {data.weaknesses.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Recommendations */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Optimization plan
          </h2>
          <span className="text-xs text-muted-foreground">Path to Tier {nextTier(data.tier)}</span>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {data.recommendations.map((r) => {
            const pct = r.target > 0 ? Math.min(100, Math.round((r.current / r.target) * 100)) : 0;
            return (
              <div key={r.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span>{r.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.unit === "$" ? fmtUSD(r.current) : `${fmtNum(r.current)} ${r.unit}`}
                    <ChevronRight className="mx-1 inline h-3 w-3" />
                    {r.unit === "$" ? fmtUSD(r.target) : `${fmtNum(r.target)} ${r.unit}`}
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Sybil */}
      <section className="glass-card p-6">
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div
              className={`grid h-20 w-20 place-items-center rounded-full text-lg font-semibold ${
                data.sybil.level === "Low"
                  ? "bg-success/15 text-success"
                  : data.sybil.level === "Medium"
                    ? "bg-warning/15 text-warning"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {data.sybil.score}
            </div>
            <Badge variant="outline">{data.sybil.level} risk</Badge>
          </div>
          <div>
            <h2 className="text-base font-semibold">Sybil risk analysis</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Heuristic signals that could affect airdrop eligibility for suspected sybil wallets.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.sybil.reasons.map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* What-if + Allocation */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h2 className="text-base font-semibold">What-if simulator</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Adjust below to see how your score and tier change in real time.
          </p>

          <div className="mt-6 space-y-6">
            <SimRow
              label="Additional volume"
              value={`+${fmtUSD(volDelta)}`}
              slider={
                <Slider
                  value={[volDelta]}
                  max={50000}
                  step={500}
                  onValueChange={(v) => setVolDelta(v[0])}
                />
              }
            />
            <SimRow
              label="Additional active days"
              value={`+${dayDelta}`}
              slider={
                <Slider
                  value={[dayDelta]}
                  max={90}
                  step={1}
                  onValueChange={(v) => setDayDelta(v[0])}
                />
              }
            />
            <SimRow
              label="Additional markets"
              value={`+${mktDelta}`}
              slider={
                <Slider
                  value={[mktDelta]}
                  max={60}
                  step={1}
                  onValueChange={(v) => setMktDelta(v[0])}
                />
              }
            />
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-border bg-secondary/40 p-4">
            <Stat label="New score" value={`${sim.total}`} delta={sim.total - data.total} />
            <Stat label="New tier" value={`Tier ${sim.tier}`} />
            <Stat label="Est. allocation" value={fmtNum(sim.allocation.likely)} suffix="POLY" />
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-base font-semibold">Speculative allocation</h2>
          <p className="mt-1 text-xs text-warning">
            Speculative — not affiliated with Polymarket. Actual eligibility and allocation may
            differ.
          </p>
          <div className="mt-6 space-y-4">
            <AllocBar
              label="Conservative"
              value={data.allocation.conservative}
              max={data.allocation.optimistic}
              tone="muted"
            />
            <AllocBar
              label="Likely"
              value={data.allocation.likely}
              max={data.allocation.optimistic}
              tone="primary"
            />
            <AllocBar
              label="Optimistic"
              value={data.allocation.optimistic}
              max={data.allocation.optimistic}
              tone="success"
            />
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            Estimates derived from your readiness score, volume, activity, and diversity.
          </div>
        </div>
      </section>

      <Disclaimer />

      <div className="pt-4 text-center text-xs text-muted-foreground">
        Updated {new Date(data.generatedAt).toLocaleString()} · Powered by Polymarket public APIs
      </div>
    </main>
  );
}

function SimRow({
  label,
  value,
  slider,
}: {
  label: string;
  value: string;
  slider: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{value}</span>
      </div>
      {slider}
    </div>
  );
}

function Stat({
  label,
  value,
  delta,
  suffix,
}: {
  label: string;
  value: string;
  delta?: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">
        {value}
        {suffix && <span className="ml-1 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {typeof delta === "number" && delta !== 0 && (
        <div className={`text-xs ${delta > 0 ? "text-success" : "text-destructive"}`}>
          {delta > 0 ? "+" : ""}
          {delta}
        </div>
      )}
    </div>
  );
}

function AllocBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "muted" | "primary" | "success";
}) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  const bg =
    tone === "primary"
      ? "bg-[image:var(--gradient-primary)]"
      : tone === "success"
        ? "bg-[image:var(--gradient-success)]"
        : "bg-muted-foreground/40";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono">{fmtNum(value)} POLY</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${bg}`}
          style={{ width: `${pct}%`, transition: "width 400ms ease" }}
        />
      </div>
    </div>
  );
}

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const msg = error.message ?? "";
  if (msg.startsWith("USER_NOT_FOUND:")) {
    throw notFound();
  }
  return (
    <div className="min-h-screen">
      <DashboardHeader />
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
        <h1 className="mt-4 text-xl font-semibold">Couldn't load this wallet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Polymarket's API didn't respond cleanly. Please try again in a moment.
        </p>
        <Button
          className="mt-6"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

function NotFoundView() {
  const { id } = Route.useParams();
  return (
    <div className="min-h-screen">
      <DashboardHeader />
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">No Polymarket user found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't resolve <span className="font-mono">{decodeURIComponent(id)}</span> to a
          Polymarket wallet. Double-check the address or username and try again.
        </p>
        <Link to="/">
          <Button className="mt-6">Try another wallet</Button>
        </Link>
      </div>
    </div>
  );
}

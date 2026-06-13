import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  BarChart3,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PolyScope — Polymarket Analytics & Airdrop Readiness" },
      {
        name: "description",
        content:
          "Analyze any Polymarket wallet. Get an airdrop readiness score, tier ranking, optimization tips, and what-if simulations.",
      },
      { property: "og:title", content: "PolyScope — Polymarket Analytics" },
      {
        property: "og:description",
        content: "Premium analytics dashboard for Polymarket traders.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    navigate({ to: "/wallet/$id", params: { id: v } });
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[image:var(--gradient-primary)] glow-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">PolyScope</span>
        </div>
        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#scoring" className="hover:text-foreground">
            Scoring
          </a>
          <Link to="/leaderboard" className="hover:text-foreground">
            Leaderboard
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 md:pt-20">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Live analytics for Polymarket wallets
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Know your <span className="text-gradient-primary">airdrop readiness</span>
            <br className="hidden md:block" /> before everyone else.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-muted-foreground">
            PolyScope analyzes any Polymarket wallet — scoring activity, volume, diversity, and
            loyalty — then tells you exactly how to improve.
          </p>

          <form
            onSubmit={submit}
            className="mx-auto mt-10 flex max-w-xl flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0xwallet… or @username"
                className="h-12 pl-9 text-base"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-6">
              Analyze wallet
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            Try:
            {["@whale", "0x4e8a…f12c", "@degen_alpha"].map((s) => (
              <button
                key={s}
                onClick={() => setValue(s)}
                className="rounded-full border border-border bg-secondary/40 px-3 py-1 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <section id="features" className="mt-24 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Target,
              title: "Readiness Score",
              desc: "Weighted 100-point score across volume, activity, diversity, profitability, and loyalty.",
            },
            {
              icon: TrendingUp,
              title: "What-If Simulator",
              desc: "See instantly how more volume, days, or markets shift your tier.",
            },
            {
              icon: ShieldCheck,
              title: "Sybil Risk Check",
              desc: "Detect unnatural patterns that could disqualify you from an airdrop.",
            },
            {
              icon: BarChart3,
              title: "Trading Analytics",
              desc: "P&L, win rate, best/worst markets, and 30-day volume timeline.",
            },
            {
              icon: Activity,
              title: "Diversity Breakdown",
              desc: "Category mix across Politics, Sports, Crypto, Economics, and more.",
            },
            {
              icon: Sparkles,
              title: "Optimization Plan",
              desc: "Personalized actions to reach the next tier — with progress bars.",
            },
          ].map((f) => (
            <div key={f.title} className="glass-card p-6">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-secondary">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-3xl px-6">
          <Disclaimer />
          <div className="mt-4 text-center text-xs text-muted-foreground">
            PolyScope · Independent Polymarket analytics
          </div>
        </div>
      </footer>
    </div>
  );
}

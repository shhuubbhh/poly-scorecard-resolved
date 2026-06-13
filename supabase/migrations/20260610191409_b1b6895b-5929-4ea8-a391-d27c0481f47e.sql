
CREATE TABLE public.wallet_snapshots (
  wallet_hash text PRIMARY KEY,
  username text,
  score int NOT NULL,
  tier text NOT NULL,
  volume numeric NOT NULL DEFAULT 0,
  trades int NOT NULL DEFAULT 0,
  markets int NOT NULL DEFAULT 0,
  active_days int NOT NULL DEFAULT 0,
  diversity_score int NOT NULL DEFAULT 0,
  activity_score int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_snapshots TO anon, authenticated;
GRANT ALL ON public.wallet_snapshots TO service_role;

ALTER TABLE public.wallet_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view leaderboard snapshots"
  ON public.wallet_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX wallet_snapshots_score_idx ON public.wallet_snapshots (score DESC);
CREATE INDEX wallet_snapshots_volume_idx ON public.wallet_snapshots (volume DESC);
CREATE INDEX wallet_snapshots_active_days_idx ON public.wallet_snapshots (active_days DESC);
CREATE INDEX wallet_snapshots_diversity_idx ON public.wallet_snapshots (diversity_score DESC);

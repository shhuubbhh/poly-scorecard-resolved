ALTER TABLE public.wallet_snapshots
ADD COLUMN maker_rebate numeric NOT NULL DEFAULT 0,
ADD COLUMN liquidity_rewards numeric NOT NULL DEFAULT 0,
ADD COLUMN sponsored_rewards numeric NOT NULL DEFAULT 0;

CREATE INDEX wallet_snapshots_maker_rebate_idx ON public.wallet_snapshots (maker_rebate DESC);
CREATE INDEX wallet_snapshots_liquidity_rewards_idx ON public.wallet_snapshots (liquidity_rewards DESC);
CREATE INDEX wallet_snapshots_sponsored_rewards_idx ON public.wallet_snapshots (sponsored_rewards DESC);

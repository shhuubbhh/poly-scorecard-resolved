interface Props {
  value: number;
  size?: number;
  label?: string;
}

export function ScoreRing({ value, size = 180, label = "Readiness" }: Props) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.7 0.18 245)" />
            <stop offset="100%" stopColor="oklch(0.74 0.18 150)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

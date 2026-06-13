import { Info } from "lucide-react";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-xs text-muted-foreground ${className}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <span>
        PolyScope is an independent project and is not affiliated with Polymarket. Readiness scores
        and allocation estimates are community-driven analytics and do not represent official POLY
        token eligibility.
      </span>
    </div>
  );
}

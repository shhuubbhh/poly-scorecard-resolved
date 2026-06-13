import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}

const toneMap = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export function MetricCard({ icon: Icon, label, value, hint, tone = "default" }: Props) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", toneMap[tone])} />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

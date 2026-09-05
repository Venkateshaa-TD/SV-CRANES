import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
};

/** Compact stat tile for the dashboard grid — 2 columns on phones, more on
 * larger screens. Value text truncates/wraps rather than overflowing so
 * large monetary totals never break the layout. */
export function StatCard({ label, value, icon: Icon, tone = "default", className }: StatCardProps) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", toneClasses[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

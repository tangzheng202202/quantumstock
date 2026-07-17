import { memo } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  /** Accent color: bull (red/up), bear (green/down), warning (neutral). */
  accent?: "bull" | "bear" | "warning" | "none";
  /** Show a colored left border. */
  bordered?: boolean;
}

const ACCENT_TEXT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  bull: "text-bull",
  bear: "text-bear",
  warning: "text-warning",
  none: "",
};

const ACCENT_BORDER: Record<NonNullable<StatCardProps["accent"]>, string> = {
  bull: "border-l-bull",
  bear: "border-l-bear",
  warning: "border-l-warning",
  none: "",
};

/** StatCard — a single quick-stat tile on the dashboard. Memoized. */
export const StatCard = memo(function StatCard({
  label,
  value,
  suffix,
  accent = "none",
  bordered = false,
}: StatCardProps) {
  return (
    <Card className={cn(bordered && "border-l-4", bordered && ACCENT_BORDER[accent])}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className={cn("text-2xl font-bold", ACCENT_TEXT[accent])}>{value}</span>
          {suffix && <span className="text-xs text-muted-foreground mb-1">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
});

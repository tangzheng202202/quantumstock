"use client";

import { Wifi, WifiOff, Clock } from "lucide-react";

export type Freshness = "live" | "recent" | "stale" | "offline" | "loading";

interface FreshnessIndicatorProps {
  freshness: Freshness;
  source?: string;
  lastUpdated?: string;
}

const CONFIG: Record<Freshness, { icon: typeof Wifi; color: string; label: string }> = {
  live: { icon: Wifi, color: "text-success", label: "实时" },
  recent: { icon: Clock, color: "text-warning", label: "稍旧" },
  stale: { icon: Clock, color: "text-muted-foreground", label: "过期" },
  offline: { icon: WifiOff, color: "text-destructive", label: "离线" },
  loading: { icon: WifiOff, color: "text-muted-foreground/40", label: "加载中" },
};

export function FreshnessIndicator({ freshness, source, lastUpdated }: FreshnessIndicatorProps) {
  const { icon: Icon, color, label } = CONFIG[freshness];

  return (
    <div className="flex items-center gap-1.5" title={`数据来源: ${source ?? "未知"} · 更新: ${lastUpdated ?? "未知"}`}>
      <div className={`h-2 w-2 rounded-full ${freshness === "live" ? "bg-success animate-pulse" : freshness === "offline" ? "bg-destructive" : freshness === "recent" ? "bg-warning" : "bg-muted-foreground/30"}`} />
      <span className={`text-[10px] ${color}`}>
        {label}{source ? ` · ${source}` : ""}
      </span>
    </div>
  );
}

/** Compute freshness from data source and timestamp. */
export function computeFreshness(source: string, updatedAtMs?: number): Freshness {
  if (!updatedAtMs) return "loading";
  const age = Date.now() - updatedAtMs;
  if (source === "mock") return "offline";
  if (age < 30_000) return "live";
  if (age < 300_000) return "recent"; // 5 min
  return "stale";
}

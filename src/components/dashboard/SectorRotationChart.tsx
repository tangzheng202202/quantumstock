"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { SectorRotation } from "@/types";

export function SectorRotationChart() {
  const [sectors, setSectors] = useState<SectorRotation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market/sectors?dimension=rotation");
        if (res.ok) {
          const j = await res.json();
          if (j.success && j.data && mounted) setSectors(j.data);
        }
      } catch (e) {
        console.warn("[rotation] load failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 120000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>板块轮动</CardTitle>
          <CardDescription>行业动量排名</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Sort: highest momentum first; take top 12
  const sorted = [...sectors].sort((a, b) => b.momentum - a.momentum).slice(0, 12);

  return (
    <Card>
      <CardHeader>
        <CardTitle>板块轮动</CardTitle>
        <CardDescription>行业动量排名（实时）</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {sorted.map((sector) => {
            const barColor =
              sector.trend === "leading" ? "bg-bull"
              : sector.trend === "improving" ? "bg-warning"
              : sector.trend === "weakening" ? "bg-muted-foreground/50"
              : "bg-bear";

            return (
              <div key={sector.sector} className="flex items-center gap-2">
                <span className="w-14 text-xs text-muted-foreground truncate" title={sector.sector}>
                  {sector.sector}
                </span>
                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", barColor)}
                    style={{ width: `${Math.abs(sector.momentum)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-mono text-muted-foreground">
                  {sector.momentum > 0 ? "+" : ""}{sector.momentum}
                </span>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">暂无数据</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

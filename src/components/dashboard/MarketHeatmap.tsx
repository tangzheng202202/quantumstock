"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { MarketHeatmapItem } from "@/types";

export function MarketHeatmap() {
  const [items, setItems] = useState<MarketHeatmapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market/sectors?dimension=change");
        if (res.ok) {
          const j = await res.json();
          if (j.success && j.data && mounted) setItems(j.data);
        }
      } catch (e) {
        console.warn("[heatmap] load failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>板块资金热力图</CardTitle>
          <CardDescription>行业板块涨跌幅与资金流向</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">加载板块数据...</span>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>板块资金热力图</CardTitle>
          <CardDescription>行业板块涨跌幅与资金流向</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-xs text-muted-foreground py-8">暂无板块数据</p>
        </CardContent>
      </Card>
    );
  }

  // Sort: gainers first then losers, by abs change
  const sorted = [...items].sort((a, b) => b.changePercent - a.changePercent);

  return (
    <Card>
      <CardHeader>
        <CardTitle>板块资金热力图</CardTitle>
        <CardDescription>行业板块涨跌幅与资金流向（东方财富实时）</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[420px] overflow-auto pr-1">
          {sorted.map((item) => {
            const isUp = item.changePercent > 0;
            const intensity = Math.min(Math.abs(item.changePercent) / 5, 1);

            return (
              <Link
                key={item.sector}
                href={`/sector/${encodeURIComponent(item.sector)}`}
                className={cn(
                  "flex flex-col rounded-lg p-2.5 text-center transition-all hover:scale-105 cursor-pointer block",
                  isUp ? "bg-bull/10" : "bg-bear/10"
                )}
                style={{ opacity: 0.6 + intensity * 0.4 }}
                title={`${item.sector} · 净流入 ${(item.volume).toFixed(2)}亿 · 领涨股 ${item.leadingStock ?? "—"} · 点击查看详情`}
              >
                <span className="text-xs font-medium truncate">{item.sector}</span>
                <span className={cn(
                  "text-sm font-mono font-bold mt-1",
                  isUp ? "text-bull" : "text-bear"
                )}>
                  {isUp ? "+" : ""}{item.changePercent.toFixed(2)}%
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {item.volume > 0 ? "+" : ""}{item.volume.toFixed(1)}亿
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

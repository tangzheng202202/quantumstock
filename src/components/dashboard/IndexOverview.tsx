"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

interface IndexData {
  id: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

const INDEX_LIST = [
  { id: "SSE", name: "上证指数", etf: "510050" },
  { id: "SZSE", name: "深证成指", etf: "159915" },
  { id: "GEM", name: "创业板指", etf: "159915" },
  { id: "STAR", name: "科创50", etf: "588000" },
  { id: "HSI", name: "恒生指数", etf: "02800" },
];

const FALLBACK: IndexData[] = [
  { id: "SSE", name: "上证指数", value: 0, change: 0, changePercent: 0 },
  { id: "SZSE", name: "深证成指", value: 0, change: 0, changePercent: 0 },
  { id: "GEM", name: "创业板指", value: 0, change: 0, changePercent: 0 },
  { id: "STAR", name: "科创50", value: 0, change: 0, changePercent: 0 },
  { id: "HSI", name: "恒生指数", value: 0, change: 0, changePercent: 0 },
];

export function IndexOverview() {
  const [indices, setIndices] = useState<IndexData[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const res = await fetch("/api/market/indices");
      if (!res.ok) return;
      const j = await res.json();
      if (j.success && j.data) {
        setIndices(j.data);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground ml-2">加载指数...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
      {indices.map((idx) => {
        const isUp = idx.changePercent > 0;
        const isNeutral = idx.changePercent === 0;
        return (
          <Link
            key={idx.id}
            href={`/stock/${INDEX_LIST.find((i) => i.id === idx.id)?.etf ?? "510050"}`}
            className="flex flex-col items-center rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
          >
            <span className="text-[10px] text-muted-foreground font-medium mb-1 truncate max-w-full">
              {idx.name}
            </span>
            <span className="text-sm font-mono font-bold">
              {idx.value > 0
                ? idx.value.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </span>
            <div
              className={cn(
                "flex items-center gap-1 mt-1 text-xs font-mono",
                isUp ? "text-bull" : isNeutral ? "text-muted-foreground" : "text-bear"
              )}
            >
              {isUp ? (
                <TrendingUp className="h-3 w-3" />
              ) : isNeutral ? (
                <Minus className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>
                {isUp ? "+" : ""}
                {idx.changePercent.toFixed(2)}%
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

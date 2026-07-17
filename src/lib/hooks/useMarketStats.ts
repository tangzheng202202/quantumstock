"use client";

import { useCallback, useState } from "react";
import { usePolling } from "./usePolling";

export interface MarketStats {
  gainers: number;
  losers: number;
  /** 今日成交额 (元) */
  volume: number;
  sentiment: "—" | "偏多" | "偏空" | "中性";
}

const INITIAL_STATS: MarketStats = { gainers: 0, losers: 0, volume: 0, sentiment: "—" };

/** Minimal shape consumed from the screener endpoint for stats. */
interface ScreenerStatsItem {
  changePercent: number;
  amount: number;
}

/**
 * useMarketStats — derive whole-market breadth (gainers/losers/volume/sentiment)
 * from the A-share screener. Polls every 2 minutes.
 */
export function useMarketStats(pollMs = 120000): MarketStats {
  const [stats, setStats] = useState<MarketStats>(INITIAL_STATS);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/market/screener?sortBy=volume&sortOrder=desc&limit=500");
      if (!res.ok) return;
      const j = await res.json();
      if (!j.success || !Array.isArray(j.data)) return;

      const all = j.data as ScreenerStatsItem[];
      const gainers = all.filter((s) => s.changePercent > 0).length;
      const losers = all.filter((s) => s.changePercent < 0).length;
      const volume = all.reduce((sum, s) => sum + (s.amount || 0), 0);
      const sentiment: MarketStats["sentiment"] =
        gainers > losers ? "偏多" : gainers < losers ? "偏空" : "中性";
      setStats({ gainers, losers, volume, sentiment });
    } catch {
      // Stats are non-critical — keep the previous values on failure.
    }
  }, []);

  usePolling(refresh, pollMs);

  return stats;
}

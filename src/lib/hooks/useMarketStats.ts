"use client";

import { useCallback, useState } from "react";
import { usePolling } from "./usePolling";

export interface MarketStats {
  gainers: number;
  losers: number;
  /** 今日成交额 (元) */
  volume: number;
  sentiment: "—" | "偏多" | "偏空" | "中性";
  /**
   * 统计口径："全市场" 来自东财全 A 筛选；当该上游不可达时降级为
   * "热门样本"（默认关注列表行情），保证卡片展示真实数字而非 0。
   */
  scope: "全市场" | "热门样本";
}

const INITIAL_STATS: MarketStats = { gainers: 0, losers: 0, volume: 0, sentiment: "—", scope: "全市场" };

/** Minimal shape consumed from the screener endpoint for stats. */
interface ScreenerStatsItem {
  changePercent: number;
  amount: number;
}

function deriveStats(items: ScreenerStatsItem[], scope: MarketStats["scope"]): MarketStats {
  const gainers = items.filter((s) => s.changePercent > 0).length;
  const losers = items.filter((s) => s.changePercent < 0).length;
  const volume = items.reduce((sum, s) => sum + (s.amount || 0), 0);
  const sentiment: MarketStats["sentiment"] =
    gainers > losers ? "偏多" : gainers < losers ? "偏空" : "中性";
  return { gainers, losers, volume, sentiment, scope };
}

/**
 * useMarketStats — derive whole-market breadth (gainers/losers/volume/sentiment)
 * from the A-share screener. Falls back to the default quotes sample when the
 * screener upstream is unavailable. Polls every 2 minutes.
 */
export function useMarketStats(pollMs = 120000): MarketStats {
  const [stats, setStats] = useState<MarketStats>(INITIAL_STATS);

  const refresh = useCallback(async () => {
    // Primary: whole-market screener (EastMoney full A-share list).
    try {
      const res = await fetch("/api/market/screener?sortBy=volume&sortOrder=desc&limit=500");
      if (res.ok) {
        const j = await res.json();
        if (j.success && Array.isArray(j.data) && j.data.length > 0) {
          setStats(deriveStats(j.data as ScreenerStatsItem[], "全市场"));
          return;
        }
      }
    } catch {
      // fall through to the sample fallback
    }

    // Fallback: default quotes sample (Sina → Tencent chain) so the cards
    // still show real numbers; scope is labeled honestly as 热门样本.
    try {
      const res = await fetch("/api/market/quotes");
      if (!res.ok) return;
      const j = await res.json();
      if (!j.success || !Array.isArray(j.data) || j.data.length === 0) return;
      const items = (j.data as { quote: { changePercent: number; amount: number } }[]).map(
        (t) => ({ changePercent: t.quote.changePercent, amount: t.quote.amount })
      );
      setStats(deriveStats(items, "热门样本"));
    } catch {
      // Stats are non-critical — keep the previous values on failure.
    }
  }, []);

  usePolling(refresh, pollMs);

  return stats;
}

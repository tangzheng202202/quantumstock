"use client";

import { useCallback, useState } from "react";
import { fetchQuotes } from "@/lib/data/market";
import { usePolling } from "./usePolling";
import type { TickerData } from "@/types";
import { toast } from "sonner";

export type DataSource = "loading" | "live" | "mock";

export interface UseQuotesResult {
  tickers: TickerData[];
  loading: boolean;
  dataSource: DataSource;
  refresh: () => Promise<void>;
}

/**
 * useQuotes — fetch the default watchlist quotes with 60s polling.
 * Tracks whether data is live or mock for the source indicator.
 */
export function useQuotes(pollMs = 60000): UseQuotesResult {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource>("loading");

  const refresh = useCallback(async () => {
    try {
      const result = await fetchQuotes();
      setTickers(result.data);
      setDataSource(result.source === "mock" ? "mock" : "live");
    } catch {
      setDataSource("mock");
      toast.warning("实时行情获取失败，显示离线数据", {
        description: "网络恢复后将自动刷新",
        id: "quotes-fail",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(refresh, pollMs);

  return { tickers, loading, dataSource, refresh };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchQuotes } from "@/lib/data/market";
import { useWatchlistStore } from "@/lib/stores/watchlist";
import { usePolling } from "./usePolling";
import type { TickerData } from "@/types";

export interface UseWatchlistQuotesResult {
  /** Quotes for the user's watchlist, or popular stocks when empty. */
  quotes: TickerData[];
  loading: boolean;
  /** True when the user has a personal watchlist (vs. showing popular defaults). */
  hasPersonalWatchlist: boolean;
  refresh: () => Promise<void>;
}

const FALLBACK_COUNT = 8;

/**
 * useWatchlistQuotes — load quotes for the user's watchlist (reactive zustand
 * store backed by localStorage), falling back to popular A-shares when empty.
 * Re-fetches whenever the watchlist changes; polls every 60s.
 */
export function useWatchlistQuotes(pollMs = 60000): UseWatchlistQuotesResult {
  const [quotes, setQuotes] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);

  const items = useWatchlistStore((s) => s.items);
  const hydrated = useWatchlistStore((s) => s.hydrated);
  const hydrate = useWatchlistStore((s) => s.hydrate);

  // Hydrate the store from localStorage once on the client.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const hasPersonalWatchlist = hydrated && items.length > 0;

  const refresh = useCallback(async () => {
    try {
      if (items.length > 0) {
        const symbols = items.map((w) => w.symbol);
        const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
        if (res.ok) {
          const j = await res.json();
          if (j.success && j.data) {
            setQuotes(j.data);
            return;
          }
        }
      }
      // Fallback: popular stocks
      const result = await fetchQuotes();
      setQuotes(result.data.slice(0, FALLBACK_COUNT));
    } catch {
      try {
        const result = await fetchQuotes();
        setQuotes(result.data.slice(0, FALLBACK_COUNT));
      } catch {
        // keep previous
      }
    } finally {
      setLoading(false);
    }
  }, [items]);

  // Poll on an interval; re-fetch immediately when the watchlist changes by
  // subscribing to the external store (setState happens in the subscription
  // callback, not synchronously inside an effect body).
  usePolling(refresh, pollMs);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!hydrated) return;
    // Initial load once hydration completes, plus immediate refresh on edits.
    const t = setTimeout(() => void refreshRef.current(), 0);
    const unsub = useWatchlistStore.subscribe((state, prev) => {
      if (state.items !== prev.items) void refreshRef.current();
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [hydrated]);

  return { quotes, loading, hasPersonalWatchlist, refresh };
}

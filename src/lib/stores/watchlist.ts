"use client";

import { create } from "zustand";

/**
 * Reactive watchlist store (zustand).
 *
 * Wraps the same localStorage key as `@/lib/storage/watchlist` so existing
 * data and callers are unaffected, but components subscribed to this store
 * re-render instantly when the watchlist changes anywhere in the app.
 */

const STORAGE_KEY = "quantumstock:watchlist";

export interface WatchlistItem {
  symbol: string;
  name: string;
  market: string;
  addedAt: number;
}

function readStorage(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(list: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage full / unavailable — ignore
  }
}

interface WatchlistState {
  items: WatchlistItem[];
  /** False until the store has hydrated from localStorage on the client. */
  hydrated: boolean;
  /** Load from localStorage (idempotent). Call once on client mount. */
  hydrate: () => void;
  add: (item: Omit<WatchlistItem, "addedAt">) => void;
  remove: (symbol: string) => void;
  toggle: (item: Omit<WatchlistItem, "addedAt">) => boolean;
  isIn: (symbol: string) => boolean;
}

export const useWatchlistStore = create<WatchlistState>()((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ items: readStorage(), hydrated: true });
  },

  add: (item) => {
    const { items } = get();
    if (items.some((w) => w.symbol === item.symbol)) return;
    const next = [...items, { ...item, addedAt: Date.now() }];
    writeStorage(next);
    set({ items: next });
  },

  remove: (symbol) => {
    const next = get().items.filter((w) => w.symbol !== symbol);
    writeStorage(next);
    set({ items: next });
  },

  toggle: (item) => {
    if (get().isIn(item.symbol)) {
      get().remove(item.symbol);
      return false;
    }
    get().add(item);
    return true;
  },

  isIn: (symbol) => get().items.some((w) => w.symbol === symbol),
}));

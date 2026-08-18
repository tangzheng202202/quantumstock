/**
 * Watchlist localStorage utility.
 */

const STORAGE_KEY = "quantumstock:watchlist";

export interface WatchlistItem {
  symbol: string;
  name: string;
  market: string;
  addedAt: number;
}

export function getWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addToWatchlist(item: Omit<WatchlistItem, "addedAt">): void {
  const list = getWatchlist();
  if (list.find((w) => w.symbol === item.symbol)) return; // already exists
  list.push({ ...item, addedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function removeFromWatchlist(symbol: string): void {
  const list = getWatchlist().filter((w) => w.symbol !== symbol);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isInWatchlist(symbol: string): boolean {
  return getWatchlist().some((w) => w.symbol === symbol);
}

export function toggleWatchlist(item: Omit<WatchlistItem, "addedAt">): boolean {
  if (isInWatchlist(item.symbol)) {
    removeFromWatchlist(item.symbol);
    return false;
  } else {
    addToWatchlist(item);
    return true;
  }
}

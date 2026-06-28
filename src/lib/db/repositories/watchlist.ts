/**
 * Watchlist Repository — database-backed with localStorage fallback.
 *
 * Strategy:
 * - When DATABASE_URL is configured and user is authenticated: use Prisma
 * - Otherwise: fall back to localStorage (existing behavior)
 *
 * This allows gradual migration without breaking the local-only experience.
 */

import { prisma, hasDatabase } from "../prisma";
import type { StockInfo } from "@/types";

export interface WatchlistItem extends StockInfo {
  addedAt?: string;
}

/** Get the anonymous user id (single-user mode without auth). */
export function getAnonymousUserId(): string {
  if (typeof window === "undefined") return "anonymous";
  const KEY = "quantumstock:user-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Ensure a stock exists in the database (upsert). */
async function ensureStock(stock: StockInfo): Promise<string> {
  if (!hasDatabase || !prisma) return stock.symbol;
  const record = await prisma.stock.upsert({
    where: { symbol: stock.symbol },
    update: { name: stock.name, market: stock.market },
    create: {
      symbol: stock.symbol,
      name: stock.name,
      market: stock.market,
      currency: stock.currency ?? "CNY",
    },
    select: { id: true },
  });
  return record.id;
}

/** Get all watchlist items. */
export async function getWatchlistItems(): Promise<WatchlistItem[]> {
  // Local fallback
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return getLocalWatchlist();
  }

  try {
    const userId = getAnonymousUserId();
    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    // Get or create default watchlist
    let watchlist = await prisma.watchlist.findFirst({
      where: { userId, isDefault: true },
      include: { items: { include: { stock: true }, orderBy: { addedAt: "desc" } } },
    });

    if (!watchlist) {
      watchlist = await prisma.watchlist.create({
        data: { name: "默认自选", userId, isDefault: true },
        include: { items: { include: { stock: true } } },
      });
    }

    return watchlist.items.map((item: any) => ({
      symbol: item.stock.symbol,
      name: item.stock.name,
      market: item.stock.market as any,
      currency: item.stock.currency,
      addedAt: item.addedAt.toISOString(),
    }));
  } catch (e) {
    console.warn("[watchlist] DB failed, falling back to localStorage:", e);
    return getLocalWatchlist();
  }
}

/** Add a stock to the watchlist. Returns true if added (false if already existed). */
export async function addToWatchlist(stock: StockInfo): Promise<boolean> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return addToLocalWatchlist(stock);
  }

  try {
    const userId = getAnonymousUserId();
    const stockId = await ensureStock(stock);

    // Ensure user + default watchlist exist
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    const watchlist = await prisma.watchlist.upsert({
      where: { id: `${userId}_default` },
      update: {},
      create: { id: `${userId}_default`, name: "默认自选", userId, isDefault: true },
    });

    // Upsert watchlist item (idempotent)
    const existing = await prisma.watchlistItem.findUnique({
      where: { watchlistId_stockId: { watchlistId: watchlist.id, stockId } },
    });
    if (existing) return false;

    await prisma.watchlistItem.create({
      data: { watchlistId: watchlist.id, stockId },
    });
    return true;
  } catch (e) {
    console.warn("[watchlist] DB add failed, falling back to localStorage:", e);
    return addToLocalWatchlist(stock);
  }
}

/** Remove a stock from the watchlist. Returns true if removed. */
export async function removeFromWatchlist(symbol: string): Promise<boolean> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return removeFromLocalWatchlist(symbol);
  }

  try {
    const userId = getAnonymousUserId();
    const stock = await prisma.stock.findUnique({ where: { symbol } });
    if (!stock) return false;

    const watchlist = await prisma.watchlist.findFirst({
      where: { userId, isDefault: true },
    });
    if (!watchlist) return false;

    const item = await prisma.watchlistItem.findUnique({
      where: { watchlistId_stockId: { watchlistId: watchlist.id, stockId: stock.id } },
    });
    if (!item) return false;

    await prisma.watchlistItem.delete({ where: { id: item.id } });
    return true;
  } catch (e) {
    console.warn("[watchlist] DB remove failed, falling back to localStorage:", e);
    return removeFromLocalWatchlist(symbol);
  }
}

// ===== localStorage fallback (existing behavior) =====

const LOCAL_KEY = "quantumstock:watchlist";

function getLocalWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalWatchlist(items: WatchlistItem[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {}
}

function addToLocalWatchlist(stock: StockInfo): boolean {
  const items = getLocalWatchlist();
  if (items.some((i) => i.symbol === stock.symbol)) return false;
  items.unshift({ ...stock, addedAt: new Date().toISOString() });
  saveLocalWatchlist(items);
  return true;
}

function removeFromLocalWatchlist(symbol: string): boolean {
  const items = getLocalWatchlist();
  const before = items.length;
  const filtered = items.filter((i) => i.symbol !== symbol);
  saveLocalWatchlist(filtered);
  return filtered.length < before;
}

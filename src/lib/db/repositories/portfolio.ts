/**
 * Portfolio Repository — database-backed with localStorage fallback.
 *
 * Strategy (consistent with watchlist/alerts repositories):
 * - When DATABASE_URL is configured and user is authenticated: use Prisma
 * - Otherwise: fall back to localStorage
 */

import { prisma, hasDatabase } from "../prisma";
import { getAnonymousUserId } from "./watchlist";

export interface PortfolioPosition {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currency: string;
  market?: string;
}

export interface PortfolioData {
  positions: PortfolioPosition[];
  cash: number;
}

const POSITIONS_KEY = "quantumstock:portfolio:positions";
const CASH_KEY = "quantumstock:portfolio:cash";

/** Get all positions and cash balance. */
export async function getPortfolio(): Promise<PortfolioData> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return getLocalPortfolio();
  }

  try {
    const userId = getAnonymousUserId();

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    // Get or create default portfolio
    let portfolio = await prisma.portfolio.findFirst({
      where: { userId },
      include: {
        positions: { include: { stock: true } },
      },
    });

    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          name: "默认组合",
          userId,
        },
        include: {
          positions: { include: { stock: true } },
        },
      });
    }

    // Fetch latest portfolio history for cash value
    const lastHistory = await prisma.portfolioHistory.findFirst({
      where: { portfolioId: portfolio.id },
      orderBy: { date: "desc" },
    });

    const positions: PortfolioPosition[] = portfolio.positions.map((p: any) => ({
      symbol: p.stock.symbol,
      name: p.stock.name,
      quantity: p.quantity,
      avgCost: p.avgCost,
      currency: p.stock.currency,
      market: p.stock.market,
    }));

    return {
      positions,
      cash: lastHistory?.cash ?? 1000000,
    };
  } catch (e) {
    console.warn("[portfolio] DB failed, falling back to localStorage:", e);
    return getLocalPortfolio();
  }
}

/** Save positions. Returns true on success. */
export async function savePositions(positions: PortfolioPosition[]): Promise<void> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    saveLocalPositions(positions);
    return;
  }

  try {
    const userId = getAnonymousUserId();
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    const portfolio = await prisma.portfolio.upsert({
      where: { id: `${userId}_default` },
      update: {},
      create: { id: `${userId}_default`, name: "默认组合", userId },
    });

    // Remove all existing positions and re-insert
    await prisma.position.deleteMany({ where: { portfolioId: portfolio.id } });

    for (const p of positions) {
      const stock = await prisma.stock.upsert({
        where: { symbol: p.symbol },
        update: { name: p.name, market: p.market ?? "SSE" },
        create: {
          symbol: p.symbol,
          name: p.name,
          market: p.market ?? "SSE",
          currency: p.currency ?? "CNY",
        },
      });

      await prisma.position.create({
        data: {
          portfolioId: portfolio.id,
          stockId: stock.id,
          quantity: p.quantity,
          avgCost: p.avgCost,
        },
      });
    }
  } catch (e) {
    console.warn("[portfolio] DB save failed, falling back to localStorage:", e);
    saveLocalPositions(positions);
  }
}

/** Save cash balance. */
export async function saveCash(cash: number): Promise<void> {
  saveLocalCash(cash);

  if (!hasDatabase || !prisma || typeof window === "undefined") return;

  try {
    const userId = getAnonymousUserId();
    const portfolio = await prisma.portfolio.findFirst({ where: { userId } });
    if (!portfolio) return;

    await prisma.portfolioHistory.create({
      data: {
        portfolioId: portfolio.id,
        date: new Date(),
        totalValue: cash,
        cash,
        pnl: 0,
        pnlPercent: 0,
      },
    });
  } catch (e) {
    console.warn("[portfolio] DB cash save failed:", e);
  }
}

// ===== localStorage fallback =====

function getLocalPortfolio(): PortfolioData {
  try {
    const stored = localStorage.getItem(POSITIONS_KEY);
    const storedCash = localStorage.getItem(CASH_KEY);
    return {
      positions: stored ? JSON.parse(stored) : [],
      cash: storedCash ? parseFloat(storedCash) : 1000000,
    };
  } catch {
    return { positions: [], cash: 1000000 };
  }
}

function saveLocalPositions(positions: PortfolioPosition[]): void {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {}
}

function saveLocalCash(cash: number): void {
  try {
    localStorage.setItem(CASH_KEY, String(cash));
  } catch {}
}

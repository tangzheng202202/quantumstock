/**
 * Strategy & Backtest Repository — database-backed with localStorage fallback.
 */

import { prisma, hasDatabase } from "../prisma";
import { getAnonymousUserId } from "./watchlist";
import type { BacktestConfig, BacktestMetrics } from "@/types";

export interface SavedStrategy {
  id: string;
  name: string;
  description?: string;
  type: "builtin" | "custom";
  code: string; // JSON strategy definition
  createdAt: string;
}

export interface SavedBacktest {
  id: string;
  strategyId: string;
  strategyName: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  metrics: BacktestMetrics;
  equityCurve: { date: string; value: number }[];
  createdAt: string;
}

const STRATEGY_KEY = "quantumstock:strategies";
const BACKTEST_KEY = "quantumstock:backtests";

/** Get all saved strategies. */
export async function getStrategies(): Promise<SavedStrategy[]> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return getLocal(STRATEGY_KEY, []);
  }

  try {
    const userId = getAnonymousUserId();
    const strategies = await prisma.strategy.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return strategies.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description ?? undefined,
      type: s.type as "builtin" | "custom",
      code: s.code,
      createdAt: s.createdAt.toISOString(),
    }));
  } catch (e) {
    console.warn("[strategy] DB failed:", e);
    return getLocal(STRATEGY_KEY, []);
  }
}

/** Save a strategy. */
export async function saveStrategy(data: Omit<SavedStrategy, "id" | "createdAt">): Promise<SavedStrategy> {
  const record: SavedStrategy = {
    id: crypto.randomUUID(),
    ...data,
    createdAt: new Date().toISOString(),
  };

  if (hasDatabase && prisma && typeof window !== "undefined") {
    try {
      const userId = getAnonymousUserId();
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: `${userId}@local` },
      });
      await prisma.strategy.create({
        data: {
          id: record.id,
          userId,
          name: record.name,
          description: record.description,
          type: record.type,
          code: record.code,
        },
      });
    } catch (e) {
      console.warn("[strategy] DB save failed:", e);
    }
  }

  const strategies = await getStrategies();
  strategies.unshift(record);
  saveLocal(STRATEGY_KEY, strategies);
  return record;
}

/** Save backtest result. */
export async function saveBacktest(data: Omit<SavedBacktest, "id" | "createdAt">): Promise<void> {
  const record: SavedBacktest = {
    id: crypto.randomUUID(),
    ...data,
    createdAt: new Date().toISOString(),
  };

  if (hasDatabase && prisma && typeof window !== "undefined") {
    try {
      await prisma.backtestResult.create({
        data: {
          id: record.id,
          strategyId: record.strategyId,
          startDate: new Date(record.startDate),
          endDate: new Date(record.endDate),
          initialCapital: record.initialCapital,
          finalEquity: record.initialCapital * (1 + record.metrics.totalReturn / 100),
          totalReturn: record.metrics.totalReturn,
          annualReturn: record.metrics.annualReturn,
          maxDrawdown: record.metrics.maxDrawdown,
          sharpeRatio: record.metrics.sharpeRatio,
          winRate: record.metrics.winRate,
          totalTrades: record.metrics.totalTrades,
          params: {},
          equityCurve: record.equityCurve as any,
        },
      });
    } catch (e) {
      console.warn("[backtest] DB save failed:", e);
    }
  }

  const backtests = getLocal(BACKTEST_KEY, [] as SavedBacktest[]);
  backtests.unshift(record);
  if (backtests.length > 30) backtests.length = 30;
  saveLocal(BACKTEST_KEY, backtests);
}

/** Get all saved backtests. */
export async function getBacktests(): Promise<SavedBacktest[]> {
  return getLocal(BACKTEST_KEY, []);
}

// ===== helpers =====

function getLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      if (Array.isArray(parsed)) return parsed as unknown as T;
      return parsed;
    }
  } catch {}
  return fallback;
}

function saveLocal(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

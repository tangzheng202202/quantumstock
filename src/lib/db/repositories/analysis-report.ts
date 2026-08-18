/**
 * Analysis Report Repository — database-backed with localStorage fallback.
 * Persists AI analysis reports so users can revisit historical analyses.
 */

import { prisma, hasDatabase } from "../prisma";
import { getAnonymousUserId } from "./watchlist";
import type { AnalysisResult } from "@/types";

const LOCAL_KEY = "quantumstock:analysis-reports";

export interface SavedReport {
  id: string;
  stockSymbol: string;
  stockName: string;
  results: AnalysisResult[];
  createdAt: string;
}

/** Get all saved reports for current user. */
export async function getReports(): Promise<SavedReport[]> {
  if (!hasDatabase || !prisma || typeof window === "undefined") {
    return getLocalReports();
  }

  try {
    const userId = getAnonymousUserId();
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    const reports = await prisma.analysisReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { stock: true },
    });

    // Group by stock+created_at cluster (reports created within 2 min of each other are the same analysis)
    return reports.map(r => ({
      id: r.id,
      stockSymbol: r.stock.symbol,
      stockName: r.stock.name,
      results: [{
        id: r.id,
        stock: { symbol: r.stock.symbol, name: r.stock.name, market: r.stock.market as any, currency: r.stock.currency },
        modelId: r.modelId,
        modelName: r.modelId,
        content: r.content,
        rating: r.rating ?? undefined,
        confidence: r.confidence ?? undefined,
        skills: r.skills,
        createdAt: r.createdAt.toISOString(),
      }],
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (e) {
    console.warn("[analysis] DB failed, falling back to localStorage:", e);
    return getLocalReports();
  }
}

/** Save a multi-model analysis result batch. */
export async function saveReport(
  stockSymbol: string,
  stockName: string,
  stockMarket: string,
  results: AnalysisResult[]
): Promise<void> {
  // Always save to localStorage as cache
  saveLocalReport({
    id: crypto.randomUUID(),
    stockSymbol,
    stockName,
    results,
    createdAt: new Date().toISOString(),
  });

  if (!hasDatabase || !prisma || typeof window === "undefined") return;

  try {
    const userId = getAnonymousUserId();
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@local` },
    });

    const stock = await prisma.stock.upsert({
      where: { symbol: stockSymbol },
      update: { name: stockName },
      create: { symbol: stockSymbol, name: stockName, market: stockMarket as any, currency: "CNY" },
    });

    for (const r of results) {
      await prisma.analysisReport.create({
        data: {
          stockId: stock.id,
          userId,
          modelId: r.modelId,
          skills: r.skills,
          content: r.content,
          rating: r.rating ?? null,
          confidence: r.confidence ?? null,
        },
      });
    }
  } catch (e) {
    console.warn("[analysis] DB save failed:", e);
  }
}

/** Get report by id. */
export async function getReportById(id: string): Promise<SavedReport | null> {
  // Try local first (fastest)
  const reports = await getReports();
  return reports.find(r =>
    r.id === id || r.results.some(rr => rr.id === id)
  ) ?? null;
}

// ===== localStorage fallback =====

function getLocalReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalReport(report: SavedReport): void {
  try {
    const reports = getLocalReports();
    reports.unshift(report);
    // Keep max 50 reports
    if (reports.length > 50) reports.length = 50;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(reports));
  } catch {}
}

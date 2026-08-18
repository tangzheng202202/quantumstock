/**
 * Usage metering (Phase 4) — token/cost accounting for billable actions.
 *
 * Every AI analysis and backtest run emits a UsageEvent. Fire-and-forget:
 * metering failure never breaks user flows.
 *
 * Cost estimation uses a static pricing table (USD per 1M tokens); update
 * PRICING when providers change tariffs. Unknown models cost $0 — better an
 * underestimate than a fabricated number.
 */

import { prisma, hasDatabase } from "@/lib/db/prisma";

export interface UsageEventInput {
  userId?: string | null;
  kind: "ai_analysis" | "backtest" | "market_query";
  provider: string;
  model?: string | null;
  symbol?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  ok?: boolean;
}

/** USD per 1M tokens (input, output). Update as tariffs change. */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4": { in: 15, out: 75 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "gpt-4o": { in: 2.5, out: 10 },
  "deepseek-v4-flash": { in: 0.14, out: 0.28 },
  "deepseek-v4-pro": { in: 0.55, out: 2.19 },
  "minimax-text": { in: 0.5, out: 1.5 },
};

export function estimateCostUsd(model: string | null | undefined, tokensIn: number, tokensOut: number): number {
  if (!model) return 0;
  const p = PRICING[model];
  if (!p) return 0;
  return +((tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out).toFixed(6);
}

/** Record a usage event. Never throws. */
export async function recordUsage(e: UsageEventInput): Promise<void> {
  if (!hasDatabase || !prisma) return;
  try {
    await prisma.usageEvent.create({
      data: {
        userId: e.userId ?? null,
        kind: e.kind,
        provider: e.provider,
        model: e.model ?? null,
        symbol: e.symbol ?? null,
        tokensIn: e.tokensIn ?? 0,
        tokensOut: e.tokensOut ?? 0,
        costUsd: estimateCostUsd(e.model, e.tokensIn ?? 0, e.tokensOut ?? 0),
        latencyMs: e.latencyMs ?? 0,
        ok: e.ok ?? true,
      },
    });
  } catch {
    // metering must never break the request path
  }
}

/** Aggregated usage summary (dashboard endpoint). */
export interface UsageSummary {
  since: string;
  totals: { events: number; tokensIn: number; tokensOut: number; costUsd: number; avgLatencyMs: number; errorRate: number };
  byProvider: { provider: string; events: number; costUsd: number; tokens: number }[];
  daily: { date: string; events: number; costUsd: number }[];
}

export async function usageSummary(days = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 86400_000);
  const empty: UsageSummary = {
    since: since.toISOString(),
    totals: { events: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, avgLatencyMs: 0, errorRate: 0 },
    byProvider: [],
    daily: [],
  };
  if (!hasDatabase || !prisma) return empty;

  const events = await prisma.usageEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { provider: true, tokensIn: true, tokensOut: true, costUsd: true, latencyMs: true, ok: true, createdAt: true },
  });

  if (events.length === 0) return empty;

  const totals = {
    events: events.length,
    tokensIn: events.reduce((s, e) => s + e.tokensIn, 0),
    tokensOut: events.reduce((s, e) => s + e.tokensOut, 0),
    costUsd: +events.reduce((s, e) => s + e.costUsd, 0).toFixed(4),
    avgLatencyMs: Math.round(events.reduce((s, e) => s + e.latencyMs, 0) / events.length),
    errorRate: +(events.filter(e => !e.ok).length / events.length).toFixed(4),
  };

  const byProviderMap = new Map<string, { events: number; costUsd: number; tokens: number }>();
  const dailyMap = new Map<string, { events: number; costUsd: number }>();
  for (const e of events) {
    const p = byProviderMap.get(e.provider) ?? { events: 0, costUsd: 0, tokens: 0 };
    p.events++; p.costUsd += e.costUsd; p.tokens += e.tokensIn + e.tokensOut;
    byProviderMap.set(e.provider, p);

    const d = e.createdAt.toISOString().slice(0, 10);
    const day = dailyMap.get(d) ?? { events: 0, costUsd: 0 };
    day.events++; day.costUsd += e.costUsd;
    dailyMap.set(d, day);
  }

  return {
    since: since.toISOString(),
    totals,
    byProvider: [...byProviderMap.entries()]
      .map(([provider, v]) => ({ provider, events: v.events, costUsd: +v.costUsd.toFixed(4), tokens: v.tokens }))
      .sort((a, b) => b.costUsd - a.costUsd),
    daily: [...dailyMap.entries()]
      .map(([date, v]) => ({ date, events: v.events, costUsd: +v.costUsd.toFixed(4) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

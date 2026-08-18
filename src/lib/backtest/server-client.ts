/**
 * Server-side backtest client (Phase 3) — calls the Python engine's
 * /backtest/v2 endpoint; falls back to the local TS engine when the
 * engine is unreachable (dev / offline).
 *
 * The server engine is authoritative: same strategies + full A-share
 * constraints (T+1, limit-up/down, stamp tax, round lots).
 */

import { runBacktest, type BacktestResult, type KLineBar, type StrategyParams, type MarketConstraints, A_SHARE_MAIN, A_SHARE_GEM, UNRESTRICTED } from "./engine";

export type { BacktestResult, KLineBar, StrategyParams };
export { fetchBacktestData } from "./engine";

const ENGINE_URL = process.env.PYTHON_ENGINE_URL ?? "http://localhost:8000";

/** Infer market constraints from symbol — mirrors python-engine _constraints_for. */
export function constraintsForSymbol(symbol: string): MarketConstraints {
  if (/^\d{6}$/.test(symbol)) {
    if (symbol.startsWith("688") || symbol.startsWith("300") || symbol.startsWith("301")) {
      return A_SHARE_GEM;
    }
    return A_SHARE_MAIN;
  }
  return UNRESTRICTED;
}

interface ServerBar {
  date: string;
  open: number; high: number; low: number; close: number; volume: number;
  prevClose?: number | null;
}

export interface BacktestOutcome {
  result: BacktestResult;
  engine: "python" | "local";
}

export async function runBacktestWithFallback(
  bars: KLineBar[],
  strategyId: string,
  params: StrategyParams,
  opts: { symbol?: string; initialCapital?: number; commission?: number } = {}
): Promise<BacktestOutcome> {
  // Try server engine first
  try {
    const res = await fetch(`${ENGINE_URL}/backtest/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        bars: bars.map(b => ({
          date: b.date, open: b.open, high: b.high, low: b.low,
          close: b.close, volume: b.volume, prevClose: b.prevClose ?? null,
        })),
        strategyId,
        params,
        initialCapital: opts.initialCapital ?? 1_000_000,
        commission: opts.commission ?? 0.0003,
        market: opts.symbol ? constraintsForSymbol(opts.symbol) : UNRESTRICTED,
        slippagePct: 0.0005,
      }),
    });
    if (!res.ok) throw new Error(`engine HTTP ${res.status}`);
    const j = await res.json();
    if (!j.success || !j.data?.metrics) throw new Error("engine returned no data");
    return { result: j.data as BacktestResult, engine: "python" };
  } catch {
    // Engine down / unreachable — local engine keeps the feature alive
  }

  const market = opts.symbol ? constraintsForSymbol(opts.symbol) : UNRESTRICTED;
  return {
    result: runBacktest(bars, strategyId, params, opts.initialCapital, opts.commission, market),
    engine: "local",
  };
}

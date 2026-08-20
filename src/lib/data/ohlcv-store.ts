/**
 * OHLCV Store — K-line read/write with DB-first + API backfill (Phase 2).
 *
 * Read path:
 *   1. Query OhlcvBar for [symbol, interval] latest N bars
 *   2. If stale/missing (fewer bars than requested and last bar older than today),
 *      backfill from the live API chain and upsert into DB
 *   3. Return merged bars with `source` metadata
 *
 * Write path: `upsertBars` batch upserts (on conflict symbol+interval+date do update —
 * the live source may restate the latest intraday-turned-final bar).
 *
 * DB unavailable → transparently falls back to live API only (dev mode).
 */

import { prisma, hasDatabase } from "@/lib/db/prisma";
import { fetchSinaKLine } from "./sina";
import { fetchEMKLine } from "./eastmoney";

export interface StoredBar {
  date: string; // ISO date (yyyy-mm-dd)
  timestamp: number; // ms epoch (client chart contract)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResult {
  bars: StoredBar[];
  source: "db" | "db+backfill" | "live";
}

const TRADING_DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Live API chain: Sina → Python engine (urllib direct) → EastMoney. Returns ISO-date bars. */
export async function fetchLiveBars(symbol: string, interval: string, count: number): Promise<StoredBar[]> {
  const period = interval === "1wk" ? "weekly" : interval === "1mo" ? "monthly" : "daily";
  const mapTs = (b: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }): StoredBar =>
    ({ date: toISODate(new Date(b.timestamp)), timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });

  if (/^\d{6}$/.test(symbol)) {
    try {
      const bars = await fetchSinaKLine(symbol, Math.min(count, 250));
      return bars.map(mapTs);
    } catch { /* fall through to engine */ }

    // Python engine (urllib direct-connect) — resilient when Node fetch is
    // blocked by proxy/TUN setups on the host.
    try {
      const ENGINE = process.env.PYTHON_ENGINE_URL ?? "http://localhost:8000";
      const res = await fetch(`${ENGINE}/market/kline?symbol=${symbol}&days=${Math.min(count, 1000)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.success && Array.isArray(j.data) && j.data.length > 0) {
          return j.data.map((b: { date: string; timestamp: number; open: number; high: number; low: number; close: number; volume: number }) => ({
            date: b.date, timestamp: b.timestamp,
            open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
          }));
        }
      }
    } catch { /* fall through to EM */ }

    const em = await fetchEMKLine(symbol, period, Math.min(count, 500));
    return em.map(mapTs);
  }
  const em = await fetchEMKLine(symbol, period, Math.min(count, 500));
  return em.map(mapTs);
}

/** Batch upsert bars into OhlcvBar. Silent no-op without DB. */
export async function upsertBars(symbol: string, interval: string, bars: StoredBar[]): Promise<number> {
  if (!hasDatabase || !prisma || bars.length === 0) return 0;
  const db = prisma;
  let written = 0;
  const BATCH = 250;
  for (let i = 0; i < bars.length; i += BATCH) {
    const batch = bars.slice(i, i + BATCH);
    await db.$transaction(
      batch.map(b =>
        db.ohlcvBar.upsert({
          where: {
            symbol_interval_date: {
              symbol,
              interval,
              date: new Date(b.date),
            },
          },
          update: { open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume },
          create: {
            symbol,
            interval,
            date: new Date(b.date),
            open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
          },
        })
      )
    );
    written += batch.length;
  }
  return written;
}

/**
 * Get bars DB-first with automatic backfill.
 * `count` = desired bar count; staleness tolerance defaults to 1 trading day
 * (intraday callers may pass 0 to always refresh the latest bar via live).
 */
export async function getBars(
  symbol: string,
  interval: string = "1d",
  count = 250,
  opts: { staleDays?: number } = {}
): Promise<OhlcvResult> {
  const staleDays = opts.staleDays ?? 1;

  if (hasDatabase && prisma) {
    const rows = await prisma.ohlcvBar.findMany({
      where: { symbol, interval },
      orderBy: { date: "desc" },
      take: count,
    });

    const bars: StoredBar[] = rows
      .map(r => ({
        date: toISODate(r.date),
        timestamp: r.date.getTime(),
        open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
      }))
      .reverse();

    const newest = bars[bars.length - 1];
    const ageDays = newest ? (Date.now() - new Date(newest.date).getTime()) / TRADING_DAY_MS : Infinity;
    const fresh = ageDays <= staleDays + 2 && bars.length >= Math.min(count, 60);

    if (fresh) return { bars, source: "db" };

    // Backfill from live then persist
    try {
      const live = await fetchLiveBars(symbol, interval, count);
      if (live.length > 0) {
        await upsertBars(symbol, interval, live).catch(() => {});
        return { bars: live, source: "db+backfill" };
      }
    } catch {
      // fall through to whatever we have
    }
    if (bars.length > 0) return { bars, source: "db" };
  }

  // No DB / no stored data — live only.
  // Upstream failure yields an empty result (graceful degradation) rather
  // than a thrown error: the client renders an empty state instead of a 5xx.
  try {
    const live = await fetchLiveBars(symbol, interval, count);
    return { bars: live, source: "live" };
  } catch {
    return { bars: [], source: "live" };
  }
}

/**
 * Ingest N symbols' daily bars (for cron / warm-up). Returns per-symbol status.
 * On upstream throttling (free APIs rate-limit burst traffic) retries with
 * exponential backoff: 30s → 60s → 120s, max 3 attempts per symbol.
 */
export async function ingestSymbols(
  symbols: string[],
  interval = "1d",
  count = 250,
  opts: { onProgress?: (msg: string) => void } = {}
): Promise<{ symbol: string; ok: boolean; bars: number; error?: string }[]> {
  const out: { symbol: string; ok: boolean; bars: number; error?: string }[] = [];
  const log = opts.onProgress ?? (() => {});
  const BACKOFFS = [30_000, 60_000, 120_000];

  for (const s of symbols) {
    let lastErr = "";
    let done = false;
    for (let attempt = 0; attempt <= BACKOFFS.length && !done; attempt++) {
      try {
        const live = await fetchLiveBars(s, interval, count);
        if (live.length === 0) throw new Error("empty bars (upstream throttled?)");
        const written = await upsertBars(s, interval, live);
        out.push({ symbol: s, ok: true, bars: written });
        done = true;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (attempt < BACKOFFS.length) {
          const wait = BACKOFFS[attempt];
          log(`throttled on ${s}, backing off ${wait / 1000}s (attempt ${attempt + 1})`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
    if (!done) out.push({ symbol: s, ok: false, bars: 0, error: lastErr });
  }
  return out;
}

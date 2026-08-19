/**
 * kline-ingest — K 线批量回填 worker（Phase 2 OLAP-lite）.
 *
 * Pulls daily bars for active Stock rows (or --symbols) into OhlcvBar.
 *
 * Usage:
 *   tsx scripts/kline-ingest.ts                      # all active symbols
 *   tsx scripts/kline-ingest.ts --symbols=600519,300750
 *   tsx scripts/kline-ingest.ts --limit=100          # first 100
 *   tsx scripts/kline-ingest.ts --resume             # skip symbols already ingested (by OhlcvBar presence)
 *
 * Rate limit: --delay-ms between symbols (default 300). Production: daily cron
 * after market close.
 */

import { PrismaClient } from "@prisma/client";
import { ingestSymbols } from "../src/lib/data/ohlcv-store";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const symbolsArg = args.find(a => a.startsWith("--symbols="))?.split("=")[1];
  const limitArg = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0");
  const delayMs = parseInt(args.find(a => a.startsWith("--delay-ms="))?.split("=")[1] ?? "300");
  const resume = args.includes("--resume");

  let symbols: string[];
  if (symbolsArg) {
    symbols = symbolsArg.split(",").map(s => s.trim()).filter(Boolean);
  } else {
    const stocks = await prisma.stock.findMany({
      where: { isActive: true },
      select: { symbol: true },
      orderBy: { symbol: "asc" },
      ...(limitArg > 0 ? { take: limitArg } : {}),
    });
    symbols = stocks.map(s => s.symbol);

    if (resume) {
      // Skip symbols that already have ≥100 bars ingested (idempotent re-runs)
      const done = await prisma.ohlcvBar.groupBy({
        by: ["symbol"],
        where: { symbol: { in: symbols }, interval: "1d" },
        _count: { symbol: true },
      });
      const doneSet = new Set(done.filter(g => g._count.symbol >= 100).map(g => g.symbol));
      const before = symbols.length;
      symbols = symbols.filter(s => !doneSet.has(s));
      console.log(`[kline-ingest] resume: skipping ${before - symbols.length} already-ingested symbols`);
    }
  }

  console.log(`[kline-ingest] ingesting ${symbols.length} symbols (daily, 250 bars, ${delayMs}ms delay)...`);
  const t0 = Date.now();

  let ok = 0, failed = 0, totalBars = 0;
  const failures: { symbol: string; error: string }[] = [];

  // Chunked with progress reporting
  const CHUNK = 200;
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    const results = await ingestSymbols(chunk, "1d", 250);
    for (const r of results) {
      if (r.ok) { ok++; totalBars += r.bars; }
      else { failed++; failures.push({ symbol: r.symbol, error: r.error ?? "?" }); }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[kline-ingest] progress ${Math.min(i + CHUNK, symbols.length)}/${symbols.length} | ok=${ok} fail=${failed} bars=${totalBars} | ${elapsed}s elapsed`);
  }

  console.log(`[kline-ingest] done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ok} ok, ${failed} failed, ${totalBars} bars written`);
  if (failures.length > 0) {
    const fs = await import("fs");
    fs.writeFileSync("/tmp/kline-ingest-failures.json", JSON.stringify(failures, null, 2));
    console.log(`  failures written to /tmp/kline-ingest-failures.json (first 10):`);
    for (const f of failures.slice(0, 10)) console.warn(`  FAIL ${f.symbol}: ${f.error}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

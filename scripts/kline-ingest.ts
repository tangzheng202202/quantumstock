/**
 * kline-ingest — K 线批量回填 worker（Phase 2 OLAP-lite）。
 *
 * 从 Stock 表取 isActive 标的（或 --symbols 指定），批量拉取日线并写入 OhlcvBar。
 *
 * 用法：
 *   tsx scripts/kline-ingest.ts                      # 全量 active 标的
 *   tsx scripts/kline-ingest.ts --symbols=600519,300750
 *   tsx scripts/kline-ingest.ts --limit=100          # 前 100 个
 *
 * 限速：标的间 300ms 间隔，避免数据源封禁。生产建议每日收盘后 cron。
 */

import { PrismaClient } from "@prisma/client";
import { ingestSymbols } from "../src/lib/data/ohlcv-store";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const symbolsArg = args.find(a => a.startsWith("--symbols="))?.split("=")[1];
  const limitArg = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0");

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
  }

  console.log(`[kline-ingest] ingesting ${symbols.length} symbols (daily, 250 bars)...`);
  const t0 = Date.now();
  const results = await ingestSymbols(symbols, "1d", 250);

  const ok = results.filter(r => r.ok);
  const fail = results.filter(r => !r.ok);
  const totalBars = ok.reduce((s, r) => s + r.bars, 0);

  console.log(`[kline-ingest] done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ok.length} ok, ${fail.length} failed, ${totalBars} bars written`);
  for (const f of fail.slice(0, 10)) {
    console.warn(`  FAIL ${f.symbol}: ${f.error}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

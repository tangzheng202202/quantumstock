/**
 * sync-stock-universe — stock universe 单一事实源同步（Phase 2）。
 *
 * 将 python-engine/generate_stocks.py 生成的 src/data/a-stocks.json 全量 upsert
 * 到 PostgreSQL Stock 表，使数据库成为唯一事实源（JSON 退化为分发快照）。
 *
 * 用法（需要 DATABASE_URL）：
 *   npm run db:sync-universe        # tsx scripts/sync-stock-universe.ts
 *
 * 建议每日收盘后由 cron 执行：
 *   0 18 * * 1-5  cd /app && tsx scripts/sync-stock-universe.ts
 */

import { PrismaClient } from "@prisma/client";
import stocks from "../src/data/a-stocks.json";

interface RawStock {
  symbol: string;
  name: string;
  market?: string;
  currency?: string;
}

async function main() {
  const prisma = new PrismaClient();
  const list = stocks as RawStock[];

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL 未设置，无法同步。");
    process.exit(1);
  }

  console.log(`Loaded ${list.length} stocks from a-stocks.json`);

  let created = 0, updated = 0, deactivated = 0;
  const BATCH = 500;

  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const symbols = batch.map(s => s.symbol);

    const existing = await prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true },
    });
    const existingSet = new Set(existing.map(e => e.symbol));

    for (const s of batch) {
      if (existingSet.has(s.symbol)) {
        updated++;
      } else {
        created++;
      }
      await prisma.stock.upsert({
        where: { symbol: s.symbol },
        update: {
          name: s.name,
          market: s.market ?? (s.symbol.startsWith("6") ? "SSE" : "SZSE"),
          currency: s.currency ?? "CNY",
          isActive: true,
        },
        create: {
          symbol: s.symbol,
          name: s.name,
          market: s.market ?? (s.symbol.startsWith("6") ? "SSE" : "SZSE"),
          currency: s.currency ?? "CNY",
          isActive: true,
        },
      });
    }
    console.log(`  batch ${i / BATCH + 1}: ${batch.length} rows`);
  }

  // Deactivate stocks no longer present in the snapshot (delisted/renamed)
  const symbolSet = new Set(list.map(s => s.symbol));
  const stale = await prisma.stock.findMany({
    where: { symbol: { notIn: [...symbolSet] } },
    select: { symbol: true },
  });
  if (stale.length > 0) {
    await prisma.stock.updateMany({
      where: { symbol: { in: stale.map(s => s.symbol) } },
      data: { isActive: false },
    });
    deactivated = stale.length;
  }

  console.log(`Done: ${created} created, ${updated} updated, ${deactivated} deactivated.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

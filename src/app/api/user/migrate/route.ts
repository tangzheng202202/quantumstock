import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, hasDatabase } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/migrate
 * Migrate localStorage data to PostgreSQL for authenticated users.
 *
 * Body: {
 *   watchlist: StockInfo[]
 *   alerts: AlertRule[]
 *   portfolio: { positions: Position[]; cash: number } | null
 * }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
  }

  if (!hasDatabase || !prisma) {
    return NextResponse.json({
      success: false,
      error: "数据库未配置。请在 .env.local 中设置 DATABASE_URL 后重试。",
    }, { status: 503 });
  }

  const stats = { watchlist: 0, alerts: 0, positions: 0 };

  try {
    const body = await request.json();

    // Ensure user record exists
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@clerk` },
    });

    // 1. Migrate watchlist
    if (Array.isArray(body.watchlist) && body.watchlist.length > 0) {
      let watchlist = await prisma.watchlist.findFirst({
        where: { userId, isDefault: true },
      });
      if (!watchlist) {
        watchlist = await prisma.watchlist.create({
          data: { userId, name: "默认自选", isDefault: true },
        });
      }

      for (const item of body.watchlist) {
        if (!item.symbol) continue;
        const stock = await prisma.stock.upsert({
          where: { symbol: item.symbol },
          update: { name: item.name ?? item.symbol, market: item.market ?? "SSE" },
          create: {
            symbol: item.symbol,
            name: item.name ?? item.symbol,
            market: item.market ?? "SSE",
            currency: item.currency ?? "CNY",
          },
        });

        const existing = await prisma.watchlistItem.findUnique({
          where: { watchlistId_stockId: { watchlistId: watchlist.id, stockId: stock.id } },
        });
        if (!existing) {
          await prisma.watchlistItem.create({
            data: { watchlistId: watchlist.id, stockId: stock.id },
          });
          stats.watchlist++;
        }
      }
    }

    // 2. Migrate alerts
    if (Array.isArray(body.alerts) && body.alerts.length > 0) {
      for (const alert of body.alerts) {
        if (!alert.symbol) continue;
        await prisma.alert.create({
          data: {
            userId,
            type: alert.type ?? "price_above",
            condition: "above",
            value: alert.value ?? 0,
            params: { symbol: alert.symbol, name: alert.name ?? alert.symbol },
            isEnabled: alert.isEnabled ?? true,
            isTriggered: false,
          },
        });
        stats.alerts++;
      }
    }

    // 3. Migrate portfolio
    if (body.portfolio?.positions && Array.isArray(body.portfolio.positions) && body.portfolio.positions.length > 0) {
      let portfolio = await prisma.portfolio.findFirst({ where: { userId } });
      if (!portfolio) {
        portfolio = await prisma.portfolio.create({
          data: { userId, name: "默认组合" },
        });
      }

      for (const pos of body.portfolio.positions) {
        if (!pos.symbol) continue;
        const stock = await prisma.stock.upsert({
          where: { symbol: pos.symbol },
          update: { name: pos.name ?? pos.symbol, market: pos.market ?? "SSE" },
          create: {
            symbol: pos.symbol,
            name: pos.name ?? pos.symbol,
            market: pos.market ?? "SSE",
            currency: pos.currency ?? "CNY",
          },
        });

        await prisma.position.create({
          data: {
            portfolioId: portfolio.id,
            stockId: stock.id,
            quantity: pos.quantity ?? 0,
            avgCost: pos.avgCost ?? 0,
          },
        });
        stats.positions++;
      }

      // Save cash snapshot
      if (body.portfolio.cash != null) {
        await prisma.portfolioHistory.create({
          data: {
            portfolioId: portfolio.id,
            date: new Date(),
            totalValue: body.portfolio.cash,
            cash: body.portfolio.cash,
            pnl: 0,
            pnlPercent: 0,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      message: `迁移完成：自选股${stats.watchlist}只，预警${stats.alerts}条，持仓${stats.positions}只`,
    });
  } catch (error) {
    console.error("[migrate] error:", error);
    return NextResponse.json(
      { success: false, error: "数据迁移失败，请重试", stats },
      { status: 500 }
    );
  }
}

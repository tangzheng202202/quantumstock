import { NextRequest, NextResponse } from "next/server";
import { fetchAllAShares } from "@/lib/data/eastmoney";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/screener?sortBy=changePercent&sortOrder=desc&peMax=15&roeMin=15&limit=200
 * Returns all A-shares with financial data, with optional filters.
 */
export async function GET(req: NextRequest) {
  const sortBy = req.nextUrl.searchParams.get("sortBy") ?? "changePercent";
  const sortOrder = (req.nextUrl.searchParams.get("sortOrder") ?? "desc") as "asc" | "desc";
  const peMax = req.nextUrl.searchParams.get("peMax");
  const roeMin = req.nextUrl.searchParams.get("roeMin");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "200");

  try {
    const data = await fetchAllAShares({
      sortBy,
      sortOrder,
      peMax: peMax ? parseFloat(peMax) : undefined,
      roeMin: roeMin ? parseFloat(roeMin) : undefined,
      limit: Math.min(limit, 500),
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        source: "eastmoney",
        count: data.length,
        sortBy,
        sortOrder,
        filters: { peMax: peMax ?? null, roeMin: roeMin ?? null },
      },
    });
  } catch (e) {
    console.error(`[screener] failed:`, e);
    return NextResponse.json(
      { success: false, error: `全量A股数据获取失败: ${e instanceof Error ? e.message : "未知错误"}` },
      { status: 500 }
    );
  }
}

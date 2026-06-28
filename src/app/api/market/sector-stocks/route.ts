import { NextRequest, NextResponse } from "next/server";
import { fetchSectorConstituents } from "@/lib/data/eastmoney";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/sector-stocks?code=BK0477
 * Returns constituent stocks within an industry sector.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ success: false, error: "code required (e.g. BK0477)" }, { status: 400 });
  }

  try {
    const stocks = await fetchSectorConstituents(code);
    const upCount = stocks.filter(s => s.changePercent > 0).length;
    const downCount = stocks.filter(s => s.changePercent < 0).length;
    return NextResponse.json({
      success: true,
      data: stocks,
      meta: {
        source: "eastmoney",
        code,
        count: stocks.length,
        up: upCount,
        down: downCount,
      },
    });
  } catch (e) {
    console.error(`[sector-stocks] ${code} failed:`, e);
    return NextResponse.json(
      { success: false, error: `板块成分股获取失败: ${e instanceof Error ? e.message : "未知错误"}` },
      { status: 500 }
    );
  }
}

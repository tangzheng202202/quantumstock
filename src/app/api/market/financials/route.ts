import { NextRequest, NextResponse } from "next/server";
import { fetchAStockFinancials } from "@/lib/data/eastmoney";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/financials?symbol=600519
 * Returns real financial metrics for A-share stocks.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
  }

  try {
    const data = await fetchAStockFinancials(symbol);
    if (!data) {
      return NextResponse.json({
        success: false,
        error: `暂无 ${symbol} 的财务数据。仅支持A股。`,
      }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data,
      meta: { source: "eastmoney", symbol },
    });
  } catch (e) {
    console.error(`[financials] ${symbol} failed:`, e);
    return NextResponse.json(
      { success: false, error: `获取 ${symbol} 财务数据失败` },
      { status: 500 }
    );
  }
}

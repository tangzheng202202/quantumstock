import { NextRequest, NextResponse } from "next/server";
import { fetchIndustrySectors, fetchSectorRotation } from "@/lib/data/eastmoney";
import { MOCK_HEATMAP, MOCK_SECTOR_ROTATION } from "@/lib/data/market";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/sectors?dimension=change|rotation
 * Returns real-time industry board data from EastMoney.
 * Falls back to mock if EastMoney is unreachable.
 */
export async function GET(req: NextRequest) {
  const dimension = req.nextUrl.searchParams.get("dimension") ?? "change";

  try {
    if (dimension === "rotation") {
      const data = await fetchSectorRotation();
      if (data.length > 0) {
        return NextResponse.json({ success: true, data, meta: { source: "eastmoney", count: data.length } });
      }
      return NextResponse.json({ success: true, data: MOCK_SECTOR_ROTATION, meta: { source: "mock" } });
    }

    // default: change (heatmap)
    const data = await fetchIndustrySectors();
    if (data.length > 0) {
      return NextResponse.json({ success: true, data, meta: { source: "eastmoney", count: data.length } });
    }
    return NextResponse.json({ success: true, data: MOCK_HEATMAP, meta: { source: "mock" } });
  } catch (e) {
    console.warn(`[sectors] EastMoney failed: ${e}`);
    const fallback = dimension === "rotation" ? MOCK_SECTOR_ROTATION : MOCK_HEATMAP;
    return NextResponse.json({ success: true, data: fallback, meta: { source: "mock" } });
  }
}

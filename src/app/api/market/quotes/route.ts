import { NextRequest, NextResponse } from "next/server";
import { fetchSinaQuotes } from "@/lib/data/sina";
import { getMockTickers } from "@/lib/data/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const symbols = symbolsParam?.split(",").map(s => s.trim()).filter(Boolean) ?? [
    "600519", "300750", "000858", "601398", "688981", "300059", "002594", "600036", "00700", "AAPL"
  ];

  try {
    const data = await fetchSinaQuotes(symbols);
    if (data.length > 0) {
      return NextResponse.json({ success: true, data, meta: { source: "sina" } });
    }
    throw new Error("No data from Sina");
  } catch (e) {
    console.warn(`[quotes] Sina failed: ${e}`);
    return NextResponse.json({ success: true, data: getMockTickers(), meta: { source: "mock" } });
  }
}

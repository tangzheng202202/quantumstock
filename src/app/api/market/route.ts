import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/market
 * Unified market data endpoint. Proxies to specialized sub-routes
 * instead of returning hardcoded mock data.
 *
 * Query params:
 *   - type: indices | quotes | heatmap | ticker
 *   - symbol: stock symbol (required for ticker)
 *   - symbols: comma-separated list (for quotes)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "indices";
  const symbol = searchParams.get("symbol");
  const symbols = searchParams.get("symbols");
  const baseURL = new URL(request.url).origin;

  try {
    switch (type) {
      case "indices": {
        const res = await fetch(`${baseURL}/api/market/indices`, { cache: "no-store" });
        const j = await res.json();
        return NextResponse.json(j, { status: res.status });
      }

      case "heatmap": {
        const res = await fetch(`${baseURL}/api/market/sectors?dimension=change`, { cache: "no-store" });
        const j = await res.json();
        return NextResponse.json(j, { status: res.status });
      }

      case "quotes": {
        const q = symbols ? `?symbols=${encodeURIComponent(symbols)}` : "";
        const res = await fetch(`${baseURL}/api/market/quotes${q}`, { cache: "no-store" });
        const j = await res.json();
        return NextResponse.json(j, { status: res.status });
      }

      case "ticker": {
        if (!symbol) {
          return NextResponse.json(
            { success: false, error: "symbol is required" },
            { status: 400 }
          );
        }
        const res = await fetch(`${baseURL}/api/market/ticker?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
        const j = await res.json();
        return NextResponse.json(j, { status: res.status });
      }

      default:
        return NextResponse.json(
          { success: false, error: "Invalid type. Supported: indices | quotes | heatmap | ticker" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[/api/market] proxy failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}

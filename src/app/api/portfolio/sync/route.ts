import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/portfolio/sync
 * Receive portfolio positions pushed from QMT (迅投) Python sync script.
 *
 * Request body:
 * {
 *   token?: string,          // Optional auth token
 *   account?: string,        // QMT account ID
 *   cash?: number,           // Available cash
 *   positions: [{
 *     symbol: string,        // Stock code (600519)
 *     name: string,          // Stock name
 *     quantity: number,      // Total shares
 *     availableQuantity?: number, // Available to sell
 *     avgCost: number,       // Average cost per share
 *     market: string,        // SSE/SZSE/HKEX/NASDAQ
 *     currency: string,      // CNY/HKD/USD
 *   }]
 * }
 *
 * Response:
 * { success: true, received: N, timestamp: ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.positions || !Array.isArray(body.positions)) {
      return NextResponse.json(
        { success: false, error: "positions array required" },
        { status: 400 }
      );
    }

    // Optional token verification
    const configToken = process.env.QMT_SYNC_TOKEN;
    if (configToken) {
      if (body.token !== configToken) {
        return NextResponse.json(
          { success: false, error: "Invalid sync token" },
          { status: 401 }
        );
      }
    }

    // Validate each position
    const validPositions: any[] = [];
    for (const pos of body.positions) {
      if (!pos.symbol || typeof pos.quantity !== "number" || typeof pos.avgCost !== "number") {
        continue; // Skip invalid entries
      }
      validPositions.push({
        symbol: String(pos.symbol),
        name: String(pos.name ?? pos.symbol),
        quantity: Number(pos.quantity),
        avgCost: Number(pos.avgCost),
        currency: String(pos.currency ?? "CNY"),
        // Keep original fields for advanced display
        availableQuantity: pos.availableQuantity ?? pos.quantity,
        market: pos.market ?? "SSE",
      });
    }

    if (validPositions.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid positions in payload",
      }, { status: 400 });
    }

    // Return the validated data — the client will write it to localStorage
    // (We don't have server-side session storage in this app)
    return NextResponse.json({
      success: true,
      received: validPositions.length,
      cash: body.cash ?? 0,
      account: body.account ?? "unknown",
      positions: validPositions,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[/api/portfolio/sync] error:", error);
    return NextResponse.json(
      { success: false, error: `Sync failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/portfolio/sync
 * Health check endpoint — used by QMT Python script to verify connectivity.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    service: "quantumstock-portfolio-sync",
    version: "1.0",
    timestamp: Date.now(),
  });
}

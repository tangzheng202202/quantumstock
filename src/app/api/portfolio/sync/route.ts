import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validate } from "@/lib/api/validation";
import type { Market } from "@/types";

export const dynamic = "force-dynamic";

/** A normalized portfolio position pushed from QMT. */
export interface SyncedPosition {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currency: string;
  availableQuantity: number;
  market: Market | string;
}

const positionSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  quantity: z.number(),
  availableQuantity: z.number().optional(),
  avgCost: z.number(),
  market: z.string().optional(),
  currency: z.string().optional(),
});

const syncBodySchema = z.object({
  token: z.string().optional(),
  account: z.string().optional(),
  cash: z.number().optional(),
  positions: z.array(positionSchema).min(1, "positions array required"),
});

/**
 * POST /api/portfolio/sync
 * Receive portfolio positions pushed from QMT (迅投) Python sync script.
 * Response shape is intentionally flat (consumed by the external script).
 */
export const POST = withApiHandler("portfolio/sync", async (request: NextRequest) => {
  const raw = await request.json().catch(() => {
    throw new ValidationError("请求体必须是合法 JSON");
  });

  const body = validate(syncBodySchema, raw);

  // Optional token verification
  const configToken = process.env.QMT_SYNC_TOKEN;
  if (configToken && body.token !== configToken) {
    return NextResponse.json(
      { success: false, error: "Invalid sync token" },
      { status: 401 }
    );
  }

  // Normalize each position
  const validPositions: SyncedPosition[] = body.positions.map((pos) => ({
    symbol: pos.symbol,
    name: pos.name ?? pos.symbol,
    quantity: pos.quantity,
    avgCost: pos.avgCost,
    currency: pos.currency ?? "CNY",
    availableQuantity: pos.availableQuantity ?? pos.quantity,
    market: pos.market ?? "SSE",
  }));

  // The client (QMT script) writes this to localStorage — no server session here.
  return NextResponse.json({
    success: true,
    received: validPositions.length,
    cash: body.cash ?? 0,
    account: body.account ?? "unknown",
    positions: validPositions,
    timestamp: Date.now(),
  });
});

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

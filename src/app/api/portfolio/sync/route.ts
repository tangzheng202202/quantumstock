import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
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
  token: z.string(),
  account: z.string().optional(),
  cash: z.number().optional(),
  positions: z.array(positionSchema),
});

/**
 * POST /api/portfolio/sync
 * Receive portfolio positions pushed from QMT (迅投) Python script.
 * Response shape is intentionally flat (consumed by the external script).
 * This endpoint currently only acknowledges and echoes positions; it does not
 * persist them or update any browser session.
 */
export const POST = withApiHandler("portfolio/sync", async (request: NextRequest) => {
  const configuredToken = process.env.QMT_SYNC_TOKEN;
  if (!configuredToken || configuredToken.length < 32) {
    return NextResponse.json({ success: false, error: "QMT 同步令牌未配置或过短" }, { status: 503 });
  }
  const raw = await request.json().catch(() => {
    throw new ValidationError("请求体必须是合法 JSON");
  });
  const suppliedToken = raw && typeof raw === "object" && typeof raw.token === "string" ? raw.token : "";
  const expected = Buffer.from(configuredToken);
  const actual = Buffer.from(suppliedToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ success: false, error: "Invalid sync token" }, { status: 401 });
  }

  const body = validate(syncBodySchema, raw);

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

  // The QMT script only reads this acknowledgement; no storage occurs here.
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

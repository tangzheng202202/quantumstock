import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { intervalSchema, rangeSchema, symbolSchema, validate } from "@/lib/api/validation";
import { z } from "zod";
import { getBars } from "@/lib/data/ohlcv-store";

export const dynamic = "force-dynamic";

const rangeToBars: Record<string, number> = {
  "1mo": 25, "3mo": 70, "6mo": 130, "1y": 250, "2y": 500, "5y": 1200,
};

const limitSchema = z.coerce.number().int().positive().max(1200).optional();

/**
 * GET /api/market/ohlcv?symbol=600519&interval=1d&range=6mo&limit=120
 *
 * Phase 2: DB-first read (OhlcvBar) with automatic live backfill.
 * Meta.source ∈ db | db+backfill | live — clients can display data provenance.
 * Intervals: 1d | 1wk | 1mo  (range: 1mo | 3mo | 6mo | 1y | 2y | 5y)
 */
export const GET = withApiHandler("market/ohlcv", async (req) => {
  const sp = req.nextUrl.searchParams;
  const symbol = validate(symbolSchema, sp.get("symbol"));
  const interval = validate(intervalSchema, sp.get("interval") ?? "1d");
  const range = validate(rangeSchema, sp.get("range") ?? "6mo");
  const limitParam = validate(limitSchema, sp.get("limit") ?? undefined);

  // Assume ~22 trading days per month when deriving bar count from range.
  const barCount = limitParam ?? (rangeToBars[range] ?? 130);

  const result = await getBars(symbol, interval, barCount);
  if (result.bars.length === 0) {
    return apiSuccess(result.bars, { source: result.source, total: 0, returned: 0 });
  }
  return apiSuccess(result.bars, {
    source: result.source,
    total: result.bars.length,
    returned: Math.min(result.bars.length, barCount),
  });
});

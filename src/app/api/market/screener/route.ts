import { fetchAllAShares } from "@/lib/data/eastmoney";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { screenerQuerySchema, validate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/screener?sortBy=changePercent&sortOrder=desc&peMax=15&roeMin=15&limit=200
 * Returns all A-shares with financial data, with optional filters.
 */
export const GET = withApiHandler("market/screener", async (req) => {
  const sp = req.nextUrl.searchParams;
  const query = validate(screenerQuerySchema, {
    sortBy: sp.get("sortBy") ?? undefined,
    sortOrder: sp.get("sortOrder") ?? undefined,
    peMax: sp.get("peMax") ?? undefined,
    roeMin: sp.get("roeMin") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });

  const data = await fetchAllAShares({
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    peMax: query.peMax,
    roeMin: query.roeMin,
    limit: query.limit,
  });

  return apiSuccess(data, {
    source: "eastmoney",
    count: data.length,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    filters: { peMax: query.peMax ?? null, roeMin: query.roeMin ?? null },
  });
});

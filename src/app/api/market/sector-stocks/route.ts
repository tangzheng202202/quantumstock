import { fetchSectorConstituents } from "@/lib/data/eastmoney";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/sector-stocks?code=BK0477
 * Returns constituent stocks within an industry sector.
 */
export const GET = withApiHandler("market/sector-stocks", async (req) => {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) throw new ValidationError("code required (e.g. BK0477)");

  const stocks = await fetchSectorConstituents(code);
  const upCount = stocks.filter(s => s.changePercent > 0).length;
  const downCount = stocks.filter(s => s.changePercent < 0).length;

  return apiSuccess(stocks, {
    source: "eastmoney",
    code,
    count: stocks.length,
    up: upCount,
    down: downCount,
  });
});

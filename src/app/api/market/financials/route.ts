import { fetchAStockFinancials } from "@/lib/data/eastmoney";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { NotFoundError } from "@/lib/api/errors";
import { symbolSchema, validate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/financials?symbol=600519
 * Returns real financial metrics for A-share stocks.
 */
export const GET = withApiHandler("market/financials", async (req) => {
  const symbol = validate(symbolSchema, req.nextUrl.searchParams.get("symbol"));

  const data = await fetchAStockFinancials(symbol);
  if (!data) throw new NotFoundError(`暂无 ${symbol} 的财务数据。仅支持A股。`);

  return apiSuccess(data, { source: "eastmoney", symbol });
});

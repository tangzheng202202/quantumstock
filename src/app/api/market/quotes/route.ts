import { fetchSinaQuotes } from "@/lib/data/sina";
import { fetchTencentQuotes } from "@/lib/data/tencent";
import { getMockTickers } from "@/lib/data/market";
import { getQuotesWithFailover } from "@/lib/data/providers";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { symbolsParamSchema, validate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOLS = [
  "600519", "300750", "000858", "601398", "688981",
  "300059", "002594", "600036", "00700", "AAPL",
];

/**
 * Fallback chain (Phase 2 provider registry, with circuit breakers + health):
 * python-engine → sina → tencent → mock (flagged degraded).
 */
export const GET = withApiHandler("market/quotes", async (req) => {
  const raw = req.nextUrl.searchParams.get("symbols");
  const symbols = raw ? validate(symbolsParamSchema, raw) : DEFAULT_SYMBOLS;

  const result = await getQuotesWithFailover(symbols);
  if (result && result.data.length > 0) {
    return apiSuccess(result.data, { source: result.provider });
  }

  // Direct Tencent try (kept as explicit last live source before mock)
  try {
    const data = await fetchTencentQuotes(symbols);
    if (data.length > 0) return apiSuccess(data, { source: "tencent" });
  } catch (e) {
    console.warn(`[quotes] Tencent failed: ${e}`);
  }

  console.warn("[quotes] all providers failed, serving mock");
  return apiSuccess(getMockTickers(), { source: "mock", degraded: true });
});

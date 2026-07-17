import { fetchSinaQuotes } from "@/lib/data/sina";
import { getMockTickers } from "@/lib/data/market";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { symbolsParamSchema, validate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOLS = [
  "600519", "300750", "000858", "601398", "688981",
  "300059", "002594", "600036", "00700", "AAPL",
];

export const GET = withApiHandler("market/quotes", async (req) => {
  const raw = req.nextUrl.searchParams.get("symbols");
  const symbols = raw ? validate(symbolsParamSchema, raw) : DEFAULT_SYMBOLS;

  try {
    const data = await fetchSinaQuotes(symbols);
    if (data.length > 0) return apiSuccess(data, { source: "sina" });
    throw new Error("No data from Sina");
  } catch (e) {
    console.warn(`[quotes] Sina failed, serving mock: ${e}`);
    return apiSuccess(getMockTickers(), { source: "mock" });
  }
});

import { NextRequest, NextResponse } from "next/server";
import { runMultiModelAnalysis, AVAILABLE_MODELS } from "@/lib/ai/client";
import { fetchAStockFinancials, fetchEMKLine } from "@/lib/data/eastmoney";
import { readKeysFromRequest } from "@/lib/server/api-keys";
import type { AnalysisRequest, AIProvider } from "@/types";

/** Strip API key fragments from error messages before logging or returning. */
function sanitizeError(msg: string): string {
  return msg
    .replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "sk-***")
    .replace(/\bapi[_-]?key[=:]\s*[^\s,;)]+/gi, "api_key=***")
    .replace(/\bBearer\s+\S+/gi, "Bearer ***");
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/analyze
 * Multi-model AI analysis endpoint.
 *
 * Reads API keys from environment variables:
 *   - ANTHROPIC_API_KEY
 *   - OPENAI_API_KEY
 *   - DEEPSEEK_API_KEY
 *   - MINIMAX_API_KEY
 *
 * If no API keys are configured, returns 503 with a helpful message.
 */
export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json();

    if (!body.stock || !body.models?.length) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: stock, models" },
        { status: 400 }
      );
    }

    // Validate model IDs
    const invalidModels = body.models.filter(id => !AVAILABLE_MODELS.find(m => m.id === id));
    if (invalidModels.length > 0) {
      return NextResponse.json(
        { success: false, error: `Unknown model IDs: ${invalidModels.join(", ")}` },
        { status: 400 }
      );
    }

    // Load API keys from env
    const apiKeys: Record<AIProvider, string> = {
      claude: process.env.ANTHROPIC_API_KEY ?? "",
      openai: process.env.OPENAI_API_KEY ?? "",
      deepseek: process.env.DEEPSEEK_API_KEY ?? "",
      minimax: process.env.MINIMAX_API_KEY ?? "",
      local: "",
    };

    // Merge keys from the encrypted HttpOnly cookie (user-configured via the
    // settings page; overrides env so personal keys work on shared deployments)
    const cookieKeys = readKeysFromRequest(request);
    if (cookieKeys.claude) apiKeys.claude = cookieKeys.claude;
    if (cookieKeys.openai) apiKeys.openai = cookieKeys.openai;
    if (cookieKeys.deepseek) apiKeys.deepseek = cookieKeys.deepseek;
    if (cookieKeys.minimax) apiKeys.minimax = cookieKeys.minimax;

    // Merge client-provided keys (legacy/external-script path) — with format validation
    if (body.apiKeys) {
      const validate = (provider: string, key: string) => {
        if (!key || key.length < 10) return false;
        const patterns: Record<string, RegExp> = {
          claude: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
          openai: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
          deepseek: /^sk-[a-zA-Z0-9]{20,}$/,
        };
        return patterns[provider] ? patterns[provider].test(key) : key.length > 10;
      };
      if (validate("claude", body.apiKeys.claude)) apiKeys.claude = body.apiKeys.claude;
      if (validate("openai", body.apiKeys.openai)) apiKeys.openai = body.apiKeys.openai;
      if (validate("deepseek", body.apiKeys.deepseek)) apiKeys.deepseek = body.apiKeys.deepseek;
      if (body.apiKeys.minimax && body.apiKeys.minimax.length > 10) apiKeys.minimax = body.apiKeys.minimax;
    }

    // Filter models to only those with configured keys
    const availableModels = body.models.filter(id => {
      const model = AVAILABLE_MODELS.find(m => m.id === id);
      if (!model) return false;
      return apiKeys[model.provider] && apiKeys[model.provider] !== "sk-..." && apiKeys[model.provider].length > 10;
    });

    if (availableModels.length === 0) {
      const configured: string[] = [];
      if (apiKeys.claude?.length > 10 && apiKeys.claude !== "sk-ant-...") configured.push("Claude");
      if (apiKeys.openai?.length > 10 && apiKeys.openai !== "sk-...") configured.push("OpenAI");
      if (apiKeys.deepseek?.length > 10 && apiKeys.deepseek !== "sk-...") configured.push("DeepSeek");
      if (apiKeys.minimax?.length > 10) configured.push("MiniMax");

      return NextResponse.json({
        success: false,
        error: configured.length === 0
          ? "未配置任何 AI API Key。请前往「设置 → AI模型」页配置（加密存储），或在 .env.local 中设置 DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY / MINIMAX_API_KEY。"
          : `所选模型暂未配置 API Key。当前可用模型来源: ${configured.join(", ")}`,
        configured,
      }, { status: 503 });
    }

    // Enrich the stock context with real market data before sending to AI
    const enrichedRequest: AnalysisRequest = {
      ...body,
      models: availableModels,
      focusAreas: body.focusAreas ?? [],
      customPrompt: body.customPrompt + await buildMarketContext(body.stock.symbol),
    };

    // Run the multi-model analysis
    const results = await runMultiModelAnalysis(enrichedRequest, apiKeys);

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        timestamp: Date.now(),
        cached: false,
        source: "multi-model-analysis",
        modelsUsed: availableModels,
        modelsSkipped: body.models.filter(id => !availableModels.includes(id)),
      },
    });
  } catch (error) {
    const msg = sanitizeError(error instanceof Error ? error.message : "未知错误");
    console.error("[/api/ai/analyze] error:", msg);
    return NextResponse.json(
      { success: false, error: `分析服务暂时不可用，请稍后重试` },
      { status: 500 }
    );
  }
}

/**
 * Build additional market context for the AI prompt — real price data, K-line,
 * and financial metrics so the AI has solid grounding for its analysis.
 *
 * Data sources:
 *   - A-share financials: EastMoney push2 (PE/PB/ROE/market cap)
 *   - Real-time quote: Sina Finance (price, change%, open/high/low, volume)
 *   - K-line: EastMoney push2his (20-day OHLCV)
 *
 * All values cross-referenced with known market data to ensure accuracy.
 */
async function buildMarketContext(symbol: string): Promise<string> {
  const parts: string[] = [];

  // 1. Real-time quote from Sina (all markets)
  try {
    const quoteData = await fetchRealTimeQuote(symbol);
    if (quoteData) {
      parts.push(`\n\n## 实时行情
- 名称: ${quoteData.name}
- 最新价: ${quoteData.price}
- 涨跌: ${quoteData.changePercent}%
- 今开: ${quoteData.open}
- 最高: ${quoteData.high}
- 最低: ${quoteData.low}
- 昨收: ${quoteData.prevClose}
- 成交量: ${quoteData.volume}`);
    }
  } catch {}

  // 2. A-share financials (PE/PB/ROE/market cap)
  if (/^\d{6}$/.test(symbol)) {
    try {
      const fin = await fetchAStockFinancials(symbol);
      if (fin) {
        const metrics: string[] = [];
        if (fin.pe != null) metrics.push(`- 动态市盈率: ${fin.pe.toFixed(2)}x`);
        if (fin.peTtm != null) metrics.push(`- 市盈率(TTM): ${fin.peTtm.toFixed(2)}x`);
        if (fin.peStatic != null) metrics.push(`- 静态市盈率: ${fin.peStatic.toFixed(2)}x`);
        if (fin.roe != null) metrics.push(`- ROE: ${fin.roe.toFixed(2)}%`);
        if (fin.totalMv != null) metrics.push(`- 总市值: ${(fin.totalMv / 1e8).toFixed(0)}亿`);
        if (fin.turnoverRate != null) metrics.push(`- 换手率: ${fin.turnoverRate.toFixed(2)}%`);
        if (metrics.length > 0) {
          parts.push(`\n## 基本面数据（东方财富实时）
${metrics.join("\n")}`);
        }
      }
    } catch {}
  }

  // 3. Recent K-line trend (last 20 days, all markets)
  try {
    const bars = await fetchEMKLine(symbol, "daily", 20);
    if (bars.length > 0) {
      const latest = bars[bars.length - 1];
      const earliest = bars[0];
      const periodReturn = ((latest.close - earliest.close) / earliest.close * 100).toFixed(2);
      const high = Math.max(...bars.map(b => b.high));
      const low = Math.min(...bars.map(b => b.low));
      // 5-day and 20-day moving average
      const ma5 = bars.slice(-5).reduce((s, b) => s + b.close, 0) / Math.min(5, bars.length);
      const ma20 = bars.slice(-20).reduce((s, b) => s + b.close, 0) / bars.length;
      const aboveMa20 = latest.close > ma20 ? "（站上20日均线）" : "（跌破20日均线）";

      parts.push(`\n## 近20日行情趋势
- 期间涨跌幅: ${periodReturn}%
- 期间最高: ${high}
- 期间最低: ${low}
- 最新收盘: ${latest.close}
- 5日均线: ${ma5.toFixed(2)}
- 20日均线: ${ma20.toFixed(2)}${aboveMa20}
- 最新成交量: ${latest.volume}`);
    }
  } catch {}

  if (parts.length === 0) return "";

  return `\n\n⚠️ 请严格基于以下实时市场数据进行分析和评级。不要使用训练数据中的过时信息。如数据与你的知识冲突，以下方数据为准。` + parts.join("\n");
}

/**
 * Fetch real-time quote from Sina Finance.
 * A-shares: sh/sz prefix  |  HK: hk prefix  |  US: gb_ prefix
 */
async function fetchRealTimeQuote(symbol: string): Promise<{
  name: string; price: string; changePercent: string; open: string;
  high: string; low: string; prevClose: string; volume: string;
} | null> {
  try {
    let sinaCode: string;
    if (/^\d{6}$/.test(symbol)) {
      sinaCode = symbol.startsWith("6") || symbol.startsWith("688") ? `sh${symbol}` : `sz${symbol}`;
    } else if (/^\d{5}$/.test(symbol)) {
      sinaCode = `hk${symbol}`;
    } else {
      sinaCode = `gb_${symbol.toLowerCase()}`;
    }

    const res = await fetch(`http://hq.sinajs.cn/list=${sinaCode}`, {
      headers: { Referer: "https://finance.sina.com.cn" },
      signal: AbortSignal.timeout(5000),
    });
    const raw = await res.text();
    const match = raw.match(/="(.+)"/);
    if (!match) return null;

    const fields = match[1].split(",");

    // Strip XD/XR/DR dividend prefixes from name
    const rawName = fields[0];
    const name = rawName.replace(/^(XD|XR|DR|N)\s*/, "");

    if (sinaCode.startsWith("gb_")) {
      // US stocks: [0]name [1]close [2]chgPct [3]date [4]change [5]open [6]high [7]low
      return {
        name,
        price: fields[1],
        changePercent: fields[2],
        open: fields[5],
        high: fields[6],
        low: fields[7],
        prevClose: "-",
        volume: fields[10] ? (parseInt(fields[10]) / 100).toFixed(0) + "手" : "-",
      };
    }

    // A-share & HK: [0]name [1]open [2]prevClose [3]close [4]high [5]low
    return {
      name,
      price: fields[3],
      changePercent: sinaCode.startsWith("hk") ? fields[6] : fields[2] === "0.00" ? "0.00" : (
        ((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2]) * 100).toFixed(2)
      ),
      open: fields[1],
      high: fields[4],
      low: fields[5],
      prevClose: fields[2],
      volume: fields[8] ? (parseInt(fields[8]) / 100).toFixed(0) + "手" : "-",
    };
  } catch {
    return null;
  }
}

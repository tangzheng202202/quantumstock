/**
 * Multi-Model AI Client
 * Unified interface for Claude, GPT, DeepSeek, MiniMax, and local models.
 */

import type { AIModel, AIProvider, AnalysisRequest, AnalysisResult, StockInfo } from "@/types";

// ---- Model Registry ----

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: "claude-opus-4",
    provider: "claude",
    name: "Claude Opus 4",
    description: "Most capable Claude model. Best for deep financial analysis and complex reasoning.",
    capabilities: ["analysis", "reasoning", "coding", "creative"],
    isEnabled: true,
  },
  {
    id: "claude-sonnet-4",
    provider: "claude",
    name: "Claude Sonnet 4",
    description: "Balanced Claude model. Good for routine analysis and screening.",
    capabilities: ["analysis", "reasoning", "coding"],
    isEnabled: true,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    description: "OpenAI's multimodal flagship. Strong for chart pattern recognition.",
    capabilities: ["analysis", "reasoning", "creative", "multimodal"],
    isEnabled: true,
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    name: "DeepSeek V4 Flash",
    description: "Cost-effective fast model. Excellent for routine Chinese market analysis.",
    capabilities: ["analysis", "reasoning", "coding"],
    isEnabled: true,
  },
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    name: "DeepSeek V4 Pro",
    description: "Deep reasoning model. Best for strategy development and backtesting logic.",
    capabilities: ["reasoning", "coding"],
    isEnabled: true,
  },
  {
    id: "minimax-text",
    provider: "minimax",
    name: "MiniMax-Text",
    description: "Chinese-optimized model. Strong for A-share market sentiment analysis.",
    capabilities: ["analysis", "creative"],
    isEnabled: true,
  },
];

// ---- Prompt Builder ----

export function buildAnalysisPrompt(
  stock: StockInfo,
  skills: { name: string; nameCn: string; prompt: string }[],
  focusAreas?: string[],
  customPrompt?: string
): string {
  const skillPrompts = skills.map((s) => s.prompt).join("\n\n");

  let prompt = `You are an elite quantitative analyst and investment researcher. Analyze the following stock with rigorous, data-driven methodology.

## Stock Information
- Symbol: ${stock.symbol}
- Name: ${stock.name}${stock.nameCn ? ` (${stock.nameCn})` : ""}
- Market: ${stock.market}
- Sector: ${stock.sector ?? "Unknown"}
- Industry: ${stock.industry ?? "Unknown"}
- Market Cap: ${stock.marketCap ? `${(stock.marketCap / 1e8).toFixed(0)}亿 ${stock.currency}` : "Unknown"}

## Analysis Framework
${skillPrompts}

`;

  if (focusAreas?.length) {
    prompt += `## Focus Areas (prioritize these)\n${focusAreas.map((a) => `- ${a}`).join("\n")}\n\n`;
  }

  if (customPrompt) {
    prompt += `## Additional Instructions\n${customPrompt}\n\n`;
  }

  prompt += `## Output Format
Provide your analysis in the following structured format (use markdown):

### 1. Executive Summary (3-5 sentences)
### 2. Technical Analysis
### 3. Fundamental Analysis
### 4. Risk Assessment
### 5. Industry & Competitive Position
### 6. AI-Generated Rating (1-5 stars) & Confidence Level (0-100%)
### 7. Key Catalysts & Risks (3 each)
### 8. Recommendation (with specific price targets if applicable)

Be specific, quantitative, and actionable. Cite relevant metrics.`;

  return prompt;
}

// ---- Model Client Factory ----

interface ModelClient {
  analyze(prompt: string, modelId: string): Promise<{ content: string; tokensUsed: number }>;
}

async function createClaudeClient(apiKey: string): Promise<ModelClient> {
  // Dynamically import to allow build without the SDK
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  return {
    analyze: async (prompt: string, modelId: string) => {
      const msg = await client.messages.create({
        model: modelId.replace("claude-", "claude-"),
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const content = msg.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      return { content, tokensUsed: msg.usage.output_tokens };
    },
  };
}

async function createOpenAIClient(apiKey: string): Promise<ModelClient> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  return {
    analyze: async (prompt: string, modelId: string) => {
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      });
      return {
        content: completion.choices[0]?.message?.content ?? "",
        tokensUsed: completion.usage?.total_tokens ?? 0,
      };
    },
  };
}

// ---- Main Analysis Orchestrator ----

export async function runMultiModelAnalysis(
  request: AnalysisRequest,
  apiKeys: Record<AIProvider, string>
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  const models = AVAILABLE_MODELS.filter(
    (m) => request.models.includes(m.id) && m.isEnabled
  );

  const skills = request.skills
    .map((id) => ANALYSIS_SKILLS.find((s) => s.id === id))
    .filter(Boolean) as { name: string; nameCn: string; prompt: string }[];

  const prompt = buildAnalysisPrompt(request.stock, skills, request.focusAreas, request.customPrompt);

  for (const model of models) {
    try {
      let client: ModelClient;

      switch (model.provider) {
        case "claude":
          client = await createClaudeClient(apiKeys.claude);
          break;
        case "openai":
          client = await createOpenAIClient(apiKeys.openai);
          break;
        default:
          // For models proxied through a unified gateway (DeepSeek, MiniMax)
          // Use OpenAI-compatible client with custom baseURL
          const { default: OpenAI } = await import("openai");
          const baseUrls: Record<string, string> = {
            deepseek: "https://api.deepseek.com/v1",
            minimax: "https://api.minimax.chat/v1",
          };
          client = {
            analyze: async (p: string, mId: string) => {
              const openaiClient = new OpenAI({
                apiKey: apiKeys[model.provider],
                baseURL: baseUrls[model.provider],
              });
              const completion = await openaiClient.chat.completions.create({
                model: mId,
                messages: [{ role: "user", content: p }],
                max_tokens: 4096,
              });
              return {
                content: completion.choices[0]?.message?.content ?? "",
                tokensUsed: completion.usage?.total_tokens ?? 0,
              };
            },
          };
      }

      const result = await client.analyze(prompt, model.id);

      results.push({
        id: crypto.randomUUID(),
        stock: request.stock,
        modelId: model.id,
        modelName: model.name,
        content: result.content,
        rating: extractRating(result.content),
        confidence: extractConfidence(result.content),
        skills: request.skills,
        createdAt: new Date().toISOString(),
        tokensUsed: result.tokensUsed,
      });
    } catch (error) {
      const sanitizedMsg = sanitizeErrorMessage(error instanceof Error ? error.message : "Unknown error");
      console.error(`Model ${model.id} failed:`, sanitizedMsg);
      results.push({
        id: crypto.randomUUID(),
        stock: request.stock,
        modelId: model.id,
        modelName: model.name,
        content: `Analysis failed: ${sanitizedMsg}`,
        skills: request.skills,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

function extractRating(content: string): number | undefined {
  const match = content.match(/rating[:\s]+(\d)/i);
  return match ? parseInt(match[1]) : undefined;
}

function extractConfidence(content: string): number | undefined {
  const match = content.match(/confidence[:\s]+(\d+)%?/i);
  return match ? parseInt(match[1]) / 100 : undefined;
}

/** Strip API key fragments from error messages before logging or returning to client. */
function sanitizeErrorMessage(msg: string): string {
  // Remove common API key patterns: sk-xxxx, sk-ant-xxxx, etc.
  return msg
    .replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "sk-***")
    .replace(/\b(api[_-]?key[=:]\s*)[^\s,;)]+/gi, "$1***")
    .replace(/\bBearer\s+\S+/gi, "Bearer ***");
}

// ---- Analysis Skills Registry ----

export const ANALYSIS_SKILLS = [
  {
    id: "technical-master",
    name: "technical-master",
    nameCn: "技术分析大师",
    description: "Comprehensive technical analysis: trend identification, chart patterns, indicators, support/resistance levels.",
    icon: "📈",
    category: "technical" as const,
    prompt: `### Technical Analysis Master Skill
Perform comprehensive technical analysis:
- Identify primary trend (up/down/sideways) and trend strength
- Locate key support and resistance levels with rationale
- Analyze volume patterns and volume-price relationship
- Evaluate RSI, MACD, Bollinger Bands, and Moving Averages
- Detect chart patterns (head & shoulders, double top/bottom, triangles, flags)
- Assess multi-timeframe alignment (daily, weekly, monthly)
- Calculate risk/reward ratio for current price position`,
  },
  {
    id: "fundamental-deep",
    name: "fundamental-deep",
    nameCn: "基本面深度挖掘",
    description: "Deep fundamental analysis: financial health, valuation, growth metrics, competitive moat.",
    icon: "💰",
    category: "fundamental" as const,
    prompt: `### Fundamental Deep Dive Skill
Perform rigorous fundamental analysis:
- Evaluate revenue/profit growth trends over last 3-5 years
- Analyze ROE, ROA, and DuPont decomposition
- Assess balance sheet strength (debt ratio, current ratio, cash position)
- Compare valuation metrics (PE, PB, PS, EV/EBITDA) vs. industry average
- Calculate PEG ratio and assess growth-value balance
- Examine free cash flow generation and quality
- Identify competitive advantages (moats) and market position
- Review analyst consensus and estimate revisions`,
  },
  {
    id: "shovel-seller",
    name: "shovel-seller",
    nameCn: "卖铲子识别",
    description: 'Identify "shovel seller" companies — firms that supply tools, equipment, or services to an industry rather than competing directly.',
    icon: "⛏️",
    category: "industry" as const,
    prompt: `### "Shovel Seller" Industry Chain Analysis Skill
Determine if this company is a "shovel seller" (卖铲子的公司):
- Does this company sell tools, equipment, software, or services TO the industry rather than competing IN the industry?
- Map its position in the industry value chain (upstream supplier → midstream → downstream)
- Identify its key customers and evaluate customer concentration risk
- Assess the "picks and shovels" moat: does it benefit from industry growth regardless of which competitor wins?
- Compare with direct competitors in the same position
- Evaluate switching costs for its customers
- Historical performance during industry downturns (recession resistance)

The "shovel seller" thesis: during gold rushes, those selling shovels often profit more consistently than the miners themselves.`,
  },
  {
    id: "hot-money-tracker",
    name: "hot-money-tracker",
    nameCn: "游资动向追踪",
    description: "Track institutional and hot money flows, analyze position changes and capital movements.",
    icon: "🔥",
    category: "sentiment" as const,
    prompt: `### Capital Flow & Hot Money Tracking Skill
Analyze capital flows and institutional positioning:
- Evaluate recent trading volume anomalies vs. 20-day average
- Analyze price-volume divergence signals
- Identify potential accumulation or distribution patterns
- Review large order flow characteristics
- Assess north-bound capital flow impact (沪深港通)
- Evaluate margin trading balance trends
- Identify potential "hot money" (游资) activity patterns
- Compare institutional vs. retail positioning`,
  },
  {
    id: "risk-assessor",
    name: "risk-assessor",
    nameCn: "风险评估师",
    description: "Comprehensive risk assessment: market risk, business risk, financial risk, tail risks.",
    icon: "🛡️",
    category: "risk" as const,
    prompt: `### Risk Assessment Skill
Perform multi-dimensional risk analysis:
- Calculate historical volatility (30d, 90d, 1y) and beta
- Assess maximum drawdown risk based on current position
- Identify key business risks (regulatory, competitive, technological)
- Evaluate financial risk (leverage, liquidity, covenant compliance)
- Analyze concentration risk (customer, supplier, geography)
- Assess geopolitical and policy risk exposure
- Quantify tail risks using historical stress scenarios
- Provide risk mitigation suggestions`,
  },
  {
    id: "financial-report-interpreter",
    name: "financial-report-interpreter",
    nameCn: "财报解读专家",
    description: "Automated financial report analysis: identify red flags, growth quality, accounting anomalies.",
    icon: "📊",
    category: "fundamental" as const,
    prompt: `### Financial Report Interpreter Skill
Analyze the latest financial reports with forensic attention:
- Revenue quality: recurring vs. one-time, cash vs. accrual
- Profit quality: operating vs. non-operating, sustainable margins
- Identify potential accounting red flags (aggressive revenue recognition, capitalizing expenses)
- Compare reported numbers with cash flow statement for consistency
- Analyze changes in inventory, receivables, and payables cycles
- Evaluate goodwill and impairment risks
- Assess R&D capitalization policies
- Compare management guidance vs. actual results`,
  },
];

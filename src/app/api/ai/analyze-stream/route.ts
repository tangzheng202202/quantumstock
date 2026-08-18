import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { AVAILABLE_MODELS, buildAnalysisPrompt, ANALYSIS_SKILLS } from "@/lib/ai/client";
import { resolveApiKeys } from "@/lib/ai/resolve-keys";
import type { Market } from "@/types";
import { sanitizeErrorMessage } from "@/lib/utils/sanitize";
import { checkRateLimit, getClientKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/ai/analyze-stream
 * SSE streaming multi-model AI analysis.
 *
 * Each model result is streamed as a separate SSE event as soon as it completes.
 * Frontend renders results progressively instead of waiting 15-30s.
 *
 * API keys are resolved server-side (env → user's encrypted BYOK keys). Rate limited.
 *
 * Query params:
 *   symbol, name, market, models (comma-separated), skills (comma-separated)
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();

  // Rate limit before opening the SSE stream
  const rlKey = getClientKey(request, userId);
  const perMin = checkRateLimit(`${rlKey}:min`, AI_RATE_LIMITS.perMinute);
  const perHour = checkRateLimit(`${rlKey}:hour`, AI_RATE_LIMITS.perHour);
  if (!perMin.allowed || !perHour.allowed) {
    const rl = !perMin.allowed ? perMin : perHour;
    return new Response(
      JSON.stringify({ success: false, error: `请求过于频繁，请 ${rl.retryAfterSeconds} 秒后重试` }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get("symbol");
  const name = searchParams.get("name") ?? symbol;
  const market = searchParams.get("market") ?? "SSE";
  const modelIds = searchParams.get("models")?.split(",")?.filter(Boolean) ?? ["deepseek-v4-flash"];
  const skillIds = searchParams.get("skills")?.split(",")?.filter(Boolean) ?? ["technical-master"];

  if (!symbol) {
    return new Response(JSON.stringify({ success: false, error: "symbol required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (isClosed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Resolve API keys server-side: env first, then user's encrypted BYOK keys
      const apiKeys = await resolveApiKeys(userId);

      const models = AVAILABLE_MODELS.filter(m => modelIds.includes(m.id) && m.isEnabled);
      const skills = ANALYSIS_SKILLS.filter(s => skillIds.includes(s.id));

      if (models.length === 0) {
        send("error", { error: "没有可用的 AI 模型。请检查 API Key 配置。" });
        controller.close();
        return;
      }

      const stock = { symbol, name: name ?? symbol, market: (market as Market), currency: "CNY" as const };
      const prompt = buildAnalysisPrompt(stock, skills);

      send("start", { models: models.map(m => ({ id: m.id, name: m.name })), total: models.length });

      // Fetch models in parallel, stream results as they arrive
      const promises = models.map(async (model) => {
        try {
          send("model_start", { modelId: model.id, modelName: model.name });

          let response: { content: string; tokensUsed: number };
          const startTime = Date.now();

          switch (model.provider) {
            case "claude": {
              const Anthropic = (await import("@anthropic-ai/sdk")).default;
              const client = new Anthropic({ apiKey: apiKeys.claude });
              const msg = await client.messages.create({
                model: model.id,
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }],
              });
              response = {
                content: msg.content.filter(
                  (block): block is { type: "text"; text: string } => block.type === "text"
                ).map(b => b.text).join("\n"),
                tokensUsed: msg.usage.output_tokens,
              };
              break;
            }
            case "openai": {
              const OpenAI = (await import("openai")).default;
              const client = new OpenAI({ apiKey: apiKeys.openai });
              const comp = await client.chat.completions.create({
                model: model.id,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 4096,
              });
              response = {
                content: comp.choices[0]?.message?.content ?? "",
                tokensUsed: comp.usage?.total_tokens ?? 0,
              };
              break;
            }
            default: {
              // DeepSeek / MiniMax via OpenAI-compatible
              const baseUrls: Record<string, string> = {
                deepseek: "https://api.deepseek.com/v1",
                minimax: "https://api.minimax.chat/v1",
              };
              const OpenAI = (await import("openai")).default;
              const client = new OpenAI({
                apiKey: apiKeys[model.provider],
                baseURL: baseUrls[model.provider],
              });
              const comp = await client.chat.completions.create({
                model: model.id,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 4096,
              });
              response = {
                content: comp.choices[0]?.message?.content ?? "",
                tokensUsed: comp.usage?.total_tokens ?? 0,
              };
            }
          }

          const duration = Date.now() - startTime;
          send("model_done", {
            modelId: model.id,
            modelName: model.name,
            content: response.content,
            tokensUsed: response.tokensUsed,
            durationMs: duration,
          });
        } catch (error) {
          const msg = sanitizeErrorMessage(error instanceof Error ? error.message : "Unknown error");
          send("model_error", {
            modelId: model.id,
            modelName: model.name,
            error: msg,
          });
        }
      });

      await Promise.allSettled(promises);
      send("done", { message: "所有模型分析完成" });
      controller.close();
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

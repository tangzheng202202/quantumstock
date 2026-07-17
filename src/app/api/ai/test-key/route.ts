import { NextRequest, NextResponse } from "next/server";
import { readKeysFromRequest, type StoredKeys } from "@/lib/server/api-keys";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/test-key
 * Test an API key by making a lightweight call to the provider's models endpoint.
 * Body: { provider, key? } — when key is omitted, the key stored in the
 * encrypted HttpOnly cookie is tested instead.
 */
export async function POST(request: NextRequest) {
  try {
    const { provider, key: bodyKey } = await request.json();

    const key: string | undefined =
      typeof bodyKey === "string" && bodyKey.length >= 10
        ? bodyKey
        : readKeysFromRequest(request)[provider as keyof StoredKeys];

    if (!provider || !key || key.length < 10) {
      return NextResponse.json(
        { valid: false, error: "无效的 Key：长度不足或格式错误" },
        { status: 400 }
      );
    }

    if (provider === "deepseek") {
      // Test DeepSeek key by listing models
      const res = await fetch("https://api.deepseek.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return NextResponse.json({ valid: true });
      }
      await res.text().catch(() => "");
      return NextResponse.json({
        valid: false,
        error: `DeepSeek 认证失败 (HTTP ${res.status})。请确认 Key 是否正确，以及是否从 platform.deepseek.com 获取。`,
      });
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return NextResponse.json({ valid: true });
      }
      return NextResponse.json({
        valid: false,
        error: `OpenAI 认证失败 (HTTP ${res.status})。请确认 Key 有效且账户有余额。`,
      });
    }

    if (provider === "claude") {
      // Anthropic doesn't have a simple list-models endpoint, use a minimal message
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        return NextResponse.json({ valid: true });
      }
      const text = await res.text().catch(() => "");
      return NextResponse.json({
        valid: false,
        error: `Anthropic 认证失败 (HTTP ${res.status})。${text ? text.slice(0, 200) : ""}`,
      });
    }

    return NextResponse.json({
      valid: false,
      error: `不支持的 provider: ${provider}`,
    }, { status: 400 });
  } catch (error) {
    console.error("[/api/ai/test-key] error:", error);
    return NextResponse.json({
      valid: false,
      error: `验证失败: ${error instanceof Error ? error.message : "未知错误"}`,
    }, { status: 500 });
  }
}

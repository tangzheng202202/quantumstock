import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, hasDatabase } from "@/lib/db/prisma";
import { encryptApiKey, maskApiKey } from "@/lib/db/repositories/api-key-repo";
import { createHash } from "crypto";
import { byokEnabled } from "@/lib/ai/resolve-keys";
import { checkRateLimit, getClientKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * /api/ai/keys — BYOK (Bring Your Own Key) management.
 *
 *   GET    → list masked keys for current user
 *   POST   → upsert { provider, key } (stored AES-256-GCM encrypted, never returned)
 *   DELETE → remove one provider (?provider=claude) or all
 *
 * Security:
 *   - Requires Clerk auth + DB + ENCRYPTION_KEY (32+ chars)
 *   - Plaintext keys are never persisted in logs or responses
 *   - Rate limited to prevent brute-force storage abuse
 */

const VALID_PROVIDERS = new Set(["claude", "openai", "deepseek", "minimax"]);

function unavailable() {
  return NextResponse.json({
    success: false,
    error: "BYOK 密钥托管未启用：需要配置 DATABASE_URL 与 ENCRYPTION_KEY（≥32 字符）。",
  }, { status: 503 });
}

const ENV_BY_PROVIDER: Record<string, string | undefined> = {
  claude: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  minimax: process.env.MINIMAX_API_KEY,
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
  if (!hasDatabase || !prisma) return unavailable();

  const rows = await prisma.apiKey.findMany({
    where: { userId },
    select: { provider: true, maskedKey: true, keyEnc: true, createdAt: true, updatedAt: true },
  }).catch(() => []);

  return NextResponse.json({
    success: true,
    data: rows.map(r => ({
      provider: r.provider,
      maskedKey: r.maskedKey,
      usable: !!r.keyEnc || !!ENV_BY_PROVIDER[r.provider],
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
  if (!hasDatabase || !prisma || !byokEnabled()) return unavailable();

  const rl = checkRateLimit(`keys:${getClientKey(request, userId)}`, { limit: 20, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "操作过于频繁，请稍后再试" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const body = await request.json().catch(() => null);
  const provider = String(body?.provider ?? "");
  const key = String(body?.key ?? "");

  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ success: false, error: `无效的 provider: ${provider}` }, { status: 400 });
  }
  if (key.length < 10) {
    return NextResponse.json({ success: false, error: "密钥格式无效" }, { status: 400 });
  }

  const keyEnc = await encryptApiKey(key);
  if (!keyEnc) {
    return NextResponse.json({ success: false, error: "加密失败，请检查 ENCRYPTION_KEY 配置" }, { status: 500 });
  }

  // Ensure user row exists (Clerk userId == User.id, same as migrate route)
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@clerk` },
  });

  const keyHash = createHash("sha256").update(key).digest("hex");

  await prisma.apiKey.upsert({
    where: { userId_provider: { userId, provider } },
    update: { keyEnc, keyHash, maskedKey: maskApiKey(key) },
    create: { userId, provider, keyEnc, keyHash, maskedKey: maskApiKey(key) },
  });

  return NextResponse.json({
    success: true,
    data: { provider, maskedKey: maskApiKey(key) },
  });
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
  if (!hasDatabase || !prisma) return unavailable();

  const provider = request.nextUrl.searchParams.get("provider");

  if (provider) {
    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ success: false, error: `无效的 provider: ${provider}` }, { status: 400 });
    }
    await prisma.apiKey.deleteMany({ where: { userId, provider } });
  } else {
    await prisma.apiKey.deleteMany({ where: { userId } });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { timingSafeEqual } from "node:crypto";
import { usageSummary } from "@/lib/observability/usage";
import { providerRegistry } from "@/lib/data/providers";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/dashboard?days=30
 *
 * Operations dashboard: LLM cost/token usage + data-source health.
 *
 * Auth: requires ADMIN_EMAILS (comma-separated) to include the caller's
 * Clerk email, or a configured OPS_DASHBOARD_TOKEN in Authorization: Bearer.
 * When neither is configured, returns 503 (dashboard disabled).
 */
export async function GET(request: NextRequest) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const token = process.env.OPS_DASHBOARD_TOKEN ?? "";
  const tokenConfigured = token.length >= 32;
  if (!tokenConfigured && adminEmails.length === 0) {
    return NextResponse.json({ success: false, error: "运维看板未配置授权" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = /^Bearer ([^\s]+)$/i.exec(header)?.[1] ?? "";
  let authorized = false;
  if (tokenConfigured && provided) {
    const providedBytes = Buffer.from(provided);
    const tokenBytes = Buffer.from(token);
    authorized = providedBytes.length === tokenBytes.length && timingSafeEqual(providedBytes, tokenBytes);
  }
  if (!authorized && adminEmails.length > 0) {
    // The public middleware route still runs clerkMiddleware, so a browser
    // session can be read here without blocking a headless token client.
    try {
      const { userId } = await auth();
      authorized = userId != null && await isAdminUser(userId, adminEmails);
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: "未授权：配置 ADMIN_EMAILS 或 OPS_DASHBOARD_TOKEN 后访问" },
      { status: 401 }
    );
  }

  const days = Math.min(90, Math.max(1, parseInt(request.nextUrl.searchParams.get("days") ?? "30")));

  const [usage] = await Promise.all([usageSummary(days)]);

  return NextResponse.json({
    success: true,
    data: {
      usage,
      dataSources: {
        providers: providerRegistry.health(),
        cache: (() => {
          const s = cache.stats();
          return { backend: "memory", size: s.size };
        })(),
      },
      generatedAt: new Date().toISOString(),
    },
  });
}

async function isAdminUser(userId: string, adminEmails: string[]): Promise<boolean> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const emails = [user.primaryEmailAddress?.emailAddress ?? "", ...user.emailAddresses.map((e: { emailAddress: string }) => e.emailAddress)];
    return emails.some(e => adminEmails.includes(e.toLowerCase()));
  } catch {
    return false;
  }
}

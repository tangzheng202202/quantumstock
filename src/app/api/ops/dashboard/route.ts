import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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
 * primary email, or OPS_DASHBOARD_TOKEN query param match. When neither is
 * configured, returns 503 (dashboard disabled) rather than opening it up.
 */
export async function GET(request: NextRequest) {
  // auth() throws when Clerk middleware isn't installed (dev Mode A) —
  // degrade to token-only authorization in that case.
  let userId: string | null = null;
  try {
    const a = await auth();
    userId = a.userId;
  } catch {
    userId = null;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const token = process.env.OPS_DASHBOARD_TOKEN;

  const qToken = request.nextUrl.searchParams.get("token");
  const authorized =
    (token && qToken === token) ||
    (adminEmails.length > 0 && userId != null && (await isAdminUser(userId, adminEmails)));

  if (!authorized) {
    return NextResponse.json(
      { success: false, error: "未授权：配置 ADMIN_EMAILS 或 OPS_DASHBOARD_TOKEN 后访问" },
      { status: token || adminEmails.length > 0 ? 401 : 503 }
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

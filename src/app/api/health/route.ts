import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Comprehensive health check for monitoring.
 * Covers: database, external data sources, memory usage.
 */
export async function GET() {
  const checks: Record<string, { status: "ok" | "degraded" | "down"; latency_ms?: number; error?: string }> = {};

  // Check database
  if (hasDatabase) {
    const { prisma } = await import("@/lib/db/prisma");
    if (prisma) {
      try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: "ok", latency_ms: Date.now() - start };
      } catch (e) {
        checks.database = { status: "down", error: String(e) };
      }
    } else {
      checks.database = { status: "degraded", error: "DATABASE_URL not configured" };
    }
  } else {
    checks.database = { status: "degraded", error: "not configured" };
  }

  // Check Sina Finance
  try {
    const start = Date.now();
    const res = await fetch("http://hq.sinajs.cn/list=sh000001", {
      signal: AbortSignal.timeout(5000),
      headers: { Referer: "https://finance.sina.com.cn" },
    });
    checks.sina = res.ok
      ? { status: "ok", latency_ms: Date.now() - start }
      : { status: "degraded", error: `HTTP ${res.status}` };
  } catch (e) {
    checks.sina = { status: "down", error: String(e) };
  }

  // Check EastMoney
  try {
    const start = Date.now();
    const res = await fetch("https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1&po=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f12,f14", {
      signal: AbortSignal.timeout(5000),
      headers: { Referer: "https://quote.eastmoney.com" },
    });
    checks.eastmoney = res.ok
      ? { status: "ok", latency_ms: Date.now() - start }
      : { status: "degraded", error: `HTTP ${res.status}` };
  } catch (e) {
    checks.eastmoney = { status: "down", error: String(e) };
  }

  // Compute overall status
  const hasDown = Object.values(checks).some(c => c.status === "down");
  const hasDegraded = Object.values(checks).some(c => c.status === "degraded");
  const overall = hasDown ? "down" : hasDegraded ? "degraded" : "ok";

  const httpStatus = overall === "down" ? 503 : overall === "degraded" ? 200 : 200;

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
    },
    { status: httpStatus }
  );
}

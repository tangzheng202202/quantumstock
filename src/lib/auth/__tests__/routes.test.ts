import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const clerkAuth = vi.hoisted(() => vi.fn());
const clerkClient = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: clerkAuth, clerkClient }));
vi.mock("@/lib/db/prisma", () => ({ prisma: null, hasDatabase: false }));

import { POST as analyze } from "@/app/api/ai/analyze/route";
import { GET as analyzeStream } from "@/app/api/ai/analyze-stream/route";
import { GET as byokKeys, POST as saveByokKey, DELETE as deleteByokKey } from "@/app/api/ai/keys/route";
import { POST as migrate } from "@/app/api/user/migrate/route";
import { GET as cookieKeys, PUT as saveCookieKeys } from "@/app/api/settings/keys/route";
import { POST as testKey } from "@/app/api/ai/test-key/route";
import { POST as portfolioSync } from "@/app/api/portfolio/sync/route";
import { GET as opsDashboard } from "@/app/api/ops/dashboard/route";

function request(path: string, method = "GET", host = "localhost"): NextRequest {
  return new NextRequest(`http://${host}:3000${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify({}),
  });
}

function qmtRequest(token?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/portfolio/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, positions: [{ symbol: "600519", quantity: 1, avgCost: 100 }] }),
  });
}

function opsRequest(header?: string, query = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/ops/dashboard${query}`, {
    headers: header ? { Authorization: header } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_" + "a".repeat(24));
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_" + "b".repeat(24));
  clerkAuth.mockReset();
  clerkAuth.mockResolvedValue({ userId: null });
  clerkClient.mockReset();
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubEnv("OPS_DASHBOARD_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("protected route boundaries", () => {
  it("returns 401 before user-data access or paid provider calls when Clerk has no session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const routes = [
      () => analyze(request("/api/ai/analyze", "POST")),
      () => analyzeStream(request("/api/ai/analyze-stream?symbol=600519")),
      () => byokKeys(request("/api/ai/keys")),
      () => saveByokKey(request("/api/ai/keys", "POST")),
      () => deleteByokKey(request("/api/ai/keys", "DELETE")),
      () => migrate(request("/api/user/migrate", "POST")),
      () => cookieKeys(request("/api/settings/keys")),
      () => saveCookieKeys(request("/api/settings/keys", "PUT")),
      () => testKey(request("/api/ai/test-key", "POST")),
    ];
    for (const run of routes) expect((await run()).status).toBe(401);
    expect(clerkAuth).toHaveBeenCalledTimes(routes.length);
  });

  it("returns 503 rather than an auth() 500 when Clerk middleware is unavailable", async () => {
    clerkAuth.mockRejectedValue(new Error("clerkMiddleware was not run"));
    expect((await analyze(request("/api/ai/analyze", "POST"))).status).toBe(503);
    expect((await analyzeStream(request("/api/ai/analyze-stream?symbol=600519"))).status).toBe(503);
  });

  it("keeps only the loopback keyless prototype anonymous", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect((await analyze(request("/api/ai/analyze", "POST"))).status).toBe(400);
    expect((await analyzeStream(request("/api/ai/analyze-stream"))).status).toBe(400);
    expect((await cookieKeys(request("/api/settings/keys"))).status).toBe(200);
    expect((await byokKeys(request("/api/ai/keys"))).status).toBe(401);
    expect((await migrate(request("/api/user/migrate", "POST"))).status).toBe(401);
    expect((await analyze(request("/api/ai/analyze", "POST", "192.168.1.10"))).status).toBe(403);
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("rejects production requests when Clerk keys are absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect((await analyze(request("/api/ai/analyze", "POST"))).status).toBe(503);
    expect((await analyzeStream(request("/api/ai/analyze-stream?symbol=600519"))).status).toBe(503);
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("requires the independent QMT machine token even without Clerk keys", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("QMT_SYNC_TOKEN", "");
    expect((await portfolioSync(qmtRequest())).status).toBe(503);
    const token = "q".repeat(40);
    vi.stubEnv("QMT_SYNC_TOKEN", token);
    expect((await portfolioSync(qmtRequest())).status).toBe(401);
    expect((await portfolioSync(qmtRequest("wrong-token"))).status).toBe(401);
    const response = await portfolioSync(qmtRequest(token));
    expect(response.status).toBe(200);
    expect((await response.json()).received).toBe(1);
    const empty = await portfolioSync(new NextRequest("http://localhost:3000/api/portfolio/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, positions: [] }),
    }));
    expect(empty.status).toBe(200);
    expect((await empty.json()).received).toBe(0);
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("keeps the ops dashboard closed without a configured credential", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect((await opsDashboard(opsRequest())).status).toBe(503);
    vi.stubEnv("OPS_DASHBOARD_TOKEN", "short");
    expect((await opsDashboard(opsRequest("Bearer short"))).status).toBe(503);
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("allows only the configured Bearer token for headless ops access", async () => {
    const token = "o".repeat(40);
    vi.stubEnv("OPS_DASHBOARD_TOKEN", token);
    expect((await opsDashboard(opsRequest())).status).toBe(401);
    expect((await opsDashboard(opsRequest(undefined, `?token=${token}`))).status).toBe(401);
    expect((await opsDashboard(opsRequest("Bearer wrong-token"))).status).toBe(401);
    expect((await opsDashboard(opsRequest(`Bearer ${token}`))).status).toBe(200);
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("continues to allow a signed-in Clerk administrator without the machine token", async () => {
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    clerkAuth.mockResolvedValue({ userId: "user_1" });
    clerkClient.mockResolvedValue({ users: { getUser: vi.fn(async () => ({
      primaryEmailAddress: { emailAddress: "admin@example.com" }, emailAddresses: [],
    })) } });
    expect((await opsDashboard(opsRequest())).status).toBe(200);
    vi.stubEnv("ADMIN_EMAILS", "other@example.com");
    expect((await opsDashboard(opsRequest())).status).toBe(401);
  });
});

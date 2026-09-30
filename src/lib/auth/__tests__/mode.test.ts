import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const clerkGate = vi.hoisted(() => ({
  run: vi.fn(),
  protect: vi.fn(async () => undefined),
}));

vi.mock("@clerk/nextjs/server", () => ({
  createRouteMatcher: () => (request: NextRequest) =>
    ["/sign-in", "/sign-up", "/api/health", "/api/portfolio/sync", "/api/ops/dashboard"].some(path => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + "/")),
  clerkMiddleware: (handler: (auth: (() => unknown) & { protect: () => Promise<void> }, request: NextRequest) => Promise<unknown>) =>
    async (request: NextRequest) => {
      clerkGate.run(request.nextUrl.pathname);
      await handler(Object.assign(() => ({}), { protect: clerkGate.protect }), request);
      return new Response(null, { status: 200 });
    },
}));

import { authMode } from "../mode";
import { middleware } from "@/middleware";

const request = (path: string, host = "localhost") => new NextRequest(`http://${host}:3000${path}`);

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  clerkGate.run.mockClear();
  clerkGate.protect.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("auth mode and middleware", () => {
  it("allows the keyless prototype only on loopback", async () => {
    expect(authMode()).toBe("prototype");
    expect((await middleware(request("/api/ai/analyze"), {} as never) as Response).status).toBe(200);
    expect((await middleware(request("/api/ai/analyze", "192.168.1.10"), {} as never) as Response).status).toBe(403);
    expect(clerkGate.run).not.toHaveBeenCalled();
  });

  it("fails closed in production or when only one key or placeholders are present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(authMode()).toBe("unavailable");
    expect((await middleware(request("/api/ai/analyze"), {} as never) as Response).status).toBe(503);
    expect((await middleware(request("/api/health"), {} as never) as Response).status).toBe(200);
    expect((await middleware(request("/api/portfolio/sync"), {} as never) as Response).status).toBe(200);
    expect((await middleware(request("/api/ops/dashboard"), {} as never) as Response).status).toBe(200);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_...");
    expect(authMode()).toBe("unavailable");
    expect((await middleware(request("/"), {} as never) as Response).status).toBe(503);
    expect(clerkGate.run).not.toHaveBeenCalled();
  });

  it("accepts standard base64 characters in configured Clerk keys", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_" + "a".repeat(22) + "+/");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_" + "b".repeat(22) + "+/");
    expect(authMode()).toBe("clerk");
  });

  it("runs Clerk protection for app and API paths while leaving auth and health pages public", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_" + "a".repeat(24));
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_" + "b".repeat(24));
    expect(authMode()).toBe("clerk");
    for (const path of ["/", "/api/ai/analyze", "/api/ai/keys", "/api/user/migrate", "/api/settings/keys"]) {
      expect((await middleware(request(path), {} as never) as Response).status).toBe(200);
    }
    expect(clerkGate.protect).toHaveBeenCalledTimes(5);
    for (const path of ["/sign-in", "/sign-up", "/api/health", "/api/portfolio/sync", "/api/ops/dashboard"]) {
      expect((await middleware(request(path), {} as never) as Response).status).toBe(200);
    }
    expect(clerkGate.protect).toHaveBeenCalledTimes(5);
  });
});

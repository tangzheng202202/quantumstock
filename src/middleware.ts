/** Local anonymous prototype or Clerk-protected deployment. */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authMode, isLoopbackHost } from "@/lib/auth/mode";

// Machine endpoints have their own mandatory server-side token gates.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/health", "/api/portfolio/sync", "/api/ops/dashboard"]);
const clerkGate = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect();
});

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const mode = authMode();
  if (mode === "prototype") {
    if (!isLoopbackHost(request.nextUrl.hostname)) {
      return NextResponse.json({ success: false, error: "匿名原型仅允许本机访问" }, { status: 403 });
    }
    return NextResponse.next();
  }
  if (mode === "unavailable") {
    if (["/api/health", "/api/portfolio/sync", "/api/ops/dashboard"].includes(request.nextUrl.pathname)) return NextResponse.next();
    return NextResponse.json({ success: false, error: "Clerk 认证配置缺失或不完整" }, { status: 503 });
  }
  return clerkGate(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|logo\\.png).*)"],
};

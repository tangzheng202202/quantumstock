import { NextResponse } from "next/server";
import { authMode, isLoopbackHost } from "./mode";

type RouteIdentity =
  | { userId: string | null; keyCookieOwner: string; error: null }
  | { userId: null; keyCookieOwner: null; error: NextResponse };

/** Resolve route identity without invoking Clerk in the local prototype. */
export async function routeIdentity(request: Request, options: { allowPrototype?: boolean } = {}): Promise<RouteIdentity> {
  const mode = authMode();
  if (mode === "unavailable") {
    return { userId: null, keyCookieOwner: null, error: NextResponse.json({ success: false, error: "Clerk 认证配置缺失或不完整" }, { status: 503 }) };
  }
  if (mode === "prototype") {
    if (!isLoopbackHost(new URL(request.url).hostname)) {
      return { userId: null, keyCookieOwner: null, error: NextResponse.json({ success: false, error: "匿名原型仅允许本机访问" }, { status: 403 }) };
    }
    return options.allowPrototype
      ? { userId: null, keyCookieOwner: "prototype:loopback", error: null }
      : { userId: null, keyCookieOwner: null, error: NextResponse.json({ success: false, error: "请先配置 Clerk 并登录" }, { status: 401 }) };
  }
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId
      ? { userId, keyCookieOwner: `clerk:${userId}`, error: null }
      : { userId: null, keyCookieOwner: null, error: NextResponse.json({ success: false, error: "请先登录" }, { status: 401 }) };
  } catch {
    return { userId: null, keyCookieOwner: null, error: NextResponse.json({ success: false, error: "Clerk 认证中间件不可用" }, { status: 503 }) };
  }
}

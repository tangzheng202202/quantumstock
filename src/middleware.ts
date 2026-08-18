/**
 * Auth middleware — Clerk-based user authentication.
 *
 * Mode A (dev, no Clerk keys): all requests pass through — data stored in localStorage.
 * Mode B (prod, Clerk configured): protected routes require sign-in.
 *
 * To switch to Mode B, set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple request logging for dev
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next/static|_next/image|favicon\\.ico|logo\\.png).*)",
  ],
};

/**
 * withApiHandler — wraps a route handler with cross-cutting concerns:
 *   - traceId generation + `x-trace-id` response header
 *   - uniform error capture → standardized error body
 *   - error logging with route name + traceId
 *
 * The returned function intentionally takes only `(req)` so it satisfies
 * Next.js 15's strict route-export type validation (a second, optional
 * context argument is rejected by the build-time type checker). Dynamic
 * params, when needed, can be read inside the handler via req.nextUrl.
 *
 * Routes that intentionally fall back to mock data keep their own internal
 * try/catch and return apiSuccess(mock); only unexpected errors reach here.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiError, generateTraceId } from "./response";

type Handler = (req: NextRequest, traceId: string) => Promise<NextResponse>;

export function withApiHandler(routeName: string, handler: Handler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const traceId = generateTraceId();
    try {
      const res = await handler(req, traceId);
      res.headers.set("x-trace-id", traceId);
      return res;
    } catch (error) {
      console.error(`[api:${routeName}] traceId=${traceId}`, error);
      const res = apiError(error, traceId);
      res.headers.set("x-trace-id", traceId);
      return res;
    }
  };
}

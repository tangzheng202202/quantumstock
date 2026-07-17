/**
 * Unified API response helpers.
 *
 * Success shape: { success:true, data, meta:{ timestamp, source?, traceId?, ... } }
 * Error shape:   { success:false, error:string, code, meta:{ timestamp, traceId } }
 *
 * The success shape is intentionally kept compatible with the existing frontend
 * `apiGet` consumer, which reads `json.success && json.data` and `meta.source`.
 */
import { NextResponse } from "next/server";
import { AppError } from "./errors";

/** Generate a short unique trace id for request correlation. */
export function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SuccessMeta {
  source?: string;
  traceId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/** Build a standardized success response. */
export function apiSuccess<T>(data: T, meta: SuccessMeta = {}): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    meta: { timestamp: Date.now(), ...meta },
  });
}

/** Convert any thrown value into a standardized error response. */
export function apiError(error: unknown, traceId?: string): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        meta: { traceId, timestamp: Date.now() },
      },
      { status: error.statusCode }
    );
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
      meta: { traceId, timestamp: Date.now() },
    },
    { status: 500 }
  );
}

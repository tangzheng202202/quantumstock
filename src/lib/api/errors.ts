/**
 * Unified API error hierarchy.
 * Every route surfaces errors as AppError (or subclasses), which the
 * response layer converts into a consistent { success:false, error, code } body.
 */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(message: string, statusCode = 500, code: ApiErrorCode = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** 400 — request params/body failed validation. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

/** 404 — requested resource has no data. */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/** 502 — upstream data provider failed or returned unusable data. */
export class UpstreamError extends AppError {
  constructor(message: string) {
    super(message, 502, "UPSTREAM_ERROR");
    this.name = "UpstreamError";
  }
}

/** 504 — upstream request timed out. */
export class TimeoutError extends AppError {
  constructor(message: string) {
    super(message, 504, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

/** 429 — rate limited. */
export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

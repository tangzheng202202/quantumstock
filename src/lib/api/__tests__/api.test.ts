import { describe, it, expect } from "vitest";
import { apiSuccess, apiError, generateTraceId } from "../response";
import {
  AppError,
  ValidationError,
  NotFoundError,
  UpstreamError,
  TimeoutError,
  RateLimitError,
} from "../errors";
import { validate, symbolSchema, symbolsParamSchema, screenerQuerySchema } from "../validation";
import { z } from "zod";

describe("apiSuccess", () => {
  it("wraps data with success flag and timestamp meta", async () => {
    const res = apiSuccess({ a: 1 }, { source: "sina" });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ a: 1 });
    expect(json.meta.source).toBe("sina");
    expect(typeof json.meta.timestamp).toBe("number");
  });
});

describe("apiError", () => {
  it("maps AppError to its statusCode and code", async () => {
    const res = apiError(new UpstreamError("boom"), "tid-1");
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      error: "boom",
      code: "UPSTREAM_ERROR",
    });
    expect(json.meta.traceId).toBe("tid-1");
  });

  it("maps unknown errors to 500 INTERNAL_ERROR", async () => {
    const res = apiError(new Error("x"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe("INTERNAL_ERROR");
  });
});

describe("error hierarchy", () => {
  it.each([
    [new ValidationError("v"), 400, "VALIDATION_ERROR"],
    [new NotFoundError("n"), 404, "NOT_FOUND"],
    [new UpstreamError("u"), 502, "UPSTREAM_ERROR"],
    [new TimeoutError("t"), 504, "TIMEOUT"],
    [new RateLimitError("r"), 429, "RATE_LIMITED"],
    [new AppError("i"), 500, "INTERNAL_ERROR"],
  ] as const)("carries correct statusCode and code", (err, status, code) => {
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
    expect(err instanceof AppError).toBe(true);
  });
});

describe("validate", () => {
  it("returns parsed data on success", () => {
    expect(validate(symbolSchema, "600519")).toBe("600519");
  });

  it("applies schema defaults", () => {
    const schema = z.object({ n: z.coerce.number().default(5) });
    expect(validate(schema, {})).toEqual({ n: 5 });
  });

  it("throws ValidationError with path on failure", () => {
    expect(() => validate(symbolSchema, "!!!")).toThrow(ValidationError);
    expect(() => validate(symbolSchema, null)).toThrow(ValidationError);
  });
});

describe("schemas", () => {
  it("symbolSchema accepts A/HK/US formats", () => {
    expect(validate(symbolSchema, "600519")).toBe("600519");
    expect(validate(symbolSchema, "00700")).toBe("00700");
    expect(validate(symbolSchema, "AAPL")).toBe("AAPL");
  });

  it("symbolsParamSchema splits and caps at 50", () => {
    expect(validate(symbolsParamSchema, "600519,AAPL")).toEqual(["600519", "AAPL"]);
    const tooMany = Array.from({ length: 51 }, (_, i) => `6000${String(i).padStart(2, "0")}`).join(",");
    expect(() => validate(symbolsParamSchema, tooMany)).toThrow(ValidationError);
  });

  it("screenerQuerySchema coerces and defaults", () => {
    const q = validate(screenerQuerySchema, { peMax: "15", limit: undefined });
    expect(q.sortBy).toBe("changePercent");
    expect(q.sortOrder).toBe("desc");
    expect(q.peMax).toBe(15);
    expect(q.limit).toBe(200);
  });
});

describe("generateTraceId", () => {
  it("produces unique ids", () => {
    expect(generateTraceId()).not.toBe(generateTraceId());
  });
});

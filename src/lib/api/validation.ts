/**
 * Request validation powered by zod.
 * Schemas describe the *public* query/body contract of each route; the
 * `validate` helper throws a ValidationError (400) on any mismatch.
 */
import { z } from "zod";
import { ValidationError } from "./errors";

/**
 * Validate an arbitrary value against a zod schema.
 * Throws ValidationError with a readable first-issue message on failure.
 * Returns the schema's *output* type (defaults/coercions applied).
 */
export function validate<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join(".") || "value";
    throw new ValidationError(`${path}: ${issue.message}`);
  }
  return result.data as z.output<S>;
}

/** Symbol: 6-digit A-share, 5-digit HK, or 1-6 letter US ticker. */
export const symbolSchema = z
  .string()
  .trim()
  .regex(/^(\d{6}|\d{5}|[A-Za-z]{1,6})$/, "无效的股票代码");

/** Comma-separated symbols query param → string[]. */
export const symbolsParamSchema = z
  .string()
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(symbolSchema).max(50, "一次最多查询 50 只股票"));

export const intervalSchema = z.enum(["1d", "1wk", "1mo"]).default("1d");

export const rangeSchema = z
  .enum(["1mo", "3mo", "6mo", "1y", "2y", "5y"])
  .default("6mo");

/** Sector heat-map dimension. */
export const sectorDimensionSchema = z.enum(["change", "rotation"]).default("change");

/** Screener query params. Accepts an object of raw (string|undefined) values. */
export const screenerQuerySchema = z.object({
  sortBy: z.enum(["changePercent", "pe", "roe", "volume"]).default("changePercent"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  peMax: z.coerce.number().positive().optional(),
  roeMin: z.coerce.number().optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

/** Positive integer within an optional bound. */
export function boundedIntSchema(def: number, max: number) {
  return z
    .string()
    .optional()
    .transform((s) => (s == null ? def : parseInt(s, 10)))
    .pipe(z.number().int().positive().max(max))
    .catch(def);
}

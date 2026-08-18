import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "@/lib/observability/usage";

describe("estimateCostUsd", () => {
  it("prices known models (per 1M tokens)", () => {
    // 1M input tokens of gpt-4o = $2.5
    expect(estimateCostUsd("gpt-4o", 1_000_000, 0)).toBe(2.5);
    // 1M output tokens of claude-opus-4 = $75
    expect(estimateCostUsd("claude-opus-4", 0, 1_000_000)).toBe(75);
    // mixed
    expect(estimateCostUsd("deepseek-v4-flash", 500_000, 1_000_000)).toBeCloseTo(0.07 + 0.28, 5);
  });

  it("unknown models cost 0 (no fabricated numbers)", () => {
    expect(estimateCostUsd("mystery-model", 1e9, 1e9)).toBe(0);
    expect(estimateCostUsd(null, 1e9, 1e9)).toBe(0);
  });

  it("zero tokens cost zero", () => {
    expect(estimateCostUsd("gpt-4o", 0, 0)).toBe(0);
  });

  it("small usage rounds to micro-dollars", () => {
    expect(estimateCostUsd("gpt-4o", 1000, 1000)).toBeLessThan(0.02);
    expect(estimateCostUsd("gpt-4o", 1000, 1000)).toBeGreaterThan(0);
  });
});

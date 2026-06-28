import { describe, it, expect } from "vitest";
import { runBacktest, type KLineBar } from "../engine";

/** Generate synthetic K-line data with known pattern. */
function makeBars(count: number, startPrice: number, trend: "up" | "down" | "sideways" = "up"): KLineBar[] {
  const bars: KLineBar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    let change: number;
    if (trend === "up") {
      change = (Math.sin(i / 5) * 2 + 0.5); // uptrend with oscillation
    } else if (trend === "down") {
      change = (Math.sin(i / 5) * 2 - 0.5);
    } else {
      change = Math.sin(i / 5) * 2; // sideways
    }
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.abs(change) * 0.3;
    const low = Math.min(open, close) - Math.abs(change) * 0.3;
    bars.push({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 100000 + Math.random() * 50000,
    });
    price = close;
  }
  return bars;
}

describe("runBacktest", () => {
  it("should throw if less than 30 bars", () => {
    expect(() => runBacktest(makeBars(20, 100), "dual_ma", { fastPeriod: 5, slowPeriod: 20 })).toThrow(
      "K线数据不足"
    );
  });

  it("should throw for unknown strategy", () => {
    expect(() => runBacktest(makeBars(50, 100), "nonexistent", {})).toThrow("Unknown strategy");
  });

  it("should return metrics with required fields", () => {
    const bars = makeBars(100, 100, "up");
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 });
    expect(result).toHaveProperty("metrics");
    expect(result).toHaveProperty("equityCurve");
    expect(result).toHaveProperty("trades");
    expect(result.metrics).toHaveProperty("totalReturn");
    expect(result.metrics).toHaveProperty("sharpeRatio");
    expect(result.metrics).toHaveProperty("calmarRatio");
    expect(result.metrics).toHaveProperty("maxDrawdown");
    expect(result.metrics).toHaveProperty("winRate");
  });

  it("should produce equity curve with same length as bars", () => {
    const bars = makeBars(60, 100, "up");
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 });
    expect(result.equityCurve.length).toBe(bars.length);
  });

  it("should have non-negative cash in equity curve", () => {
    const bars = makeBars(80, 100, "up");
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 });
    for (const point of result.equityCurve) {
      expect(point.value).toBeGreaterThan(0);
    }
  });

  it("should generate trades in uptrend", () => {
    const bars = makeBars(100, 100, "up");
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 });
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it("should compute valid win rate between 0 and 100", () => {
    const bars = makeBars(100, 100, "sideways");
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 });
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(100);
  });

  it("should compute profit factor as positive or Infinity", () => {
    const bars = makeBars(100, 100, "up");
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 });
    expect(result.metrics.profitFactor === Infinity || result.metrics.profitFactor >= 0).toBe(true);
  });

  it("should handle turtle strategy without errors", () => {
    const bars = makeBars(80, 100, "up");
    const result = runBacktest(bars, "turtle", { entryPeriod: 20, exitPeriod: 10, atrPeriod: 20 });
    expect(result.trades).toBeDefined();
  });

  it("should handle mean_reversion strategy without errors", () => {
    const bars = makeBars(80, 100, "sideways");
    const result = runBacktest(bars, "mean_reversion", { bbPeriod: 20, stdDev: 2 });
    expect(result.trades).toBeDefined();
  });

  it("should respect initial capital", () => {
    const bars = makeBars(60, 100, "up");
    const initialCapital = 500000;
    const result = runBacktest(bars, "dual_ma", { fastPeriod: 5, slowPeriod: 20 }, initialCapital);
    // Equity curve should start at or below initial capital
    expect(result.equityCurve[0].value).toBeLessThanOrEqual(initialCapital * 1.01);
  });
});

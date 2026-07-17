import { describe, it, expect } from "vitest";
import { SMA, EMA, MACD, RSI, BollingerBands, ATR, detectCross } from "../index";

describe("SMA", () => {
  it("should return nulls for first period-1 elements", () => {
    const data = [1, 2, 3, 4, 5];
    const result = SMA(data, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2); // (1+2+3)/3
  });

  it("should compute correct rolling average", () => {
    const data = [10, 20, 30, 40, 50];
    const result = SMA(data, 3);
    expect(result[2]).toBe(20); // (10+20+30)/3
    expect(result[3]).toBe(30); // (20+30+40)/3
    expect(result[4]).toBe(40); // (30+40+50)/3
  });

  it("should handle period=1 (identity)", () => {
    const data = [5, 10, 15];
    const result = SMA(data, 1);
    expect(result).toEqual([5, 10, 15]);
  });

  it("should handle empty array", () => {
    const result = SMA([], 3);
    expect(result).toEqual([]);
  });

  it("should produce same results as O(n²) approach", () => {
    const data = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 50 + 100);
    const period = 10;
    const result = SMA(data, period);
    for (let i = period - 1; i < data.length; i++) {
      const expected = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      expect(result[i]).toBeCloseTo(expected, 10);
    }
  });
});

describe("EMA", () => {
  it("should return nulls for first period-1 elements", () => {
    const result = EMA([1, 2, 3], 5);
    expect(result.every(v => v === null)).toBe(true);
  });

  it("should seed with SMA for first value", () => {
    const data = [2, 4, 6, 8, 10];
    const result = EMA(data, 3);
    // First EMA = SMA(3) = (2+4+6)/3 = 4
    expect(result[2]).toBe(4);
  });

  it("should apply exponential weighting after seed", () => {
    const data = [2, 4, 6, 8, 10];
    const result = EMA(data, 3);
    // EMA[3] = (8 - 4) * 0.5 + 4 = 6
    expect(result[3]).toBe(6);
    // EMA[4] = (10 - 6) * 0.5 + 6 = 8
    expect(result[4]).toBe(8);
  });
});

describe("MACD", () => {
  it("should return arrays of same length as input", () => {
    const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const { macd, signal, histogram } = MACD(data);
    expect(macd.length).toBe(50);
    expect(signal.length).toBe(50);
    expect(histogram.length).toBe(50);
  });

  it("should have nulls in early MACD values (before slowPeriod)", () => {
    const data = Array.from({ length: 50 }, (_, i) => 100 + i);
    const { macd } = MACD(data, 12, 26, 9);
    // MACD line starts at index 25 (slowPeriod-1)
    expect(macd[24]).toBeNull();
    expect(macd[25]).not.toBeNull();
  });
});

describe("RSI", () => {
  it("should return 100 for monotonically increasing data", () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const result = RSI(data, 14);
    const lastVal = result[result.length - 1];
    expect(lastVal).toBe(100);
  });

  it("should return 0 for monotonically decreasing data", () => {
    const data = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const result = RSI(data, 14);
    const lastVal = result[result.length - 1];
    expect(lastVal).toBe(0);
  });

  it("should return values between 0 and 100", () => {
    const data = [50, 52, 48, 55, 51, 49, 53, 47, 56, 50, 54, 46, 58, 52, 50, 55];
    const result = RSI(data, 14);
    for (const v of result) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("BollingerBands", () => {
  it("should return upper >= middle >= lower", () => {
    const data = [20, 22, 19, 21, 23, 18, 24, 20, 22, 21, 19, 23, 25, 20, 22, 21, 20, 22, 21, 23];
    const { upper, middle, lower } = BollingerBands(data, 20, 2);
    const lastIdx = data.length - 1;
    if (upper[lastIdx] !== null && middle[lastIdx] !== null && lower[lastIdx] !== null) {
      expect(upper[lastIdx]!).toBeGreaterThanOrEqual(middle[lastIdx]!);
      expect(middle[lastIdx]!).toBeGreaterThanOrEqual(lower[lastIdx]!);
    }
  });
});

describe("ATR", () => {
  it("should return positive values", () => {
    const data = [
      { high: 105, low: 95, close: 100 },
      { high: 108, low: 98, close: 103 },
      { high: 110, low: 100, close: 105 },
      { high: 107, low: 102, close: 104 },
    ];
    const result = ATR(data, 3);
    for (const v of result) {
      if (v !== null) expect(v).toBeGreaterThan(0);
    }
  });
});

describe("detectCross", () => {
  it("should detect golden cross", () => {
    const fast = [1, 2, 3, 5];
    const slow = [3, 3, 3, 3];
    const result = detectCross(fast, slow);
    // At index 2, fast(3) <= slow(3), at index 3, fast(5) > slow(3) → golden
    expect(result[3]).toBe("golden");
  });

  it("should detect dead cross", () => {
    const fast = [5, 4, 3, 1];
    const slow = [3, 3, 3, 3];
    const result = detectCross(fast, slow);
    expect(result[3]).toBe("dead");
  });
});

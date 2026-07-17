import { describe, it, expect } from "vitest";
import { formatCurrency, formatPercent, formatLargeNumber, cnColor, cnBgColor, sanitizeHtml } from "../utils";

describe("formatCurrency", () => {
  it("should format CNY correctly", () => {
    const result = formatCurrency(1234567.89, "CNY");
    expect(result).toContain("1,234,567.89");
  });

  it("should format USD correctly", () => {
    const result = formatCurrency(99.99, "USD");
    expect(result).toContain("99.99");
  });

  it("should handle zero", () => {
    const result = formatCurrency(0, "CNY");
    expect(result).toContain("0.00");
  });

  it("should handle negative numbers", () => {
    const result = formatCurrency(-1234.56, "CNY");
    expect(result).toContain("1,234.56");
  });
});

describe("formatPercent", () => {
  it("should add + sign for positive values by default", () => {
    expect(formatPercent(3.14)).toBe("+3.14%");
  });

  it("should not add + sign when signed=false", () => {
    expect(formatPercent(3.14, false)).toBe("3.14%");
  });

  it("should handle negative values", () => {
    expect(formatPercent(-2.5)).toBe("-2.50%");
  });

  it("should handle zero (no + sign when value is 0)", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });
});

describe("formatLargeNumber", () => {
  it("should format in 亿 for large CNY amounts", () => {
    const result = formatLargeNumber(1.5e8);
    expect(result).toContain("亿");
  });

  it("should format in K for small amounts", () => {
    const result = formatLargeNumber(1500);
    expect(result).toContain("K");
  });

  it("should format in T for very large amounts", () => {
    const result = formatLargeNumber(1.5e12);
    expect(result).toContain("T");
  });

  it("should format in M for million-range amounts", () => {
    expect(formatLargeNumber(2.5e6)).toContain("M");
  });

  it("should format sub-thousand values with two decimals", () => {
    expect(formatLargeNumber(999)).toBe("999.00");
    expect(formatLargeNumber(0.5)).toBe("0.50");
  });
});

describe("cnColor", () => {
  it("should return bull color for positive", () => {
    expect(cnColor(1)).toBe("text-bull");
  });

  it("should return bear color for negative", () => {
    expect(cnColor(-1)).toBe("text-bear");
  });

  it("should return muted for zero", () => {
    expect(cnColor(0)).toBe("text-muted-foreground");
  });
});

describe("cnBgColor", () => {
  it("returns bull bg for positive", () => {
    expect(cnBgColor(1)).toBe("bg-bull/10 text-bull");
  });

  it("returns bear bg for negative", () => {
    expect(cnBgColor(-1)).toBe("bg-bear/10 text-bear");
  });

  it("returns muted bg for zero", () => {
    expect(cnBgColor(0)).toBe("bg-muted text-muted-foreground");
  });
});

describe("sanitizeHtml", () => {
  it("strips script tags and their content", () => {
    expect(sanitizeHtml('<p>hi</p><script>alert(1)</script>')).toBe("<p>hi</p>");
  });

  it("strips inline event handlers (quoted and unquoted)", () => {
    const quoted = sanitizeHtml('<div onclick="x()">a</div>');
    expect(quoted).not.toContain("onclick");
    expect(quoted).not.toContain("x()");
    const unquoted = sanitizeHtml("<img src=a onerror=alert(1)>");
    expect(unquoted).not.toContain("onerror");
    expect(unquoted).not.toContain("alert");
  });

  it("strips iframe tags", () => {
    expect(sanitizeHtml('<iframe src="http://evil"></iframe>safe')).toBe("safe");
  });

  it("leaves benign markup intact", () => {
    expect(sanitizeHtml("<p>Hello <strong>world</strong></p>")).toBe("<p>Hello <strong>world</strong></p>");
  });
});

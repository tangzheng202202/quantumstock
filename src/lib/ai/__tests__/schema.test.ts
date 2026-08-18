import { describe, it, expect } from "vitest";
import { extractStructured, StructuredAnalysisSchema, STRUCTURED_OUTPUT_INSTRUCTION } from "@/lib/ai/schema";

const valid = {
  rating: 4,
  summary: "白酒龙头基本面稳健，估值处于历史低位",
  bullish: ["品牌护城河深厚", "现金流充沛"],
  bearish: ["消费复苏不及预期"],
  keyMetrics: ["PE(TTM) 22.1"],
  dataCaveats: [],
};

describe("StructuredAnalysisSchema", () => {
  it("accepts a valid payload", () => {
    expect(StructuredAnalysisSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects rating out of range", () => {
    expect(StructuredAnalysisSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
  });
  it("rejects empty bearish (risk disclosure is mandatory)", () => {
    expect(StructuredAnalysisSchema.safeParse({ ...valid, bearish: [] }).success).toBe(false);
  });
  it("rejects a confidence field? (extra keys pass by default — documented decision)", () => {
    // zod strips unknown keys by default; confidence is simply ignored.
    const r = StructuredAnalysisSchema.safeParse({ ...valid, confidence: 0.9 });
    expect(r.success).toBe(true);
    expect((r as any).data.confidence).toBeUndefined();
  });
});

describe("extractStructured", () => {
  it("parses the last json block", () => {
    const md = `分析正文...\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\n`;
    expect(extractStructured(md)?.rating).toBe(4);
  });
  it("skips invalid blocks and uses the earlier valid one", () => {
    const md = `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\n中间文字\n\`\`\`json\n{broken\n\`\`\``;
    expect(extractStructured(md)?.rating).toBe(4);
  });
  it("returns null when absent", () => {
    expect(extractStructured("no blocks here")).toBeNull();
  });
  it("returns null when schema-invalid", () => {
    expect(extractStructured("```json\n{\"rating\": 9}\n```")).toBeNull();
  });
  it("instruction mentions no-confidence rule", () => {
    expect(STRUCTURED_OUTPUT_INSTRUCTION).toContain("置信度");
  });
});

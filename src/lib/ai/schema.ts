/**
 * Structured analysis output (Phase 3) — zod-validated JSON contract.
 *
 * The prompt asks models to append a fenced ```json block; this module parses
 * and validates it. On validation failure the result degrades gracefully to
 * unstructured (content-only).
 *
 * NOTE: `confidence` is intentionally absent — LLM self-reported confidence
 * is not calibrated and displaying it would mislead users (see the
 * pseudo-confidence removal in the ai-analysis page).
 */

import { z } from "zod";

export const StructuredAnalysisSchema = z.object({
  /** 1-5 star rating (5 = strongest conviction). */
  rating: z.number().int().min(1).max(5),
  /** One-sentence conclusion (≤80 chars zh). */
  summary: z.string().min(4).max(160),
  /** Bullish factors, 2-5 items. */
  bullish: z.array(z.string().min(2).max(120)).min(1).max(5),
  /** Bearish/risk factors, 1-5 items. */
  bearish: z.array(z.string().min(2).max(120)).min(1).max(5),
  /** Key indicators referenced (free-form, e.g. "PE(TTM) 32.1"). */
  keyMetrics: z.array(z.string().max(80)).max(8).default([]),
  /** Data limitations the model must acknowledge. */
  dataCaveats: z.array(z.string().max(120)).max(4).default([]),
});

export type StructuredAnalysis = z.infer<typeof StructuredAnalysisSchema>;

/**
 * Extract + validate the structured block from a model's markdown response.
 * Returns null when absent or invalid (caller falls back to unstructured).
 */
export function extractStructured(content: string): StructuredAnalysis | null {
  // Find the last fenced json block
  const blocks = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (blocks.length === 0) return null;

  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(blocks[i][1].trim());
      const result = StructuredAnalysisSchema.safeParse(parsed);
      if (result.success) return result.data;
    } catch {
      // try earlier blocks
    }
  }
  return null;
}

/** Prompt suffix instructing the model to emit the structured block. */
export const STRUCTURED_OUTPUT_INSTRUCTION = `

## 输出格式要求（必须遵守）
在正文分析完成后，最后追加一个 JSON 代码块，结构如下：
\`\`\`json
{
  "rating": <1-5 整数，5 为最高看多>,
  "summary": "<一句话结论，不超过80字>",
  "bullish": ["<利多因素1>", "<利多因素2>"],
  "bearish": ["<利空/风险因素1>"],
  "keyMetrics": ["<引用的关键指标，如 PE(TTM) 32.1>"],
  "dataCaveats": ["<数据局限性说明>"]
}
\`\`\`
bullish 1-5 条，bearish 1-5 条；keyMetrics 与 dataCaveats 可为空数组。
不要输出"置信度"字段——你的输出未经校准，不存在可信的置信度数值。`;

import { fetchSinaIndices } from "@/lib/data/sina";
import { fetchTencentIndices } from "@/lib/data/tencent";
import { MOCK_INDICES } from "@/lib/data/market";
import { getIndicesWithFailover } from "@/lib/data/providers";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * Fallback chain (Phase 2 provider registry): python-engine(AKShare) → sina →
 * tencent → mock (flagged degraded).
 */
export const GET = withApiHandler("market/indices", async () => {
  const result = await getIndicesWithFailover();
  if (result && result.data.length > 0 && (result.data as any[]).some(d => d.value > 0)) {
    return apiSuccess(result.data, { source: result.provider });
  }

  try {
    const data = await fetchTencentIndices();
    if (data.length > 0 && data.some(d => d.value > 0)) {
      return apiSuccess(data, { source: "tencent" });
    }
  } catch (e) {
    console.warn(`[indices] Tencent failed: ${e}`);
  }

  console.warn("[indices] all providers failed, serving mock");
  return apiSuccess(MOCK_INDICES, { source: "mock", degraded: true });
});

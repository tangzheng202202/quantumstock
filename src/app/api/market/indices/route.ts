import { fetchSinaIndices } from "@/lib/data/sina";
import { fetchTencentIndices } from "@/lib/data/tencent";
import { MOCK_INDICES } from "@/lib/data/market";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = withApiHandler("market/indices", async () => {
  // Fallback chain: Sina → Tencent → mock
  try {
    const data = await fetchSinaIndices();
    if (data.length > 0 && data.some(d => d.value > 0)) {
      return apiSuccess(data, { source: "sina" });
    }
    throw new Error("No index data from Sina");
  } catch (e) {
    console.warn(`[indices] Sina failed, trying Tencent: ${e}`);
  }

  try {
    const data = await fetchTencentIndices();
    if (data.length > 0 && data.some(d => d.value > 0)) {
      return apiSuccess(data, { source: "tencent" });
    }
    throw new Error("No index data from Tencent");
  } catch {
    return apiSuccess(MOCK_INDICES, { source: "mock" });
  }
});

import { fetchIndustrySectors, fetchSectorRotation } from "@/lib/data/eastmoney";
import { MOCK_HEATMAP, MOCK_SECTOR_ROTATION } from "@/lib/data/market";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { sectorDimensionSchema, validate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/sectors?dimension=change|rotation
 * Real-time industry board data from EastMoney, mock fallback when unreachable.
 */
export const GET = withApiHandler("market/sectors", async (req) => {
  const dimension = validate(
    sectorDimensionSchema,
    req.nextUrl.searchParams.get("dimension") ?? "change"
  );

  try {
    if (dimension === "rotation") {
      const data = await fetchSectorRotation();
      if (data.length > 0) return apiSuccess(data, { source: "eastmoney", count: data.length });
      return apiSuccess(MOCK_SECTOR_ROTATION, { source: "mock" });
    }

    const data = await fetchIndustrySectors();
    if (data.length > 0) return apiSuccess(data, { source: "eastmoney", count: data.length });
    return apiSuccess(MOCK_HEATMAP, { source: "mock" });
  } catch (e) {
    console.warn(`[sectors] EastMoney failed, serving mock: ${e}`);
    const fallback = dimension === "rotation" ? MOCK_SECTOR_ROTATION : MOCK_HEATMAP;
    return apiSuccess(fallback, { source: "mock" });
  }
});

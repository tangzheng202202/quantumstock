import { smartSearch } from "@/lib/data/sina";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export const GET = withApiHandler("market/search", async (req) => {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) throw new ValidationError("q required");

  const results = await smartSearch(q);
  return apiSuccess(results, { query: q, count: results.length });
});

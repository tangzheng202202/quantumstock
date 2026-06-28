import { NextResponse } from "next/server";
import { fetchSinaIndices } from "@/lib/data/sina";
import { MOCK_INDICES } from "@/lib/data/market";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchSinaIndices();
    if (data.length > 0 && data.some(d => d.value > 0)) {
      return NextResponse.json({ success: true, data, meta: { source: "sina" } });
    }
    throw new Error("No index data");
  } catch {
    return NextResponse.json({ success: true, data: MOCK_INDICES, meta: { source: "mock" } });
  }
}

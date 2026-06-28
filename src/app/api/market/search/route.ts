import { NextRequest, NextResponse } from "next/server";
import { smartSearch } from "@/lib/data/sina";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 1) {
    return NextResponse.json({ success: false, error: "q required" }, { status: 400 });
  }
  try {
    const results = await smartSearch(q);
    return NextResponse.json({ success: true, data: results, meta: { query: q, count: results.length } });
  } catch (e) {
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}

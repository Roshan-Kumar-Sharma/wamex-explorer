import { NextRequest, NextResponse } from "next/server";
import { getFullAbstract } from "@/lib/abstract";

/** GET /api/abstract/12345 -> the full abstract, from cache or fetched now. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ anumber: string }> }) {
  const { anumber } = await ctx.params;
  const a = Number(anumber);
  if (!Number.isInteger(a) || a <= 0) {
    return NextResponse.json({ error: "bad A-number" }, { status: 400 });
  }
  const r = await getFullAbstract(a);
  return NextResponse.json(r, { status: r.source === "error" && !r.fetched_at ? 404 : 200 });
}

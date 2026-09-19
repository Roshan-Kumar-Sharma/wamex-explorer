import { NextRequest, NextResponse } from "next/server";
import { loadBrief } from "@/lib/briefs";

/** GET /api/briefs/:id -> the stored brief, its polygon and filters. Used by the map to reload a permalink. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await loadBrief(id, { countView: false });
  if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(b);
}

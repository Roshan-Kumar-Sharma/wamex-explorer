import { NextRequest, NextResponse } from "next/server";
import { buildBrief } from "@/lib/brief";
import type { Filters } from "@/lib/filters";

/**
 * The interactive brief. All the work is in lib/brief.ts so that a stored
 * permalink (POST /api/briefs) is built by exactly the same code.
 */
export async function POST(req: NextRequest) {
  let geom: unknown;
  let filters: Filters = {};
  try {
    const body = await req.json();
    geom = body.geometry;
    filters = body.filters ?? {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!geom) {
    return NextResponse.json({ error: "missing `geometry`" }, { status: 400 });
  }

  if (process.env.NODE_ENV !== "production") {
    const ring = (geom as { coordinates?: number[][][] }).coordinates?.[0];
    console.log(`[brief] ${ring?.length ?? "?"} ring coords, filters:`, JSON.stringify(filters));
  }

  try {
    return NextResponse.json(await buildBrief(geom, filters));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "query failed" }, { status: 500 });
  }
}

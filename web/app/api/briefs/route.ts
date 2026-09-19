import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { buildBrief } from "@/lib/brief";
import { briefId, canonicalFilters, canonicalPolygon } from "@/lib/briefId";
import type { Filters } from "@/lib/filters";
import { STORED_REPORTS_LIMIT } from "@/lib/briefs";

/**
 * POST /api/briefs { geometry, filters? } -> { id, url, existing }
 *
 * Creates the permalink for a polygon, or returns the one that already
 * exists for it. The stored result is the brief as generated, with the data
 * version it came from; it is never silently regenerated, so a shared link
 * shows what the sharer saw.
 */
export async function POST(req: NextRequest) {
  let geometry: GeoJSON.Polygon | undefined;
  let filters: Filters = {};
  let title: string | undefined;
  try {
    const body = await req.json();
    geometry = body.geometry; filters = body.filters ?? {}; title = body.title;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates?.[0])) {
    return NextResponse.json({ error: "geometry must be a GeoJSON Polygon" }, { status: 400 });
  }

  const g = canonicalPolygon(geometry);
  const f = canonicalFilters(filters);
  const id = briefId(g, f);

  const existing = await pool.query(`SELECT id FROM briefs WHERE id = $1`, [id]);
  if (existing.rowCount) return NextResponse.json({ id, url: `/b/${id}`, existing: true });

  try {
    const result = await buildBrief(g, f, { reportsLimit: STORED_REPORTS_LIMIT });
    await pool.query(
      `INSERT INTO briefs (id, geom, filters, result, data_version, title)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(g), JSON.stringify(f), JSON.stringify(result), result.meta.dataVersion,
       typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : null],
    );
    return NextResponse.json({ id, url: `/b/${id}`, existing: false });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

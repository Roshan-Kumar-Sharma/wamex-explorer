import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * Viewport-bounded drillhole points for display.
 *
 * Phase 0 only. Phase 1 replaces this with PMTiles -- see
 * docs/03-concepts/03-vector-tiles-and-pmtiles.md.
 *
 * IMPORTANT: this endpoint SAMPLES. Never compute a statistic from what it
 * returns. Display is for looking; PostGIS is for truth. All numbers shown to
 * a user come from /api/brief, which counts the full set.
 */
const MAX_POINTS = 12000;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const bbox = (p.get("bbox") ?? "").split(",").map(Number);
  if (bbox.length !== 4 || bbox.some(Number.isNaN)) {
    return NextResponse.json({ error: "bbox=xmin,ymin,xmax,ymax required" }, { status: 400 });
  }

  const [xmin, ymin, xmax, ymax] = bbox;
  try {
    const total = await pool.query(
      `SELECT count(*)::int AS n FROM drillholes
        WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)`,
      [xmin, ymin, xmax, ymax],
    );
    const n = total.rows[0].n as number;

    // Deterministic thinning: keep every Nth hole by objectid. Stable across
    // pans, unlike random sampling, so points don't flicker in and out.
    const stride = Math.max(1, Math.ceil(n / MAX_POINTS));
    const { rows } = await pool.query(
      `SELECT jsonb_build_object(
                'type','FeatureCollection',
                'features', coalesce(jsonb_agg(f), '[]'::jsonb)
              ) AS fc
         FROM (
           SELECT jsonb_build_object(
                    'type','Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', jsonb_build_object(
                      'objectid', objectid, 'holeid', holeid, 'anumber', anumber,
                      'holetype', holetype_std, 'maxdepth', maxdepth,
                      'operator', operator)
                  ) AS f
             FROM drillholes
            WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)
              AND objectid % $5::int = 0
            LIMIT $6
         ) s`,
      [xmin, ymin, xmax, ymax, stride, MAX_POINTS],
    );

    const fc = rows[0].fc as { type: string; features: unknown[] };
    return NextResponse.json({
      ...fc,
      // `shown` is the actual number returned, not the cap -- integer striding
      // rarely lands exactly on MAX_POINTS, and reporting the cap would be a
      // (small) lie on a panel whose whole point is that its numbers are true.
      _meta: { total: n, shown: fc.features.length, sampled: stride > 1, stride },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "query failed" },
      { status: 500 },
    );
  }
}

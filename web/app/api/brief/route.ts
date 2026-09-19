import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ATTRIBUTION, EXPLORATION_HOLETYPES } from "@/lib/constants";
import type { QueryResult } from "pg";

/** Run thunks one after another. */
async function seq(fns: (() => Promise<QueryResult>)[]): Promise<QueryResult[]> {
  const out: QueryResult[] = [];
  for (const fn of fns) out.push(await fn());
  return out;
}

/**
 * The ground-history brief. Phase 0 / ADR-005: every number here comes from a
 * GROUP BY over structured data. There is no language model in this path,
 * which is why nothing here can hallucinate.
 *
 * Note COUNT(DISTINCT anumber) everywhere -- report_geometries carries ~5.2
 * polygons per report, so a plain COUNT(*) over-reports by 5x.
 */
export async function POST(req: NextRequest) {
  let geom: unknown;
  try {
    ({ geometry: geom } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!geom) {
    return NextResponse.json({ error: "missing `geometry`" }, { status: 400 });
  }

  const g = JSON.stringify(geom);
  if (process.env.NODE_ENV !== "production") {
    const ring = (geom as { coordinates?: number[][][] }).coordinates?.[0];
    console.log(`[brief] polygon with ${ring?.length ?? "?"} ring coords:`, JSON.stringify(ring?.map(c => c.map(x => +x.toFixed(4)))));
  }
  const client = await pool.connect();
  const t0 = Date.now();

  try {
    // Reuse one parsed geometry across every query in this request.
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE aoi ON COMMIT DROP AS
       SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geom`,
      [g],
    );
    await client.query(`CREATE INDEX ON aoi USING GIST (geom)`);

    // Sequential, not Promise.all: these all run on ONE client because they
    // share the `aoi` temp table, and a single pg client cannot execute
    // concurrent queries (deprecated in pg@8, removed in pg@9).
    const q = (text: string, params?: unknown[]) => client.query(text, params);
    const [
      summary, holeTypes, byDecade, activity, commodities,
      operators, reports, reportDecades, depth,
    ] = await seq([
      () => q(
        `SELECT
           (SELECT round((ST_Area(geom::geography) / 1e6)::numeric, 1)::float8 FROM aoi) AS area_km2,
           (SELECT count(DISTINCT rg.anumber)::int FROM report_geometries rg, aoi
             WHERE ST_Intersects(rg.geom, aoi.geom))                              AS report_count,
           (SELECT count(*)::int FROM drillholes d, aoi
             WHERE ST_Intersects(d.geom, aoi.geom))                          AS hole_count,
           (SELECT count(*)::int FROM drillholes d, aoi
             WHERE ST_Intersects(d.geom, aoi.geom)
               AND d.holetype_std = ANY($1))                                 AS exploration_hole_count`,
        [EXPLORATION_HOLETYPES],
      ),
      () => q(
        `SELECT d.holetype_std AS holetype, count(*)::int AS holes,
                round(sum(d.maxdepth))::int AS total_m,
                round(avg(d.maxdepth))::int AS avg_m,
                round(max(d.maxdepth))::int AS max_m
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom)
          GROUP BY 1 ORDER BY 2 DESC`,
      ),
      () => q(
        `SELECT (extract(year FROM d.period_from)::int / 10) * 10 AS decade,
                count(*)::int AS holes
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom) AND d.period_from IS NOT NULL
          GROUP BY 1 ORDER BY 1`,
      ),
      // The controlled vocabulary: 356 curated terms, 98.8% coverage.
      () => q(
        `SELECT k.term, count(DISTINCT rg.anumber)::int AS reports
           FROM report_geometries rg
           JOIN report_keywords rk ON rk.anumber = rg.anumber
           JOIN keywords k ON k.id = rk.keyword_id
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom)
          GROUP BY 1 ORDER BY 2 DESC LIMIT 30`,
      ),
      () => q(
        `SELECT c.name, count(DISTINCT rg.anumber)::int AS reports
           FROM report_geometries rg
           JOIN report_commodities rc ON rc.anumber = rg.anumber
           JOIN commodities c ON c.id = rc.commodity_id
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom)
          GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      ),
      () => q(
        `SELECT coalesce(r.operator, r.author_company) AS operator,
                count(DISTINCT r.anumber)::int AS reports,
                min(r.report_year)::int AS first_year,
                max(r.report_year)::int AS last_year
           FROM report_geometries rg
           JOIN reports r ON r.anumber = rg.anumber
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom)
            AND coalesce(r.operator, r.author_company) IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      ),
      () => q(
        `SELECT DISTINCT r.anumber, r.title, r.report_year, r.report_type,
                coalesce(r.operator, r.author_company) AS operator,
                r.abstract_short, r.url_report, r.url_abstract, r.has_digital_file
           FROM report_geometries rg
           JOIN reports r ON r.anumber = rg.anumber
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom)
          ORDER BY r.report_year DESC NULLS LAST, r.anumber DESC
          LIMIT 100`,
      ),
      // Decade coverage -- used to report gaps, per CLAUDE.md rule 4.
      () => q(
        `SELECT (r.report_year / 10) * 10 AS decade, count(DISTINCT r.anumber)::int AS reports
           FROM report_geometries rg
           JOIN reports r ON r.anumber = rg.anumber
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom) AND r.report_year IS NOT NULL
          GROUP BY 1 ORDER BY 1`,
      ),
      () => q(
        `SELECT min(r.report_year)::int AS first_year, max(r.report_year)::int AS last_year,
                max(r.date_released) AS latest_release
           FROM report_geometries rg
           JOIN reports r ON r.anumber = rg.anumber
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom)`,
      ),
    ]);

    await client.query("ROLLBACK");

    // Gaps: decades between first and last activity with zero reports.
    const covered = new Set(reportDecades.rows.map((r) => Number(r.decade)));
    const first = depth.rows[0]?.first_year;
    const last = depth.rows[0]?.last_year;
    const gaps: number[] = [];
    if (first && last) {
      for (let d = Math.floor(first / 10) * 10; d <= last; d += 10) {
        if (!covered.has(d)) gaps.push(d);
      }
    }

    return NextResponse.json({
      summary: summary.rows[0],
      period: depth.rows[0],
      holeTypes: holeTypes.rows,
      holesByDecade: byDecade.rows,
      reportsByDecade: reportDecades.rows,
      gapDecades: gaps,
      activity: activity.rows,
      commodities: commodities.rows,
      operators: operators.rows,
      reports: reports.rows,
      meta: {
        ms: Date.now() - t0,
        attribution: ATTRIBUTION,
        generated: "structured database query only — no language model",
        coverage:
          "Phase 0 dataset: 1°×1° box around Kalgoorlie (121–122°E, 30.25–31.25°S) only.",
      },
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "query failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

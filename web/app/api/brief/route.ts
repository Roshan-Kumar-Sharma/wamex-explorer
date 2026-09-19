import { NextRequest, NextResponse } from "next/server";
import type { QueryResult } from "pg";
import { pool } from "@/lib/db";
import { ATTRIBUTION, EXPLORATION_HOLETYPES } from "@/lib/constants";
import { type Filters, holeWhere, reportWhere, isEmpty } from "@/lib/filters";

/** Run thunks one after another. */
async function seq(fns: (() => Promise<QueryResult>)[]): Promise<QueryResult[]> {
  const out: QueryResult[] = [];
  for (const fn of fns) out.push(await fn());
  return out;
}

/**
 * The ground-history brief. ADR-005: every number here comes from a GROUP BY
 * over structured data. There is no language model in this path, which is
 * why nothing here can hallucinate.
 *
 * Note COUNT(DISTINCT anumber) everywhere -- report_geometries can carry more
 * than one row per report, and the raw source was 5x duplicated.
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

  const g = JSON.stringify(geom);
  if (process.env.NODE_ENV !== "production") {
    const ring = (geom as { coordinates?: number[][][] }).coordinates?.[0];
    console.log(`[brief] ${ring?.length ?? "?"} ring coords, filters:`, JSON.stringify(filters));
  }

  // Filter fragments. Each per-table query starts its params at $1. The
  // summary query combines both tables, so it lays out $1 = exploration-type
  // list, then the report params, then the hole params -- distinct ranges.
  const rw = reportWhere(filters, 1);
  const hw = holeWhere(filters, 1);
  const rwS = reportWhere(filters, 2);
  const hwS = holeWhere(filters, 2 + rwS.params.length);

  const client = await pool.connect();
  const t0 = Date.now();

  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE aoi ON COMMIT DROP AS
       SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geom`,
      [g],
    );
    await client.query(`CREATE INDEX ON aoi USING GIST (geom)`);

    const q = (text: string, params?: unknown[]) => client.query(text, params);
    const [
      summary, holeTypes, byDecade, activity, commodities,
      operators, reports, reportDecades, period,
    ] = await seq([
      () => q(
        `SELECT
           (SELECT round((ST_Area(geom::geography) / 1e6)::numeric, 1)::float8 FROM aoi) AS area_km2,
           (SELECT count(DISTINCT r.anumber)::int
              FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
             WHERE ST_Intersects(rg.geom, aoi.geom) ${rwS.sql}) AS report_count,
           (SELECT count(*)::int FROM drillholes d, aoi
             WHERE ST_Intersects(d.geom, aoi.geom) ${hwS.sql}) AS hole_count,
           (SELECT count(*)::int FROM drillholes d, aoi
             WHERE ST_Intersects(d.geom, aoi.geom) AND d.holetype_std = ANY($1) ${hwS.sql}) AS exploration_hole_count`,
        [EXPLORATION_HOLETYPES, ...rwS.params, ...hwS.params],
      ),
      () => q(
        `SELECT d.holetype_std AS holetype, count(*)::int AS holes,
                round(sum(d.maxdepth))::int AS total_m, round(avg(d.maxdepth))::int AS avg_m,
                round(max(d.maxdepth))::int AS max_m
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom) ${hw.sql}
          GROUP BY 1 ORDER BY 2 DESC`, hw.params),
      () => q(
        `SELECT (extract(year FROM d.period_from)::int / 10) * 10 AS decade, count(*)::int AS holes
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom) AND d.period_from IS NOT NULL ${hw.sql}
          GROUP BY 1 ORDER BY 1`, hw.params),
      // The controlled vocabulary: 1,161 curated terms, 98.8% coverage.
      () => q(
        `SELECT k.term, count(DISTINCT r.anumber)::int AS reports
           FROM report_geometries rg JOIN reports r USING (anumber)
           JOIN report_keywords rk ON rk.anumber = r.anumber
           JOIN keywords k ON k.id = rk.keyword_id
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom) ${rw.sql}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 30`, rw.params),
      () => q(
        `SELECT c.name, count(DISTINCT r.anumber)::int AS reports
           FROM report_geometries rg JOIN reports r USING (anumber)
           JOIN report_commodities rc ON rc.anumber = r.anumber
           JOIN commodities c ON c.id = rc.commodity_id
           CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom) ${rw.sql}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, rw.params),
      () => q(
        `SELECT coalesce(r.operator, r.author_company) AS operator,
                count(DISTINCT r.anumber)::int AS reports,
                min(r.report_year)::int AS first_year, max(r.report_year)::int AS last_year
           FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom)
            AND coalesce(r.operator, r.author_company) IS NOT NULL ${rw.sql}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 20`, rw.params),
      () => q(
        `SELECT DISTINCT r.anumber, r.title, r.report_year, r.report_type,
                coalesce(r.operator, r.author_company) AS operator,
                r.abstract_short, r.url_report, r.url_abstract, r.has_digital_file
           FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom) ${rw.sql}
          ORDER BY r.report_year DESC NULLS LAST, r.anumber DESC
          LIMIT 100`, rw.params),
      () => q(
        `SELECT (r.report_year / 10) * 10 AS decade, count(DISTINCT r.anumber)::int AS reports
           FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom) AND r.report_year IS NOT NULL ${rw.sql}
          GROUP BY 1 ORDER BY 1`, rw.params),
      () => q(
        `SELECT min(r.report_year)::int AS first_year, max(r.report_year)::int AS last_year,
                max(r.date_released) AS latest_release
           FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
          WHERE ST_Intersects(rg.geom, aoi.geom) ${rw.sql}`, rw.params),
    ]);

    await client.query("ROLLBACK");

    // Gaps: decades between first and last activity with zero reports.
    const covered = new Set(reportDecades.rows.map((r) => Number(r.decade)));
    const first = period.rows[0]?.first_year;
    const last = period.rows[0]?.last_year;
    const gaps: number[] = [];
    if (first && last) {
      for (let d = Math.floor(first / 10) * 10; d <= last; d += 10) if (!covered.has(d)) gaps.push(d);
    }

    return NextResponse.json({
      summary: summary.rows[0],
      period: period.rows[0],
      holeTypes: holeTypes.rows,
      holesByDecade: byDecade.rows,
      reportsByDecade: reportDecades.rows,
      gapDecades: gaps,
      activity: activity.rows,
      commodities: commodities.rows,
      operators: operators.rows,
      reports: reports.rows,
      filters,
      meta: {
        ms: Date.now() - t0,
        attribution: ATTRIBUTION,
        generated: "structured database query only — no language model",
        coverage: process.env.NEXT_PUBLIC_PMTILES_URL
          ? "All of Western Australia, open-file records only."
          : "Phase 0 dataset: 1°×1° box around Kalgoorlie (121–122°E, 30.25–31.25°S) only.",
        filtered: !isEmpty(filters),
      },
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    if (process.env.NODE_ENV !== "production") {
      console.error("[brief] rw:", rw.sql, rw.params, "\n[brief] hw:", hw.sql, hw.params,
                    "\n[brief] rwS:", rwS.sql, "\n[brief] hwS:", hwS.sql, hwS.params);
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "query failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

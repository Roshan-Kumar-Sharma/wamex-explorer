import type { PoolClient, QueryResult } from "pg";
import { pool } from "@/lib/db";
import { ATTRIBUTION, EXPLORATION_HOLETYPES, MAJOR_COMMODITIES } from "@/lib/constants";
import { type Filters, holeWhere, reportWhere, isEmpty } from "@/lib/filters";
import type { Brief } from "@/app/types";

/**
 * Run thunks one after another (ADR-013: one client, one temp table, no
 * concurrency). Records each query's wall time so a slow brief can be
 * attributed to a query, not guessed at.
 */
async function seq(fns: (() => Promise<QueryResult>)[], timings: number[]): Promise<QueryResult[]> {
  const out: QueryResult[] = [];
  for (const fn of fns) {
    const t = Date.now();
    out.push(await fn());
    timings.push(Date.now() - t);
  }
  return out;
}

/**
 * Hole types that are not "exploration" for coverage purposes. Water bores
 * and costeans say nothing about whether the rock was tested for minerals.
 */
const COVERAGE_EXCLUDED = ["WATER_BORE", "COSTEAN"];

/**
 * Regolith / bedrock split. Most of WA is covered by tens of metres of
 * weathered rock (regolith). RAB, aircore, auger and vacuum drilling are
 * cheap methods that usually stop at or in the regolith; RC and diamond
 * reach fresh bedrock. A hole >= 50 m is used here as the depth proxy. See
 * docs/03-concepts/05-coverage-and-what-was-never-tested.md.
 */
export const BEDROCK_METHODS = ["RC", "DD", "RCD"];
export const BEDROCK_DEPTH_M = 50;

/** Target number of coverage cells; the cell edge is derived from the area. */
const COVERAGE_CELLS = 300;

/**
 * Build the ground-history brief for a GeoJSON polygon.
 *
 * ADR-005: every number here comes from a GROUP BY over structured data.
 * There is no language model in this path, which is why nothing here can
 * hallucinate. Note COUNT(DISTINCT anumber) everywhere -- report_geometries
 * can carry more than one row per report, and the raw source was 5x
 * duplicated.
 *
 * `reportsLimit` caps the inventory. The interactive panel asks for 100; a
 * stored permalink asks for more, and the brief says when it was capped.
 */
export async function buildBrief(
  geometry: unknown,
  filters: Filters,
  opts: { reportsLimit?: number } = {},
): Promise<Brief> {
  const reportsLimit = Math.max(1, Math.min(2000, Math.floor(opts.reportsLimit ?? 100)));
  const g = JSON.stringify(geometry);

  // Filter fragments. Each per-table query starts its params at $1. The
  // summary query combines both tables, so it lays out $1 = exploration-type
  // list, then the report params, then the hole params -- distinct ranges.
  const rw = reportWhere(filters, 1);
  const hw = holeWhere(filters, 1);
  const rwS = reportWhere(filters, 2);
  const hwS = holeWhere(filters, 2 + rwS.params.length);
  // Coverage: $1 = excluded types, $2 = bedrock methods, $3 = bedrock depth, then hole params.
  const hwC = holeWhere(filters, 4);

  const client: PoolClient = await pool.connect();
  const t0 = Date.now();
  const timings: number[] = [];

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
      timeline, byMethodDecade, depthBuckets, deepest, /* CREATE cov */, coverage, cells,
      commodityByDecade, notRecordedCommodities, dataVersion,
    ] = await seq([
      () => q(
        `SELECT
           (SELECT round((ST_Area(geom::geography) / 1e6)::numeric, 1)::float8 FROM aoi) AS area_km2,
           (SELECT ST_AsGeoJSON(ST_Centroid(geom))::json FROM aoi) AS centroid,
           (SELECT json_build_array(ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)) FROM aoi) AS bbox,
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
      // Inventory. Coverage is computed only for the rows returned (the
      // LIMIT happens in `sel` first): ST_Intersection on 500 tenement
      // outlines is ~0.5 s, on 100 it is ~0.1 s. `coverage_pct` is the share
      // of the drawn area under this report's footprint; `footprint_km2` is
      // the report's whole footprint -- together they separate a regional
      // survey (100%, 160,000 km2) from a prospect at the edge (2%, 3 km2).
      () => q(
        `WITH sel AS (
           SELECT DISTINCT r.anumber, r.title, r.report_year, r.report_type,
                  coalesce(r.operator, r.author_company) AS operator,
                  r.abstract_short, r.abstract_full, r.url_report, r.url_abstract, r.has_digital_file
             FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
            WHERE ST_Intersects(rg.geom, aoi.geom) ${rw.sql}
            ORDER BY r.report_year DESC NULLS LAST, r.anumber DESC
            LIMIT ${reportsLimit}
         ), a AS (SELECT ST_Area(geom::geography) AS m2 FROM aoi)
         SELECT sel.*,
                least(100, round(100 * (SELECT sum(ST_Area(ST_Intersection(rg.geom, aoi.geom)::geography))
                                           FROM report_geometries rg, aoi WHERE rg.anumber = sel.anumber) / a.m2))::int AS coverage_pct,
                round(((SELECT sum(ST_Area(rg.geom::geography)) FROM report_geometries rg WHERE rg.anumber = sel.anumber) / 1e6)::numeric, 1)::float8 AS footprint_km2
           FROM sel, a
          ORDER BY sel.report_year DESC NULLS LAST, sel.anumber DESC`, rw.params),
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

      // ── Phase 2 ─────────────────────────────────────────────────────────
      // Exploration timeline: who worked this ground, when, targeting what.
      // Commodities are aggregated only for the operators shown -- doing it
      // for every operator was 12x slower on a 1-degree box.
      () => q(
        `WITH rep AS (
           SELECT DISTINCT r.anumber, coalesce(r.operator, r.author_company) AS operator, r.report_year
             FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
            WHERE ST_Intersects(rg.geom, aoi.geom) ${rw.sql}
         ), ops AS (
           SELECT operator, count(*)::int AS reports,
                  min(report_year)::int AS first_year, max(report_year)::int AS last_year
             FROM rep WHERE operator IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 40
         ), holes AS (
           SELECT d.operator, count(*)::int AS holes FROM drillholes d, aoi
            WHERE ST_Intersects(d.geom, aoi.geom) AND d.operator IN (SELECT operator FROM ops)
            GROUP BY 1
         )
         SELECT ops.operator, ops.reports, ops.first_year, ops.last_year, coalesce(holes.holes, 0) AS holes,
                (SELECT coalesce(array_agg(name ORDER BY n DESC), '{}')
                   FROM (SELECT c.name, count(*) n FROM rep
                           JOIN report_commodities rc ON rc.anumber = rep.anumber
                           JOIN commodities c ON c.id = rc.commodity_id
                          WHERE rep.operator = ops.operator GROUP BY 1 ORDER BY 2 DESC LIMIT 3) t) AS commodities
           FROM ops LEFT JOIN holes USING (operator)
          ORDER BY ops.first_year NULLS LAST, ops.reports DESC`, rw.params),
      () => q(
        `SELECT d.holetype_std AS holetype, (extract(year FROM d.period_from)::int / 10) * 10 AS decade,
                count(*)::int AS holes, round(sum(d.maxdepth))::int AS total_m
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom) AND d.period_from IS NOT NULL ${hw.sql}
          GROUP BY 1, 2 ORDER BY 2, 3 DESC`, hw.params),
      () => q(
        `SELECT CASE WHEN d.maxdepth < 25 THEN '0–25' WHEN d.maxdepth < 50 THEN '25–50'
                     WHEN d.maxdepth < 100 THEN '50–100' WHEN d.maxdepth < 200 THEN '100–200'
                     WHEN d.maxdepth < 500 THEN '200–500' ELSE '500+' END AS bucket,
                count(*)::int AS holes
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom) AND d.maxdepth IS NOT NULL ${hw.sql}
          GROUP BY 1 ORDER BY min(d.maxdepth)`, hw.params),
      () => q(
        `SELECT d.maxdepth::float8 AS maxdepth, d.holetype_std AS holetype, d.holeid, d.anumber,
                d.operator, extract(year FROM d.period_from)::int AS year
           FROM drillholes d, aoi
          WHERE ST_Intersects(d.geom, aoi.geom) AND d.maxdepth IS NOT NULL ${hw.sql}
          ORDER BY d.maxdepth DESC LIMIT 1`, hw.params),
      // Spatial coverage: square grid in the local MGA2020 zone (EPSG 7849-7852),
      // sized from the area. Each hole is snapped to a cell by integer
      // division -- one pass over the holes, no polygon joins.
      () => q(
        `CREATE TEMP TABLE cov ON COMMIT DROP AS
         WITH a AS (
           SELECT geom, ST_Area(geom::geography) AS m2,
                  7800 + floor((ST_X(ST_Centroid(geom)) + 180) / 6)::int + 1 AS srid
             FROM aoi
         ), p0 AS (
           SELECT ST_Transform(geom, srid) AS g, srid,
                  greatest(50, round(sqrt(m2 / ${COVERAGE_CELLS}) / 50) * 50)::int AS size
             FROM a
         ), p AS (
           -- The search box is a COLUMN, not an expression in the join: the
           -- planner then uses the GIST index (0.4 s) instead of transforming
           -- all 3.4M points (9 s).
           SELECT g, srid, size, ST_Transform(ST_Expand(g, size), 4326) AS box FROM p0
         ), grid AS (
           -- A cell belongs to the polygon if its centre is inside. Edge
           -- slivers would otherwise count as "undrilled" just for being small.
           SELECT floor(ST_XMin(sq.geom) / p.size)::int AS i, floor(ST_YMin(sq.geom) / p.size)::int AS j,
                  sq.geom, p.size, p.srid
             FROM p, ST_SquareGrid(p.size, p.g) sq WHERE ST_Contains(p.g, ST_Centroid(sq.geom))
         ), hits AS MATERIALIZED (
           -- Holes are counted over the whole cell, including any part outside
           -- the polygon, so an edge cell is judged on all of its ground.
           -- MATERIALIZED: otherwise the planner inlines this under a nested
           -- loop and re-runs the 250k-row aggregate once per grid cell (9 s).
           SELECT floor(ST_X(pt) / size)::int AS i, floor(ST_Y(pt) / size)::int AS j,
                  count(*)::int AS holes,
                  bool_or(maxdepth >= $3) AS deep,
                  bool_or(holetype_std = ANY($2)) AS bedrock
             FROM (SELECT ST_Transform(d.geom, p.srid) AS pt, p.size, d.maxdepth, d.holetype_std
                     FROM drillholes d, p
                    WHERE ST_Intersects(d.geom, p.box)
                      AND NOT (d.holetype_std = ANY($1)) ${hwC.sql}) x
            GROUP BY 1, 2
         )
         SELECT grid.i, grid.j, grid.size, grid.srid, grid.geom,
                coalesce(hits.holes, 0) AS holes, coalesce(hits.deep, false) AS deep,
                coalesce(hits.bedrock, false) AS bedrock
           FROM grid LEFT JOIN hits USING (i, j)`,
        [COVERAGE_EXCLUDED, BEDROCK_METHODS, BEDROCK_DEPTH_M, ...hwC.params]),
      () => q(
        `SELECT max(size)::int AS cell_m, max(srid)::int AS srid, count(*)::int AS cells,
                count(*) FILTER (WHERE holes = 0)::int AS undrilled,
                count(*) FILTER (WHERE NOT deep)::int AS no_deep_hole,
                count(*) FILTER (WHERE NOT bedrock)::int AS no_bedrock_method
           FROM cov`),
      () => q(
        `SELECT i, j, holes, deep, bedrock,
                ST_AsGeoJSON(ST_Transform(ST_Intersection(geom, ST_Transform((SELECT geom FROM aoi), srid)), 4326), 5)::json AS geom
           FROM cov ORDER BY j, i`),
      () => q(
        `WITH rep AS (
           SELECT DISTINCT r.anumber, r.report_year
             FROM report_geometries rg JOIN reports r USING (anumber) CROSS JOIN aoi
            WHERE ST_Intersects(rg.geom, aoi.geom) AND r.report_year IS NOT NULL ${rw.sql}
         ), top AS (
           SELECT c.id, c.name FROM report_commodities rc JOIN commodities c ON c.id = rc.commodity_id
            WHERE rc.anumber IN (SELECT anumber FROM rep) GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 6
         )
         SELECT top.name, (rep.report_year / 10) * 10 AS decade, count(*)::int AS reports
           FROM rep JOIN report_commodities rc ON rc.anumber = rep.anumber JOIN top ON top.id = rc.commodity_id
          GROUP BY 1, 2 ORDER BY 1, 2`, rw.params),
      // Major WA commodities with no report on this ground. A fact about the
      // record, not a statement about the rocks -- the UI must phrase it so.
      () => q(
        `SELECT c.name FROM commodities c
          WHERE c.name = ANY($1)
            AND NOT EXISTS (SELECT 1 FROM report_commodities rc JOIN report_geometries rg ON rg.anumber = rc.anumber, aoi
                             WHERE rc.commodity_id = c.id AND ST_Intersects(rg.geom, aoi.geom))
          ORDER BY 1`, [MAJOR_COMMODITIES]),
      () => q(`SELECT greatest((SELECT max(extract_date) FROM reports), (SELECT max(extract_date) FROM drillholes)) AS v`),
    ], timings);

    await client.query("ROLLBACK");

    // Gaps: decades between first and last activity with zero reports.
    const covered = new Set(reportDecades.rows.map((r) => Number(r.decade)));
    const first = period.rows[0]?.first_year;
    const last = period.rows[0]?.last_year;
    const gaps: number[] = [];
    if (first && last) {
      for (let d = Math.floor(first / 10) * 10; d <= last; d += 10) if (!covered.has(d)) gaps.push(d);
    }

    // Exploration methods never used here (from the fixed list, not inferred).
    const used = new Set(holeTypes.rows.map((h) => h.holetype as string));
    const methodsNotUsed = EXPLORATION_HOLETYPES.filter((t) => !used.has(t));

    const cov = coverage.rows[0];
    const dv: Date | null = dataVersion.rows[0]?.v ?? null;
    const s = summary.rows[0];

    return {
      summary: { area_km2: s.area_km2, report_count: s.report_count,
                 hole_count: s.hole_count, exploration_hole_count: s.exploration_hole_count },
      centroid: s.centroid?.coordinates ?? null,
      bbox: s.bbox ?? null,
      period: period.rows[0],
      holeTypes: holeTypes.rows,
      holesByDecade: byDecade.rows,
      reportsByDecade: reportDecades.rows,
      gapDecades: gaps,
      activity: activity.rows,
      commodities: commodities.rows,
      operators: operators.rows,
      reports: reports.rows,
      reportsCapped: reports.rows.length >= reportsLimit && s.report_count > reportsLimit,
      timeline: timeline.rows,
      drilling: {
        byMethodDecade: byMethodDecade.rows,
        depthBuckets: depthBuckets.rows,
        deepest: deepest.rows[0] ?? null,
      },
      coverage: {
        cell_m: cov?.cell_m ?? 0,
        srid: cov?.srid ?? 0,
        cells: cov?.cells ?? 0,
        undrilled: cov?.undrilled ?? 0,
        no_deep_hole: cov?.no_deep_hole ?? 0,
        no_bedrock_method: cov?.no_bedrock_method ?? 0,
        bedrock_depth_m: BEDROCK_DEPTH_M,
        bedrock_methods: BEDROCK_METHODS,
        excluded: COVERAGE_EXCLUDED,
        grid: {
          type: "FeatureCollection",
          features: cells.rows.map((c) => ({
            type: "Feature",
            geometry: c.geom,
            properties: { holes: c.holes, deep: c.deep, bedrock: c.bedrock },
          })),
        },
      },
      commodityByDecade: commodityByDecade.rows,
      notRecorded: {
        commodities: notRecordedCommodities.rows.map((r) => r.name as string),
        methods: methodsNotUsed,
      },
      filters,
      meta: {
        ms: Date.now() - t0,
        attribution: ATTRIBUTION,
        generated: "structured database query only — no language model",
        coverage: process.env.NEXT_PUBLIC_PMTILES_URL
          ? "All of Western Australia, open-file records only."
          : "Phase 0 dataset: 1°×1° box around Kalgoorlie (121–122°E, 30.25–31.25°S) only.",
        filtered: !isEmpty(filters),
        dataVersion: dv ? new Date(dv).toISOString().slice(0, 10) : null,
        generatedAt: new Date().toISOString(),
        ...(process.env.NODE_ENV !== "production" ? { timings } : {}),
      },
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (process.env.NODE_ENV !== "production") {
      console.error("[brief] rw:", rw.sql, rw.params, "\n[brief] hw:", hw.sql, hw.params,
                    "\n[brief] rwS:", rwS.sql, "\n[brief] hwS:", hwS.sql, hwS.params);
    }
    throw e;
  } finally {
    client.release();
  }
}

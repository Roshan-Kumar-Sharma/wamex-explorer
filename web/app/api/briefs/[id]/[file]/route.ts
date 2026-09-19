import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { pool } from "@/lib/db";
import { loadBrief } from "@/lib/briefs";
import { briefMarkdown, reportsCsv, timelineCsv, timelineMarkdown, type ExportMeta } from "@/lib/markdown";
import { ATTRIBUTION, LICENCE_URL } from "@/lib/constants";

/** Collars in a GeoJSON export. A 1-degree box holds 357k; this keeps the file under ~15 MB. */
const HOLES_CAP = 50_000;

const FILES = ["timeline.csv", "timeline.md", "reports.csv", "brief.md", "holes.geojson"] as const;
type File = (typeof FILES)[number];

/**
 * GET /api/briefs/:id/<file> -- the stored brief re-rendered for export.
 *
 *   timeline.csv / timeline.md   section G: previous exploration by operator, with A-numbers
 *   reports.csv                  the inventory, with abstracts and coverage
 *   brief.md                     the whole document as Markdown
 *   holes.geojson                collars inside the polygon (live query, WGS84, capped)
 *
 * Every file carries the CC BY attribution, the data version and the permalink.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  if (!(FILES as readonly string[]).includes(file)) {
    return NextResponse.json({ error: `unknown export; one of ${FILES.join(", ")}` }, { status: 404 });
  }
  const b = await loadBrief(id, { countView: false });
  if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const meta: ExportMeta = {
    title: b.title, createdAt: b.created_at,
    permalink: host ? `${proto}://${host}/b/${b.slug ?? b.id}` : `/b/${b.slug ?? b.id}`,
  };
  const stem = `wamex-${b.slug ?? b.id}`;
  const send = (body: string, type: string, name: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": `${type}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, max-age=300",
      },
    });

  switch (file as File) {
    case "timeline.csv": return send(timelineCsv(b.result, meta), "text/csv", `${stem}-previous-exploration.csv`);
    case "timeline.md":  return send(timelineMarkdown(b.result, meta), "text/markdown", `${stem}-previous-exploration.md`);
    case "reports.csv":  return send(reportsCsv(b.result, meta), "text/csv", `${stem}-reports.csv`);
    case "brief.md":     return send(briefMarkdown(b.result, meta), "text/markdown", `${stem}-brief.md`);
    case "holes.geojson": {
      const { rows } = await pool.query(
        `SELECT d.objectid::int AS objectid, d.holeid, d.anumber, d.holetype_std AS holetype, d.maxdepth::float8 AS maxdepth,
                d.operator, d.period_from::text AS period_from,
                ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat
           FROM drillholes d, briefs b
          WHERE b.id = $1 AND ST_Intersects(d.geom, b.geom)
          ORDER BY d.objectid LIMIT $2`, [b.id, HOLES_CAP + 1]);
      const capped = rows.length > HOLES_CAP;
      const fc = {
        type: "FeatureCollection",
        // Non-standard top-level members are permitted by RFC 7946 §6.1 and
        // ignored by readers; this is where the licence condition travels.
        attribution: `${ATTRIBUTION}, used under CC BY 4.0 (${LICENCE_URL})`,
        crs_note: "Coordinates are WGS84 longitude/latitude (EPSG:4326), as published by the department. Convert to MGA2020 for use in mining software.",
        source: meta.permalink,
        data_version: b.result.meta.dataVersion,
        count: Math.min(rows.length, HOLES_CAP),
        ...(capped ? { note: `Capped at ${HOLES_CAP.toLocaleString()} collars of ${b.result.summary.hole_count.toLocaleString()} in this area. Draw a smaller area for a complete file.` } : {}),
        features: rows.slice(0, HOLES_CAP).map((r) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.lon, r.lat] },
          properties: {
            objectid: r.objectid, holeid: r.holeid, anumber: r.anumber, holetype: r.holetype,
            maxdepth: r.maxdepth, operator: r.operator, period_from: r.period_from,
            report_url: r.anumber ? `https://wamex.dmp.wa.gov.au/Wamex/Search/ReportDetails?ANumber=${r.anumber}` : null,
          },
        })),
      };
      return send(JSON.stringify(fc), "application/geo+json", `${stem}-collars.geojson`);
    }
  }
}

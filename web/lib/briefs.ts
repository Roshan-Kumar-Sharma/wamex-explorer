import { pool } from "@/lib/db";
import { isBriefId } from "@/lib/briefId";
import type { Brief } from "@/app/types";
import type { Filters } from "@/lib/filters";

/** The inventory a stored brief carries. The document says when it was cut. */
export const STORED_REPORTS_LIMIT = 500;


export type StoredBrief = {
  id: string;
  slug: string | null;
  title: string | null;
  geometry: GeoJSON.Polygon;
  filters: Filters;
  result: Brief;
  data_version: string | null;
  created_at: string;
  views: number;
};

/**
 * Load a stored brief by id or slug. Full abstracts fetched since the brief
 * was stored are overlaid from `reports`, so a permalink improves as its
 * reports are read, without the stored numbers ever changing.
 */
export async function loadBrief(idOrSlug: string, opts: { countView?: boolean } = {}): Promise<StoredBrief | null> {
  const bySlug = !isBriefId(idOrSlug);
  const { rows } = await pool.query(
    `SELECT id, slug, title, ST_AsGeoJSON(geom)::json AS geometry, filters, result,
            data_version::text, created_at, views
       FROM briefs WHERE ${bySlug ? "slug" : "id"} = $1`, [idOrSlug]);
  const b = rows[0];
  if (!b) return null;

  const result = b.result as Brief;
  const ids = result.reports.map((r) => r.anumber);
  if (ids.length) {
    const fresh = await pool.query(
      `SELECT anumber, abstract_full FROM reports WHERE anumber = ANY($1) AND abstract_full IS NOT NULL`, [ids]);
    const map = new Map<number, string>(fresh.rows.map((r) => [r.anumber, r.abstract_full]));
    for (const r of result.reports) if (!r.abstract_full && map.has(r.anumber)) r.abstract_full = map.get(r.anumber)!;
  }

  if (opts.countView !== false) {
    pool.query(`UPDATE briefs SET views = views + 1, last_viewed_at = now() WHERE id = $1`, [b.id]).catch(() => {});
  }
  return { ...b, created_at: b.created_at instanceof Date ? b.created_at.toISOString() : String(b.created_at), result };
}

#!/usr/bin/env node
/**
 * Pre-generate briefs for ground every WA geologist knows (BUILD.md §7):
 * these are the permalinks that get checked against personal knowledge, and
 * the ones that travel. Runs against the dev server: node scripts/seed-briefs.mjs
 *
 * Boxes were verified against the register by dominant operator before use
 * (KCGM; Boddington Gold + Worsley Alumina; AngloGold Ashanti; WMC + BHP
 * Nickel West). Polygons are deliberately generous boxes, not lease outlines.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const DSN = process.env.WAMEX_DSN ?? "postgresql://wamex:wamex@localhost:54329/wamex";

const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

const SITES = [
  { slug: "super-pit",  title: "Kalgoorlie Super Pit (Fimiston), Golden Mile",   geometry: box(121.47, -30.81, 121.53, -30.75) },
  { slug: "boddington", title: "Boddington gold–copper and bauxite district",    geometry: box(116.32, -32.79, 116.42, -32.70) },
  { slug: "tropicana",  title: "Tropicana gold mine, Albany–Fraser Orogen",      geometry: box(124.52, -29.25, 124.62, -29.15) },
  { slug: "mt-keith",   title: "Mount Keith nickel, Agnew–Wiluna belt",          geometry: box(120.48, -27.29, 120.58, -27.19) },
];

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: DSN });

for (const s of SITES) {
  const r = await fetch(`${BASE}/api/briefs`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geometry: s.geometry, filters: {}, title: s.title }),
  });
  const j = await r.json();
  if (!r.ok) { console.error(s.slug, j); continue; }
  await pool.query(`UPDATE briefs SET slug = $2, title = coalesce(title, $3) WHERE id = $1`, [j.id, s.slug, s.title]);
  const { rows: [b] } = await pool.query(
    `SELECT (result->'summary'->>'report_count')::int r, (result->'summary'->>'hole_count')::int h,
            result->'period'->>'first_year' f, result->'period'->>'last_year' l FROM briefs WHERE id = $1`, [j.id]);
  console.log(`${s.slug.padEnd(11)} ${BASE}/b/${s.slug}  (${j.id}${j.existing ? ", existing" : ""})  ${b.r} reports, ${b.h} holes, ${b.f}–${b.l}`);
}
await pool.end();

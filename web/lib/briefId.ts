import { createHash } from "crypto";
import type { Filters } from "@/lib/filters";

/**
 * A brief's id is a hash of what it was built from, so the same ground with
 * the same filters always maps to the same permalink (CLAUDE.md: "cached by
 * polygon hash"). Coordinates are rounded to 6 dp (~10 cm) first so that
 * float noise from the draw tool does not produce two ids for one polygon.
 */
export function canonicalPolygon(g: GeoJSON.Polygon): GeoJSON.Polygon {
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const rings = g.coordinates.map((ring) => {
    const pts = ring.map(([x, y]) => [r6(x), r6(y)] as [number, number]);
    const [fx, fy] = pts[0];
    const [lx, ly] = pts[pts.length - 1];
    if (fx !== lx || fy !== ly) pts.push([fx, fy]);
    return pts;
  });
  return { type: "Polygon", coordinates: rings };
}

/** Filters with keys sorted and empties dropped, so `{}` and `{commodities: []}` hash the same. */
export function canonicalFilters(f: Filters | undefined): Filters {
  const out: Record<string, unknown> = {};
  if (!f) return out;
  for (const k of Object.keys(f).sort()) {
    const v = (f as Record<string, unknown>)[k];
    if (v == null) continue;
    if (Array.isArray(v)) { if (v.length) out[k] = [...v].sort(); }
    else out[k] = v;
  }
  return out as Filters;
}

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford base32, lowercase: no i/l/o/u

export function briefId(g: GeoJSON.Polygon, f: Filters | undefined): string {
  const payload = JSON.stringify({ g: canonicalPolygon(g), f: canonicalFilters(f) });
  const bytes = createHash("sha256").update(payload).digest();
  // 12 chars of base32 = 60 bits. Plenty for a table of briefs.
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5 && out.length < 12) { out += ALPHABET[(acc >> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= 12) break;
  }
  return out;
}

export function isBriefId(s: string): boolean {
  return /^[0-9a-hjkmnp-tv-z]{12}$/.test(s);
}

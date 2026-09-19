/** Facet filters for the brief. Every field optional; empty = no filter. */
export type Filters = {
  commodities?: string[];   // e.g. ["GOLD"]      — reports AND holes
  holetypes?: string[];     // e.g. ["RC","DD"]   — holes only
  operators?: string[];     // exact operator string — reports AND holes
  yearFrom?: number;        // inclusive — reports.report_year, holes.period_from
  yearTo?: number;
  depthMin?: number;        // metres — holes only
  depthMax?: number;
};

export function isEmpty(f: Filters | undefined): boolean {
  if (!f) return true;
  return !(
    f.commodities?.length || f.holetypes?.length || f.operators?.length ||
    f.yearFrom != null || f.yearTo != null || f.depthMin != null || f.depthMax != null
  );
}

export function describe(f: Filters): string[] {
  const out: string[] = [];
  if (f.commodities?.length) out.push(...f.commodities.map((c) => c.toLowerCase()));
  if (f.holetypes?.length) out.push(...f.holetypes);
  if (f.operators?.length) out.push(...f.operators);
  if (f.yearFrom != null || f.yearTo != null) out.push(`${f.yearFrom ?? "…"}–${f.yearTo ?? "…"}`);
  if (f.depthMin != null || f.depthMax != null) out.push(`${f.depthMin ?? 0}–${f.depthMax ?? "∞"} m`);
  return out;
}

/**
 * Build SQL fragments. Both return a WHERE-clause tail (starting with AND) and
 * the params they consume, offset from `startAt` ($1 is always the AOI).
 */
export function reportWhere(f: Filters, startAt: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  const add = (v: unknown) => { params.push(v); return `$${startAt + params.length - 1}`; };
  if (f.commodities?.length) {
    parts.push(`EXISTS (SELECT 1 FROM report_commodities rc JOIN commodities c ON c.id = rc.commodity_id
                        WHERE rc.anumber = r.anumber AND c.name = ANY(${add(f.commodities)}::text[]))`);
  }
  if (f.operators?.length) {
    parts.push(`coalesce(r.operator, r.author_company) = ANY(${add(f.operators)}::text[])`);
  }
  if (f.yearFrom != null) parts.push(`r.report_year >= ${add(f.yearFrom)}::int`);
  if (f.yearTo != null)   parts.push(`r.report_year <= ${add(f.yearTo)}::int`);
  return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
}

export function holeWhere(f: Filters, startAt: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  const add = (v: unknown) => { params.push(v); return `$${startAt + params.length - 1}`; };
  if (f.commodities?.length) {
    parts.push(`EXISTS (SELECT 1 FROM drillhole_commodities dc JOIN commodities c ON c.id = dc.commodity_id
                        WHERE dc.objectid = d.objectid AND c.name = ANY(${add(f.commodities)}::text[]))`);
  }
  if (f.holetypes?.length) parts.push(`d.holetype_std = ANY(${add(f.holetypes)}::text[])`);
  if (f.operators?.length) parts.push(`d.operator = ANY(${add(f.operators)}::text[])`);
  if (f.yearFrom != null) parts.push(`extract(year FROM d.period_from) >= ${add(f.yearFrom)}::int`);
  if (f.yearTo != null)   parts.push(`extract(year FROM d.period_from) <= ${add(f.yearTo)}::int`);
  if (f.depthMin != null) parts.push(`d.maxdepth >= ${add(f.depthMin)}::numeric`);
  if (f.depthMax != null) parts.push(`d.maxdepth <= ${add(f.depthMax)}::numeric`);
  return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
}

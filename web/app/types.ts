export type Brief = {
  summary: {
    area_km2: number; report_count: number;
    hole_count: number; exploration_hole_count: number;
  };
  period: { first_year: number | null; last_year: number | null; latest_release: string | null };
  holeTypes: { holetype: string; holes: number; total_m: number | null; avg_m: number | null; max_m: number | null }[];
  holesByDecade: { decade: number; holes: number }[];
  reportsByDecade: { decade: number; reports: number }[];
  gapDecades: number[];
  activity: { term: string; reports: number }[];
  commodities: { name: string; reports: number }[];
  operators: { operator: string; reports: number; first_year: number | null; last_year: number | null }[];
  reports: {
    anumber: number; title: string | null; report_year: number | null;
    report_type: string | null; operator: string | null; abstract_short: string | null;
    url_report: string | null; url_abstract: string | null; has_digital_file: boolean;
    abstract_full: string | null;
    /** Share of the drawn area under this report's footprint, 0-100. */
    coverage_pct: number | null;
    /** The report's whole footprint, km². Large = regional survey. */
    footprint_km2: number | null;
  }[];
  /** True when the inventory was cut at the request limit. */
  reportsCapped: boolean;

  // ── Phase 2 ────────────────────────────────────────────────────────────
  centroid: [number, number] | null;
  bbox: [number, number, number, number] | null;
  /** Who worked this ground, when, targeting what. Chronological by first report. */
  timeline: {
    operator: string; reports: number; first_year: number | null; last_year: number | null;
    holes: number; commodities: string[];
  }[];
  drilling: {
    byMethodDecade: { holetype: string; decade: number; holes: number; total_m: number | null }[];
    depthBuckets: { bucket: string; holes: number }[];
    deepest: {
      maxdepth: number; holetype: string; holeid: string | null; anumber: number | null;
      operator: string | null; year: number | null;
    } | null;
  };
  /**
   * Square-grid coverage in the local MGA2020 zone. `undrilled` cells have no
   * exploration hole at all; `no_deep_hole` none reaching `bedrock_depth_m`;
   * `no_bedrock_method` none by RC/diamond. Parameters are returned so the
   * document can state them.
   */
  coverage: {
    cell_m: number; srid: number; cells: number;
    undrilled: number; no_deep_hole: number; no_bedrock_method: number;
    bedrock_depth_m: number; bedrock_methods: string[]; excluded: string[];
    grid: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { holes: number; deep: boolean; bedrock: boolean }>;
  };
  commodityByDecade: { name: string; decade: number; reports: number }[];
  /**
   * This area's densities ranked against every `cell_km` square in WA that
   * contains at least one exploration hole (sql/021_baselines.sql). `rank`
   * is the percentile (0-100) of drilled cells at or below this value. Null
   * when filtered or when the baselines table has not been built.
   */
  baseline: {
    cell_km: number; n_cells: number;
    metrics: Record<"holes_per_km2" | "metres_per_km2" | "reports_per_km2",
      { value: number; median: number; p90: number; rank: number }>;
  } | null;
  /** From fixed lists: major commodities / exploration methods with zero records here. */
  notRecorded: { commodities: string[]; methods: string[] };
  filters: import("@/lib/filters").Filters;
  meta: {
    ms: number; attribution: string; generated: string; coverage: string; filtered: boolean;
    /** max(extract_date) across both source layers when this brief was built. */
    dataVersion: string | null;
    generatedAt: string;
    /** Dev only: wall ms per query, in lib/brief.ts order. */
    timings?: number[];
  };
};

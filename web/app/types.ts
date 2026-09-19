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
  }[];
  meta: { ms: number; attribution: string; generated: string; coverage: string };
};

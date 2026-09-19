/** Helpers shared by server and client components. No React here. */

import { HOLETYPE_LABELS } from "@/lib/constants";

/**
 * Does this report have more abstract behind the per-report page than the
 * bulk data carries? True when the 250-char field is cut, or empty: the
 * department's own written abstracts largely stop in 2014, but reports since
 * then usually carry a structured company-written abstract on the page.
 */
export const needsFetch = (r: { abstract_full: string | null; abstract_short: string | null }) =>
  !r.abstract_full && (r.abstract_short == null || r.abstract_short.length >= 245);

export function reportUrl(r: { anumber: number; url_report: string | null }) {
  return r.url_report ?? `https://wamex.dmp.wa.gov.au/Wamex/Search/ReportDetails?ANumber=${r.anumber}`;
}

/** A drill method label for running prose: "reverse circulation", "RC with diamond tail". */
export function methodName(code: string): string {
  const label = HOLETYPE_LABELS[code] ?? code;
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** MGA zone for a longitude: 6-degree zones numbered from 180W. WA is 49-52. */
export function mgaZone(lon: number): number { return Math.floor((lon + 180) / 6) + 1; }

/** "top 1%" / "top 25%" / "below the median" from a 0-100 percentile rank. */
export function rankPhrase(rank: number): string {
  if (rank >= 99) return "top 1%";
  if (rank >= 50) return `top ${100 - rank}%`;
  return `below the median (${rank}th percentile)`;
}

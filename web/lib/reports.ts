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

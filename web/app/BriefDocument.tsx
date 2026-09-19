import { ATTRIBUTION, HOLETYPE_LABELS, LICENCE_URL, SOURCE_NOTE } from "@/lib/constants";
import { describe } from "@/lib/filters";
import { mgaZone } from "@/lib/briefs";
import { methodName, needsFetch, reportUrl } from "@/lib/reports";
import ReportItem from "./ReportItem";
import AbstractsLoader from "./AbstractsLoader";
import type { Brief } from "./types";

const n = (x: number | null | undefined) => (x ?? 0).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const lower = (s: string) => s.toLowerCase();
const EXCLUDED_FROM_DRILLING = ["WATER_BORE", "COSTEAN", "UNKNOWN", "OTHER"];

function H2({ num, children, note }: { num: number; children: React.ReactNode; note?: string }) {
  return (
    <div className="mt-10 mb-3 break-after-avoid">
      <h2 className="text-[15px] font-semibold tracking-tight text-stone-900">
        <span className="mr-2 tabular-nums text-stone-400">{num}.</span>{children}
      </h2>
      {note && <p className="mt-0.5 text-[12px] text-stone-500">{note}</p>}
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2.5">
      <div className="text-xl font-semibold tabular-nums text-stone-900">{value}</div>
      <div className="text-[11px] text-stone-500">{label}</div>
    </div>
  );
}

/** A small decade × category heat table. Cells are counts; intensity is relative to the table max. */
function HeatTable({ rows, cols, get, rowLabel }: {
  rows: string[]; cols: number[]; get: (r: string, c: number) => number; rowLabel?: (r: string) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => get(r, c))));
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wide text-stone-400">
          <th className="pb-1 font-medium" />
          {cols.map((c) => <th key={c} className="pb-1 text-right font-medium">{String(c).slice(2)}s</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r} className="border-t border-stone-100">
            <td className="py-1 pr-2 text-stone-700">{rowLabel ? rowLabel(r) : r}</td>
            {cols.map((c) => {
              const v = get(r, c);
              return (
                <td key={c} className="py-0.5 text-right">
                  <span
                    className="inline-block min-w-[2.6em] rounded px-1 py-0.5 text-right"
                    style={{ background: v ? `rgba(180, 83, 9, ${0.08 + 0.55 * (v / max)})` : "transparent",
                             color: v / max > 0.55 ? "white" : undefined }}
                  >
                    {v ? n(v) : <span className="text-stone-300">·</span>}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Props = {
  brief: Brief;
  id?: string;
  title?: string | null;
  createdAt?: string | null;
  /** Absolute or root-relative permalink to print in the document. */
  permalink?: string;
};

/**
 * The ground-history brief as a document. Everything on this page is either
 * a number from a GROUP BY or a string copied verbatim from the record, with
 * its A-number beside it. There is no generated prose (ADR-005). The few
 * sentences here are templates filled with those numbers.
 */
export default function BriefDocument({ brief, id, title, createdAt, permalink }: Props) {
  const s = brief.summary;
  const p = brief.period;
  const cov = brief.coverage;
  const [lon, lat] = brief.centroid ?? [NaN, NaN];
  const zone = Number.isFinite(lon) ? mgaZone(lon) : null;

  const exploration = brief.holeTypes.filter((h) => !EXCLUDED_FROM_DRILLING.includes(h.holetype));
  const excluded = brief.holeTypes.filter((h) => EXCLUDED_FROM_DRILLING.includes(h.holetype));
  const totalM = exploration.reduce((a, h) => a + (h.total_m ?? 0), 0);
  const operatorsCount = new Set(brief.timeline.map((t) => t.operator)).size;

  const decades = [...new Set([
    ...brief.reportsByDecade.map((d) => d.decade),
    ...brief.drilling.byMethodDecade.map((d) => d.decade),
  ])].sort((a, b) => a - b);
  const methodRows = [...new Set(brief.drilling.byMethodDecade.map((d) => d.holetype))]
    .filter((h) => !EXCLUDED_FROM_DRILLING.includes(h));
  const methodGet = (h: string, d: number) =>
    brief.drilling.byMethodDecade.find((x) => x.holetype === h && x.decade === d)?.holes ?? 0;
  const commodityRows = [...new Set(brief.commodityByDecade.map((c) => c.name))];
  const commodityGet = (c: string, d: number) =>
    brief.commodityByDecade.find((x) => x.name === c && x.decade === d)?.reports ?? 0;
  const commodityDecades = [...new Set(brief.commodityByDecade.map((c) => c.decade))].sort((a, b) => a - b);

  const depthMax = Math.max(1, ...brief.drilling.depthBuckets.map((b) => b.holes));
  const depthTotal = brief.drilling.depthBuckets.reduce((a, b) => a + b.holes, 0);
  const shallow = brief.drilling.depthBuckets.filter((b) => b.bucket === "0–25" || b.bucket === "25–50")
    .reduce((a, b) => a + b.holes, 0);

  const fetchIds = brief.reports.filter(needsFetch).map((r) => r.anumber);
  const noAbstract = brief.reports.filter((r) => !r.abstract_short && !r.abstract_full).length;
  const filterChips = describe(brief.filters);

  return (
    <article className="doc mx-auto max-w-[760px] px-6 py-8 text-stone-800 print:max-w-none print:px-0">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-stone-200 pb-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">Ground history brief</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          {title ?? `${s.area_km2} km² of ground${Number.isFinite(lat) ? ` near ${Math.abs(lat).toFixed(2)}°S ${lon.toFixed(2)}°E` : ""}`}
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-stone-600">
          {s.area_km2} km²
          {Number.isFinite(lat) && <> · centre {Math.abs(lat).toFixed(4)}°S {lon.toFixed(4)}°E · MGA zone {zone}</>}
          {p.first_year && <> · open-file record {p.first_year}–{p.last_year}</>}
        </p>
        {filterChips.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="uppercase tracking-wide text-stone-400">Filtered to</span>
            {filterChips.map((c) => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{c}</span>)}
          </p>
        )}
        <p className="mt-2 text-[11px] text-stone-400">
          {createdAt && <>Generated {createdAt.slice(0, 10)}</>}
          {brief.meta.dataVersion && <> from department data extracted {brief.meta.dataVersion}</>}
          {permalink && <> · permalink <a href={permalink} className="text-stone-500 underline">{permalink}</a></>}
        </p>
        {id && (
          <div className="mt-3 flex gap-2 text-[12px] print:hidden">
            <a href={`/?b=${id}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-800 hover:bg-stone-50">
              Open on the map
            </a>
            <a href={`/api/briefs/${id}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-800 hover:bg-stone-50">
              JSON
            </a>
          </div>
        )}
      </header>

      {/* ── 1. At a glance ─────────────────────────────────────────────── */}
      <H2 num={1}>At a glance</H2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={n(s.report_count)} label="open-file reports" />
        <Stat value={n(s.hole_count)} label="drillhole collars" />
        <Stat value={totalM > 0 ? `${n(Math.round(totalM / 1000))} km` : "—"} label="exploration drilling" />
        <Stat value={p.first_year ? `${p.first_year}–${p.last_year}` : "—"} label="years on record" />
      </div>
      {s.report_count > 0 ? (
        <p className="mt-4 text-[13.5px] leading-relaxed">
          Between <b>{p.first_year}</b> and <b>{p.last_year}</b>, <b>{n(s.report_count)}</b> open-file
          exploration reports were lodged over ground intersecting this area
          {operatorsCount > 0 && <>, by at least <b>{operatorsCount}</b> named operator{operatorsCount === 1 ? "" : "s"}</>}.
          The drillhole register records <b>{n(s.hole_count)}</b> collars here, of which{" "}
          <b>{n(s.exploration_hole_count)}</b> are exploration holes
          {totalM > 0 && <> totalling <b>{n(totalM)} m</b></>}.
          {brief.gapDecades.length > 0 && (
            <> No report is dated to the <b>{brief.gapDecades.map((d) => `${d}s`).join(", ")}</b>.</>
          )}
        </p>
      ) : (
        <p className="mt-4 text-[13.5px] leading-relaxed">
          <b>No open-file exploration report</b> intersects this area
          {s.hole_count > 0 && <>, although the drillhole register records <b>{n(s.hole_count)}</b> collars here</>}.
          This says nothing about the ground itself — see section 5 on what an absence can and cannot mean.
        </p>
      )}

      {/* ── 2. Exploration timeline ────────────────────────────────────── */}
      <H2 num={2} note="Who held reports over this ground, when, and what they were looking for. Commodities are the top three each operator listed as targets; holes are collars attributed to that operator name in the register.">
        Exploration timeline
      </H2>
      {brief.timeline.length > 0 ? (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-stone-400 whitespace-nowrap">
              <th className="pb-1 pr-2 font-medium">Years</th>
              <th className="pb-1 pr-2 font-medium">Operator</th>
              <th className="pb-1 pl-2 text-right font-medium">Reports</th>
              <th className="pb-1 pl-2 text-right font-medium">Holes</th>
              <th className="pb-1 pl-3 font-medium">Targeting</th>
            </tr>
          </thead>
          <tbody>
            {brief.timeline.map((t) => (
              <tr key={t.operator} className="border-t border-stone-100 align-top">
                <td className="py-1.5 whitespace-nowrap tabular-nums text-stone-600">
                  {t.first_year ?? "—"}{t.last_year && t.last_year !== t.first_year && `–${t.last_year}`}
                </td>
                <td className="py-1.5 pr-2 text-stone-800">{t.operator}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{n(t.reports)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-stone-600">{t.holes ? n(t.holes) : <span className="text-stone-300">—</span>}</td>
                <td className="py-1.5 pl-3 text-stone-600">{t.commodities.map(lower).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[12.5px] text-stone-500">No operator is named on any report intersecting this area.</p>
      )}
      {brief.reportsByDecade.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wide text-stone-400">Reports lodged by decade</div>
          <div className="mt-1.5 flex items-end gap-1" style={{ height: 64 }}>
            {brief.reportsByDecade.map((d) => {
              const max = Math.max(1, ...brief.reportsByDecade.map((x) => x.reports));
              return (
                <div key={d.decade} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.reports} reports in the ${d.decade}s`}>
                  <span className="text-[9px] tabular-nums text-stone-500">{n(d.reports)}</span>
                  <div className="w-full rounded-sm bg-amber-700/60" style={{ height: `${Math.max(2, (d.reports / max) * 40)}px` }} />
                  <span className="text-[9px] text-stone-400">{String(d.decade).slice(2)}s</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Drilling summary ────────────────────────────────────────── */}
      <H2 num={3} note="From the drillhole register: collars only, no assays or downhole geology. Water bores, costeans and unrecorded types are excluded from exploration totals and listed separately.">
        Drilling summary
      </H2>
      {exploration.length > 0 ? (
        <>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-stone-400">
                <th className="pb-1 font-medium">Method</th>
                <th className="pb-1 text-right font-medium">Holes</th>
                <th className="pb-1 text-right font-medium">Metres</th>
                <th className="pb-1 text-right font-medium">Avg</th>
                <th className="pb-1 text-right font-medium">Deepest</th>
              </tr>
            </thead>
            <tbody>
              {exploration.map((h) => (
                <tr key={h.holetype} className="border-t border-stone-100 tabular-nums">
                  <td className="py-1 text-stone-800">{HOLETYPE_LABELS[h.holetype] ?? h.holetype} <span className="text-stone-400">{h.holetype}</span></td>
                  <td className="py-1 text-right">{n(h.holes)}</td>
                  <td className="py-1 text-right text-stone-600">{n(h.total_m)}</td>
                  <td className="py-1 text-right text-stone-500">{h.avg_m ?? "—"} m</td>
                  <td className="py-1 text-right text-stone-500">{h.max_m ?? "—"} m</td>
                </tr>
              ))}
              <tr className="border-t border-stone-300 font-medium tabular-nums">
                <td className="py-1">Exploration total</td>
                <td className="py-1 text-right">{n(exploration.reduce((a, h) => a + h.holes, 0))}</td>
                <td className="py-1 text-right">{n(totalM)}</td>
                <td /><td />
              </tr>
            </tbody>
          </table>
          {excluded.length > 0 && (
            <p className="mt-1.5 text-[11px] text-stone-500">
              Not counted above: {excluded.map((h) => `${HOLETYPE_LABELS[h.holetype] ?? h.holetype} (${n(h.holes)})`).join(", ")}.
            </p>
          )}

          {methodRows.length > 0 && decades.length > 0 && (
            <div className="mt-5">
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-400">Holes by method and decade drilled</div>
              <HeatTable rows={methodRows} cols={decades} get={methodGet} rowLabel={(h) => HOLETYPE_LABELS[h] ?? h} />
              <p className="mt-1 text-[11px] text-stone-400">Holes without a recorded drilling date are not shown here.</p>
            </div>
          )}

          {brief.drilling.depthBuckets.length > 0 && (
            <div className="mt-5">
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-400">Depth distribution (all methods, {n(depthTotal)} holes with a recorded depth)</div>
              <div className="space-y-1">
                {brief.drilling.depthBuckets.map((b) => (
                  <div key={b.bucket} className="flex items-center gap-2 text-[12px] tabular-nums">
                    <span className="w-16 text-right text-stone-600">{b.bucket} m</span>
                    <div className="h-2.5 flex-1 rounded-sm bg-stone-100">
                      <div className="h-2.5 rounded-sm bg-amber-700/60" style={{ width: `${Math.max(1, (b.holes / depthMax) * 100)}%` }} />
                    </div>
                    <span className="w-16 text-stone-500">{n(b.holes)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed">
                <b>{pct(shallow, depthTotal)}%</b> of holes with a recorded depth stop within 50 m.
                <span className="text-stone-500"> (General note, not from this record: across much of WA the top tens of metres are weathered
                regolith, so shallow holes often do not test fresh rock. Actual weathering depth here is not in the register.)</span>
                {brief.drilling.deepest && (
                  <>
                    {" "}The deepest recorded hole is <b>{n(Math.round(brief.drilling.deepest.maxdepth))} m</b>
                    {brief.drilling.deepest.holeid && <> ({brief.drilling.deepest.holeid}</>}
                    {brief.drilling.deepest.holetype && <>, {methodName(brief.drilling.deepest.holetype)}</>}
                    {brief.drilling.deepest.year && <>, {brief.drilling.deepest.year}</>}
                    {brief.drilling.deepest.holeid && ")"}
                    {brief.drilling.deepest.anumber && (
                      <>, reported in{" "}
                        <a href={reportUrl({ anumber: brief.drilling.deepest.anumber, url_report: null })} target="_blank" rel="noreferrer" className="text-amber-800 hover:underline">
                          A{brief.drilling.deepest.anumber}
                        </a>
                      </>
                    )}.
                  </>
                )}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-stone-500">No exploration drillhole is recorded in this area.</p>
      )}

      {/* ── 4. Commodity focus over time ───────────────────────────────── */}
      <H2 num={4} note="Reports per decade naming each commodity as a target. A report can name several. Top six commodities by report count.">
        Commodity focus over time
      </H2>
      {commodityRows.length > 0 ? (
        <HeatTable rows={commodityRows} cols={commodityDecades} get={commodityGet} rowLabel={lower} />
      ) : (
        <p className="text-[12.5px] text-stone-500">No report here names a target commodity.</p>
      )}
      {brief.activity.length > 0 && (
        <div className="mt-5">
          <div className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-400">Recorded activity — department controlled vocabulary, curated not inferred</div>
          <p className="text-[12.5px] leading-relaxed text-stone-700">
            {brief.activity.slice(0, 18).map((a, i) => (
              <span key={a.term}>{i > 0 && " · "}{a.term} <span className="tabular-nums text-stone-400">{n(a.reports)}</span></span>
            ))}
          </p>
        </div>
      )}

      {/* ── 5. What was never tested ───────────────────────────────────── */}
      <H2 num={5} note="Gaps in the record, stated as such. An absence here is an absence from the open-file record, not a statement about the rocks.">
        What the record does not show
      </H2>
      <ul className="space-y-2.5 text-[13px] leading-relaxed">
        {cov.cells > 0 ? (
          <li>
            <b>Ground with no drilling.</b> On a {n(cov.cell_m)} m grid (MGA zone {cov.srid - 7800}, {n(cov.cells)} cells),{" "}
            <b>{n(cov.undrilled)} cells ({pct(cov.undrilled, cov.cells)}%)</b> contain no exploration drillhole at all;{" "}
            <b>{n(cov.no_deep_hole)} ({pct(cov.no_deep_hole, cov.cells)}%)</b> have none reaching {cov.bedrock_depth_m} m; and{" "}
            <b>{n(cov.no_bedrock_method)} ({pct(cov.no_bedrock_method, cov.cells)}%)</b> have never been drilled by
            {" "}{cov.bedrock_methods.map(methodName).join(", ")} — the methods that usually reach fresh rock.
            <span className="text-stone-500"> Water bores and costeans are not counted as drilling. A cell counts as tested if any hole falls anywhere in it.</span>
          </li>
        ) : (
          <li><b>Ground with no drilling.</b> Area too small for a coverage grid (minimum cell 50 m).</li>
        )}
        {brief.gapDecades.length > 0 ? (
          <li><b>Decades with no report.</b> Nothing on open file is dated to the {brief.gapDecades.map((d) => `${d}s`).join(", ")}, although activity is recorded before and after.</li>
        ) : p.first_year ? (
          <li><b>Decades with no report.</b> None — every decade from the {Math.floor(p.first_year / 10) * 10}s to the {Math.floor((p.last_year ?? p.first_year) / 10) * 10}s has at least one report.</li>
        ) : null}
        {brief.notRecorded.methods.length > 0 && (
          <li><b>Methods never used here.</b> No {brief.notRecorded.methods.map(methodName).join(", ")} hole is recorded.</li>
        )}
        {brief.notRecorded.commodities.length > 0 && (
          <li>
            <b>Commodities no report lists as a target.</b> {brief.notRecorded.commodities.map(lower).join(", ")}.
            <span className="text-stone-500"> From a fixed list of {23} commodities commonly explored for in WA; an unlisted commodity may still have been assayed for incidentally.</span>
          </li>
        )}
        {noAbstract > 0 && (
          <li>
            <b>Reports without an abstract.</b> {n(noAbstract)} of the {n(brief.reports.length)} reports listed below have no abstract in the
            department&apos;s bulk data. The department&apos;s own written abstracts largely stop in 2014; reports since then usually
            carry a company-written one on the per-report page, which section 6 can fetch.
          </li>
        )}
        <li>
          <b>Confidential work.</b> Under the Mining Act, annual reports stay confidential for <b>five years</b> (or until three
          months after the tenement is surrendered, whichever is earlier); surrender reports are released three months after
          surrender. Work from the last five years on live ground is therefore mostly absent from this record. Latest
          open-file release intersecting this area: <b>{p.latest_release?.slice(0, 10) ?? "—"}</b>.
        </li>
        <li><b>Assays and geology.</b> The drillhole register holds collar positions, depth, method and date. No assay, lithology or downhole survey is included; those live in the reports themselves.</li>
        {brief.reportsCapped && (
          <li><b>Inventory cut.</b> Section 6 lists the {n(brief.reports.length)} most recent of {n(s.report_count)} reports. The counts above use all of them.</li>
        )}
      </ul>

      {/* ── 6. Report inventory ────────────────────────────────────────── */}
      <H2 num={6} note={`Every A-number intersecting this area${brief.reportsCapped ? ` (most recent ${n(brief.reports.length)} of ${n(s.report_count)})` : ""}, newest first, linked to the department's record. Abstracts are the department's own text, verbatim.`}>
        Report inventory
      </H2>
      {brief.reports.length > 0 && (
        <p className="mb-2 text-[11.5px] text-stone-500">
          {fetchIds.length > 0
            ? <>{fetchIds.length} abstract{fetchIds.length === 1 ? " is" : "s are"} cut at 250 characters or missing in the bulk data. <AbstractsLoader anumbers={fetchIds} /></>
            : <>All abstracts shown in full.</>}
        </p>
      )}
      <ul>
        {brief.reports.map((r) => <ReportItem key={r.anumber} r={r} />)}
      </ul>
      {brief.reports.length === 0 && <p className="text-[12.5px] text-stone-500">No reports.</p>}

      {/* ── Provenance ─────────────────────────────────────────────────── */}
      <footer className="mt-12 border-t border-stone-200 pt-4 text-[11px] leading-relaxed text-stone-500">
        <p className="font-medium text-stone-600">How this brief was made</p>
        <p className="mt-1">
          Every figure is the result of a database query over the department&apos;s open-file records — a spatial
          join of this polygon against the drillhole register and WAMEX report footprints, then counts, sums and
          groupings. No language model was involved and no sentence here was generated; the prose is a fixed
          template filled with those numbers. Report abstracts are reproduced verbatim from the department.
        </p>
        <p className="mt-2">{SOURCE_NOTE}{brief.meta.dataVersion && <> Data extracted by the department on {brief.meta.dataVersion}.</>}</p>
        <p className="mt-2">
          {ATTRIBUTION}, used under <a href={LICENCE_URL} target="_blank" rel="noreferrer" className="underline">CC BY 4.0</a>.
          This document is a summary of public records and makes no statement about prospectivity or value.
          Verify against the primary sources — each A-number above links to the department&apos;s record — before relying on it.
        </p>
      </footer>
    </article>
  );
}

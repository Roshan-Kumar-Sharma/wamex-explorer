"use client";

import { ATTRIBUTION, HOLETYPE_LABELS, LICENCE_URL } from "@/lib/constants";
import type { Brief } from "./types";

const n = (x: number | null | undefined) => (x ?? 0).toLocaleString();

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-stone-100">
      <div
        className="h-1.5 rounded-full bg-amber-700/70"
        style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
      />
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-stone-200 px-5 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{title}</h3>
      {note && <p className="mt-0.5 text-[11px] text-stone-400">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function BriefPanel({ brief, loading }: { brief: Brief | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Querying…
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="flex h-full flex-col justify-center px-6 text-sm text-stone-600">
        <h2 className="text-base font-semibold text-stone-900">Ground history brief</h2>
        <p className="mt-2 leading-relaxed">
          Draw a polygon or a box on the map. You&apos;ll get every drillhole and
          exploration report recorded on that ground.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-stone-500">
          Every figure comes from a database query over the official record. No
          language model is involved, so nothing here can be invented.
        </p>
      </div>
    );
  }

  const s = brief.summary;
  const maxAct = Math.max(1, ...brief.activity.map((a) => a.reports));
  const maxDec = Math.max(1, ...brief.reportsByDecade.map((d) => d.reports));
  const explorationTypes = brief.holeTypes.filter(
    (h) => !["WATER_BORE", "COSTEAN", "UNKNOWN", "OTHER"].includes(h.holetype),
  );
  const excluded = brief.holeTypes.filter((h) =>
    ["WATER_BORE", "COSTEAN", "UNKNOWN", "OTHER"].includes(h.holetype),
  );
  const totalM = explorationTypes.reduce((a, h) => a + (h.total_m ?? 0), 0);

  return (
    <div className="doc h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-stone-50 px-5 py-4">
        <h2 className="text-base font-semibold text-stone-900">Ground history</h2>
        <p className="mt-0.5 text-[11px] text-stone-500">
          {s.area_km2} km² · queried in {brief.meta.ms} ms
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-stone-200 bg-white p-2.5">
            <div className="text-xl font-semibold text-stone-900">{n(s.report_count)}</div>
            <div className="text-[11px] text-stone-500">exploration reports</div>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-2.5">
            <div className="text-xl font-semibold text-stone-900">{n(s.hole_count)}</div>
            <div className="text-[11px] text-stone-500">drillholes</div>
          </div>
        </div>

        {brief.period.first_year && (
          <p className="mt-3 text-[12px] leading-relaxed text-stone-600">
            Recorded activity spans <b>{brief.period.first_year}–{brief.period.last_year}</b>
            {totalM > 0 && <> · <b>{n(totalM)} m</b> of exploration drilling</>}.
          </p>
        )}
      </div>

      {/* Missing / gaps -- CLAUDE.md rule 4: gaps are more valuable than filler */}
      <Section title="What is missing" note="Gaps are stated, not glossed over.">
        <ul className="space-y-1.5 text-[12px] leading-relaxed text-stone-700">
          {brief.gapDecades.length > 0 ? (
            <li>
              <b>No reports</b> for{" "}
              {brief.gapDecades.map((d) => `${d}s`).join(", ")}.
            </li>
          ) : (
            <li>Every decade between {brief.period.first_year} and {brief.period.last_year} has at least one report.</li>
          )}
          <li>
            Recent exploration may be <b>confidential</b> and therefore absent. Latest
            open-file release here: <b>{brief.period.latest_release?.slice(0, 10) ?? "—"}</b>.
          </li>
          <li>
            Drillhole records are <b>collars only</b> — no assays, no downhole geology.
          </li>
          {excluded.length > 0 && (
            <li className="text-stone-500">
              Excluded from drilling totals:{" "}
              {excluded.map((h) => `${HOLETYPE_LABELS[h.holetype] ?? h.holetype} (${n(h.holes)})`).join(", ")}.
            </li>
          )}
        </ul>
      </Section>

      {/* Drilling */}
      {explorationTypes.length > 0 && (
        <Section title="Drilling" note="Counts and metres from the drillhole register.">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-stone-400">
                <th className="pb-1 font-medium">Method</th>
                <th className="pb-1 text-right font-medium">Holes</th>
                <th className="pb-1 text-right font-medium">Metres</th>
                <th className="pb-1 text-right font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {explorationTypes.map((h) => (
                <tr key={h.holetype} className="border-t border-stone-100">
                  <td className="py-1 text-stone-700">{HOLETYPE_LABELS[h.holetype] ?? h.holetype}</td>
                  <td className="py-1 text-right text-stone-900">{n(h.holes)}</td>
                  <td className="py-1 text-right text-stone-600">{n(h.total_m)}</td>
                  <td className="py-1 text-right text-stone-400">{n(h.max_m)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Activity from controlled vocabulary */}
      {brief.activity.length > 0 && (
        <Section
          title="Recorded activity"
          note="From the department's controlled vocabulary — curated, not inferred."
        >
          <div className="space-y-1.5">
            {brief.activity.slice(0, 14).map((a) => (
              <div key={a.term}>
                <div className="flex justify-between text-[12px]">
                  <span className="text-stone-700">{a.term}</span>
                  <span className="text-stone-500">{n(a.reports)}</span>
                </div>
                <Bar value={a.reports} max={maxAct} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Timeline */}
      {brief.reportsByDecade.length > 0 && (
        <Section title="Reports by decade">
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {brief.reportsByDecade.map((d) => (
              <div key={d.decade} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-sm bg-amber-700/70" style={{ height: `${(d.reports / maxDec) * 62}px` }} title={`${d.reports}`} />
                <span className="text-[9px] text-stone-400">{String(d.decade).slice(2)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Commodities */}
      {brief.commodities.length > 0 && (
        <Section title="Commodities targeted">
          <div className="flex flex-wrap gap-1.5">
            {brief.commodities.map((c) => (
              <span key={c.name} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-700">
                {c.name.toLowerCase()} <span className="text-stone-400">{c.reports}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Operators */}
      {brief.operators.length > 0 && (
        <Section title="Who worked this ground">
          <ul className="space-y-1 text-[12px]">
            {brief.operators.slice(0, 12).map((o) => (
              <li key={o.operator} className="flex justify-between gap-3 border-t border-stone-100 py-1">
                <span className="truncate text-stone-700">{o.operator}</span>
                <span className="shrink-0 text-stone-400">
                  {o.first_year}{o.last_year !== o.first_year && `–${o.last_year}`} · {o.reports}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Report inventory -- every claim traceable */}
      {brief.reports.length > 0 && (
        <Section
          title="Report inventory"
          note={`${brief.reports.length} most recent of ${n(s.report_count)}. Every A-number links to the source.`}
        >
          <ul className="space-y-2.5">
            {brief.reports.slice(0, 40).map((r) => (
              <li key={r.anumber} className="border-t border-stone-100 pt-2">
                <div className="flex items-baseline gap-2">
                  <a
                    href={r.url_report ?? `https://wamex.dmp.wa.gov.au/Wamex/Search/ReportDetails?ANumber=${r.anumber}`}
                    target="_blank" rel="noreferrer"
                    className="shrink-0 font-medium text-amber-800 hover:underline"
                  >
                    A{r.anumber}
                  </a>
                  <span className="text-[11px] text-stone-400">
                    {r.report_year ?? "—"}{r.report_type && ` · ${r.report_type}`}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-stone-700">{r.title ?? "(untitled)"}</p>
                {r.operator && <p className="text-[11px] text-stone-500">{r.operator}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Provenance */}
      <div className="border-t border-stone-200 bg-stone-50 px-5 py-4 text-[11px] leading-relaxed text-stone-500">
        <p className="font-medium text-stone-600">{brief.meta.generated}</p>
        <p className="mt-1">{brief.meta.coverage}</p>
        <p className="mt-2">
          {ATTRIBUTION}, used under{" "}
          <a href={LICENCE_URL} target="_blank" rel="noreferrer" className="underline">CC BY 4.0</a>.
        </p>
      </div>
    </div>
  );
}

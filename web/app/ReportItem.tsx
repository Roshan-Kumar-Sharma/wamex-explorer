"use client";

import { useState } from "react";
import { needsFetch, reportUrl } from "@/lib/reports";
import type { Brief } from "./types";

type R = Brief["reports"][number];

/**
 * One inventory entry. Shows the cached full abstract when there is one,
 * otherwise the short one with a button that fetches the rest on demand
 * (ADR-007: only for reports someone is actually reading).
 */
export default function ReportItem({ r, compact = false }: { r: R; compact?: boolean }) {
  const [full, setFull] = useState<string | null>(r.abstract_full);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/abstract/${r.anumber}`);
      const j = await res.json();
      if (j.abstract) { setFull(j.abstract); setState("idle"); }
      else { setErr(j.error ?? "not available"); setState("error"); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed"); setState("error");
    }
  };

  const truncated = !full && (r.abstract_short?.length ?? 0) >= 245;
  const fetchable = needsFetch({ abstract_full: full, abstract_short: r.abstract_short });

  return (
    <li className="border-t border-stone-100 pt-2.5 pb-1 break-inside-avoid">
      <div className="flex items-baseline gap-2">
        <a href={reportUrl(r)} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-amber-800 hover:underline">
          A{r.anumber}
        </a>
        <span className="text-[11px] text-stone-400">
          {r.report_year ?? "—"}{r.report_type && ` · ${r.report_type}`}
          {r.has_digital_file === false && " · no digital file"}
        </span>
      </div>
      <p className={`mt-0.5 leading-snug text-stone-800 ${compact ? "text-[12px]" : "text-[13px]"}`}>{r.title ?? "(untitled)"}</p>
      {r.operator && <p className="text-[11px] text-stone-500">{r.operator}</p>}

      {full ? (
        <div className={`mt-1.5 whitespace-pre-line leading-relaxed text-stone-700 ${compact ? "text-[12px]" : "text-[12.5px]"}`}>
          {full}
        </div>
      ) : r.abstract_short ? (
        <p className={`mt-1.5 leading-relaxed text-stone-600 ${compact ? "text-[12px]" : "text-[12.5px]"}`}>
          {r.abstract_short}{truncated && "…"}
        </p>
      ) : (
        <p className="mt-1.5 text-[11.5px] italic text-stone-400">No abstract in the bulk data.</p>
      )}

      {!full && (
        <div className="mt-1 text-[11px]">
          {state === "loading" ? (
            <span className="text-stone-400">fetching from DMPE…</span>
          ) : state === "error" ? (
            <span className="text-red-700">full abstract unavailable ({err})</span>
          ) : (
            <button onClick={load} className="text-amber-800 underline decoration-amber-300 hover:decoration-amber-800 print:hidden">
              {fetchable ? "Load abstract from DMPE" : "Check for a longer abstract"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

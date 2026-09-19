"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import BriefPanel from "./Brief";
import type { Brief } from "./types";
import { type Filters, isEmpty } from "@/lib/filters";

// MapLibre touches window on import -- keep it out of SSR.
const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-stone-400">Loading map…</div>,
});

export default function Page() {
  const [geometry, setGeometry] = useState<GeoJSON.Polygon | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  // One place runs the brief. The map supplies geometry; the panel supplies
  // filters; either change re-runs it. A request id discards stale responses.
  // Called from event handlers, not an effect -- fetching is a response to a
  // user action, and React's lint rightly objects to setState-in-effect.
  const run = useCallback(async (g: GeoJSON.Polygon | null, f: Filters) => {
    if (!g) { reqId.current++; setBrief(null); setLoading(false); return; }
    const id = ++reqId.current;
    setLoading(true);
    try {
      const r = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: g, filters: f }),
      });
      if (id !== reqId.current) return;
      setBrief(r.ok ? await r.json() : null);
    } catch {
      if (id === reqId.current) setBrief(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const onGeometry = useCallback((g: GeoJSON.Polygon | null) => {
    setGeometry(g);
    setFilters({});            // a new area starts unfiltered
    run(g, {});
  }, [run]);

  /** Toggle a value in an array facet, or set/clear a scalar one. */
  const onFilter = useCallback((patch: Partial<Filters>) => {
    // Compute from the current value, not inside a setState updater: updaters
    // must be pure (StrictMode calls them twice) and this one triggers a fetch.
    const next: Filters = { ...filters };
    for (const [k, v] of Object.entries(patch) as [keyof Filters, unknown][]) {
      if (Array.isArray(v) && v.length === 1) {
        const cur = (filters[k] as string[] | undefined) ?? [];
        const val = v[0] as string;
        const arr = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
        (next as Record<string, unknown>)[k] = arr.length ? arr : undefined;
      } else {
        (next as Record<string, unknown>)[k] = v;
      }
    }
    setFilters(next);
    run(geometry, next);
  }, [filters, geometry, run]);

  const onClearFilters = useCallback(() => { setFilters({}); run(geometry, {}); }, [geometry, run]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-baseline justify-between border-b border-stone-200 px-5 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-stone-900">wamex-explorer</h1>
          <span className="text-[11px] text-stone-500">Western Australia open-file exploration history</span>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          {process.env.NEXT_PUBLIC_PMTILES_URL ? "Phase 1 · all of WA" : "Phase 0 · Kalgoorlie"}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Map onGeometry={onGeometry} />
        </div>
        <aside className="w-[420px] shrink-0 overflow-hidden border-l border-stone-200">
          <BriefPanel
            brief={brief}
            loading={loading}
            filters={filters}
            filtered={!isEmpty(filters)}
            onFilter={onFilter}
            onClearFilters={onClearFilters}
          />
        </aside>
      </div>
    </main>
  );
}

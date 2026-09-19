"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import BriefPanel from "./Brief";
import type { Brief } from "./types";

// MapLibre touches window on import -- keep it out of SSR.
const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-stone-400">Loading map…</div>,
});

export default function Page() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-baseline justify-between border-b border-stone-200 px-5 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-stone-900">wamex-explorer</h1>
          <span className="text-[11px] text-stone-500">
            Western Australia open-file exploration history
          </span>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          {process.env.NEXT_PUBLIC_PMTILES_URL ? "Phase 1 · all of WA" : "Phase 0 · Kalgoorlie"}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Map onBrief={(b, l) => { setBrief(b); setLoading(l); }} />
        </div>
        <aside className="w-[420px] shrink-0 overflow-hidden border-l border-stone-200">
          <BriefPanel brief={brief} loading={loading} />
        </aside>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Load the full abstracts for the reports on this page." Batches of 25,
 * one request at a time behind the server's rate limit, then refreshes the
 * server-rendered page so the overlay from `reports.abstract_full` shows.
 */
export default function AbstractsLoader({ anumbers }: { anumbers: number[] }) {
  const router = useRouter();
  const [done, setDone] = useState(0);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");

  if (anumbers.length === 0) return null;

  const run = async () => {
    setState("running");
    try {
      for (let i = 0; i < anumbers.length; i += 25) {
        const res = await fetch("/api/abstract", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anumbers: anumbers.slice(i, i + 25) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setDone(Math.min(anumbers.length, i + 25));
      }
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  };

  const secs = Math.ceil(anumbers.length * 0.8);
  return (
    <span className="print:hidden">
      {state === "idle" && (
        <button onClick={run} className="text-amber-800 underline decoration-amber-300 hover:decoration-amber-800">
          Load {anumbers.length} full abstract{anumbers.length === 1 ? "" : "s"} from DMPE
          <span className="text-stone-400"> (~{secs} s, one request at a time)</span>
        </button>
      )}
      {state === "running" && <span className="text-stone-500">fetching {done}/{anumbers.length}…</span>}
      {state === "done" && <span className="text-stone-500">loaded — cached for everyone from now on</span>}
      {state === "error" && <span className="text-red-700">fetch failed; try again later</span>}
    </span>
  );
}

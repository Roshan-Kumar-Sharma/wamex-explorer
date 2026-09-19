import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import BriefDocument from "@/app/BriefDocument";
import { loadBrief } from "@/lib/briefs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const b = await loadBrief(id, { countView: false });
  if (!b) return { title: "Brief not found — wamex-explorer" };
  const s = b.result.summary;
  const p = b.result.period;
  const title = b.title ?? `${s.area_km2} km² ground history`;
  return {
    title: `${title} — wamex-explorer`,
    description: `${s.report_count.toLocaleString()} open-file reports, ${s.hole_count.toLocaleString()} drillholes` +
      (p.first_year ? `, ${p.first_year}–${p.last_year}` : "") + ". Every claim cited to its WAMEX A-number.",
  };
}

/**
 * A permalinked brief: the document, server-rendered from the stored result.
 * Shareable, printable, crawlable. This page is the product; the map is how
 * you get here.
 */
export default async function BriefPage({ params }: Params) {
  const { id } = await params;
  const b = await loadBrief(id);
  if (!b) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const permalink = host ? `${proto}://${host}/b/${b.slug ?? b.id}` : `/b/${b.slug ?? b.id}`;

  return (
    <main className="min-h-screen bg-stone-50 print:bg-white">
      <nav className="border-b border-stone-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-[760px] items-baseline justify-between px-6 py-2.5">
          <Link href="/" className="text-sm font-semibold tracking-tight text-stone-900">wamex-explorer</Link>
          <span className="text-[11px] text-stone-500">Western Australia open-file exploration history</span>
        </div>
      </nav>
      <div className="bg-white print:bg-white">
        <BriefDocument brief={b.result} id={b.id} title={b.title} createdAt={b.created_at} permalink={permalink} />
      </div>
    </main>
  );
}

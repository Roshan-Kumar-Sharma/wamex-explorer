import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-20 text-stone-700">
      <h1 className="text-lg font-semibold text-stone-900">No brief at this address</h1>
      <p className="mt-2 text-sm leading-relaxed">
        Briefs are created from the map. <Link href="/" className="text-amber-800 underline">Draw an area</Link> and use
        &ldquo;Save &amp; share&rdquo; to get a permanent link.
      </p>
    </main>
  );
}

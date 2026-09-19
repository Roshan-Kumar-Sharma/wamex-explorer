import { NextRequest, NextResponse } from "next/server";
import { getFullAbstract } from "@/lib/abstract";

const MAX_BATCH = 25;

/**
 * POST /api/abstract { anumbers: number[] } -> full abstracts for up to 25
 * reports, fetched one at a time behind the shared rate limit. This is how a
 * brief hydrates its inventory: only the reports on screen, never the corpus.
 */
export async function POST(req: NextRequest) {
  let anumbers: unknown;
  try { ({ anumbers } = await req.json()); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(anumbers) || anumbers.length === 0) {
    return NextResponse.json({ error: "anumbers: number[] required" }, { status: 400 });
  }
  const ids = [...new Set(anumbers.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_BATCH);
  const results = [];
  for (const a of ids) results.push(await getFullAbstract(a));
  return NextResponse.json({ results });
}

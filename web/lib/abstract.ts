import { pool } from "@/lib/db";

/**
 * Full report abstracts, fetched lazily and cached forever (ADR-007).
 *
 * Layer 22's `abstract` is varchar(250), truncated mid-word. The department's
 * per-report page (`reports.url_abstract`, CreateReportAbstractDialog) carries
 * the full GSWA-written text, ~900-1,200 chars, plus "Prospects:" and
 * "Assays:" lines. It is a free government service behind an Imperva CDN, so:
 *
 *   - one request at a time, with a gap between them (a serial queue)
 *   - a real User-Agent that says who we are
 *   - cache permanently in reports.abstract_full; failures are recorded and
 *     not retried for a week
 *   - never called in bulk -- only for reports a user is actually looking at
 */

const MIN_GAP_MS = 600;
const TIMEOUT_MS = 15_000;
const RETRY_FAILED_AFTER_DAYS = 7;

const CONTACT = process.env.WAMEX_CONTACT ?? "https://github.com/roshan/wamex-explorer";
const USER_AGENT = `wamex-explorer/0.2 (open-source WAMEX viewer; ${CONTACT})`;

// One queue per process, surviving Next's dev HMR like the pg pool does.
const g = globalThis as unknown as { __abstractQueue?: Promise<unknown>; __abstractLast?: number };
g.__abstractQueue ??= Promise.resolve();
g.__abstractLast ??= 0;

/** Run `fn` after everything already queued, with at least MIN_GAP_MS since the last request. */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = g.__abstractLast! + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await fn(); } finally { g.__abstractLast = Date.now(); }
  };
  const p = g.__abstractQueue!.then(run, run);
  g.__abstractQueue = p.catch(() => {});
  return p;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", deg: "°", micro: "µ", frac12: "½",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Pull the abstract text out of the dialog HTML. Returns null if the page has
 * no abstract container (which is how a bad A-number or a block page looks).
 */
export function parseAbstractHtml(html: string): string | null {
  const m = html.match(/<div class="htmlTextContainer"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return null;
  const text = decodeEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t\r]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
  return text.length > 0 ? text : null;
}

export type AbstractResult = {
  anumber: number;
  abstract: string | null;
  source: "cache" | "fetched" | "error";
  fetched_at: string | null;
  error?: string;
};

/** Cached full abstract, or fetch it now. */
export async function getFullAbstract(anumber: number): Promise<AbstractResult> {
  const { rows } = await pool.query(
    `SELECT abstract_full, abstract_fetched_at, abstract_fetch_error, url_abstract
       FROM reports WHERE anumber = $1`, [anumber]);
  const r = rows[0];
  if (!r) return { anumber, abstract: null, source: "error", fetched_at: null, error: "unknown A-number" };

  if (r.abstract_full) {
    return { anumber, abstract: r.abstract_full, source: "cache", fetched_at: r.abstract_fetched_at };
  }
  // A recent failure: don't hammer.
  if (r.abstract_fetched_at && r.abstract_fetch_error) {
    const age = Date.now() - new Date(r.abstract_fetched_at).getTime();
    if (age < RETRY_FAILED_AFTER_DAYS * 86_400_000) {
      return { anumber, abstract: null, source: "error", fetched_at: r.abstract_fetched_at, error: r.abstract_fetch_error };
    }
  }
  if (!r.url_abstract) {
    return { anumber, abstract: null, source: "error", fetched_at: null, error: "no abstract URL on record" };
  }

  return enqueue(async () => {
    let text: string | null = null;
    let error: string | null = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(r.url_abstract, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) error = `HTTP ${res.status}`;
      else {
        text = parseAbstractHtml(await res.text());
        if (!text) error = "no abstract in page";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await pool.query(
      `UPDATE reports SET abstract_full = $2, abstract_fetched_at = now(), abstract_fetch_error = $3
        WHERE anumber = $1`, [anumber, text, error]);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[abstract] A${anumber}: ${text ? `${text.length} chars` : `FAILED ${error}`}`);
    }
    return text
      ? { anumber, abstract: text, source: "fetched", fetched_at: new Date().toISOString() }
      : { anumber, abstract: null, source: "error", fetched_at: new Date().toISOString(), error: error ?? "unknown" };
  });
}

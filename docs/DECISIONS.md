# Decision log

Architectural decisions, dated, with reasoning and reversal conditions. Append; never
rewrite history. When a decision is reversed, add a new entry that supersedes it.

---

## ADR-001 — Split ingest (Python) from API (TypeScript)
**19 Sep 2026 · Accepted**

**Context.** `BUILD.md` offers "Node/TypeScript or FastAPI." Both are defensible.

**Decision.** Python for ingest/ETL, TypeScript for the API and frontend.

**Why.** GDAL/`ogr2ogr` is the only thing that reads Esri GDB properly, and GeoPandas /
pyproj / tippecanoe wrappers are Python-native. There is no TypeScript equivalent worth
using. The API, conversely, is thin — take a polygon, run PostGIS, return JSON — and gains
nothing from Python while costing a second language in the user-facing path. Python also
keeps ingest next to `mineio`.

**Reverses if.** The API grows heavy geospatial computation (e.g. the coverage-gap engine),
at which point that specific service moves to Python and the thin API stays TypeScript.

---

## ADR-002 — Drop deck.gl from v1
**19 Sep 2026 · Accepted**

**Context.** `CLAUDE.md` specifies "MapLibre GL + deck.gl."

**Decision.** Ship v1 with MapLibre only.

**Why.** deck.gl has no native PMTiles layer; MapLibre is specifically optimised to render
them. For 3.4M tiled points deck.gl adds a second rendering context to keep in sync, for
no gain.

**Reverses if.** We build 3D drillhole traces (collar + azimuth + dip as lines in space) —
genuinely beyond MapLibre, and exactly deck.gl's strength. Expected around Phase 3.

**Note.** A subtraction on evidence, not a relitigation of the stack — PMTiles and
MapLibre, the actual decisions, are unchanged.

---

## ADR-003 — Self-hosted Postgres, not a managed free tier
**19 Sep 2026 · Accepted**

**Context.** Instinct says use Neon or Supabase free tier.

**Decision.** Docker locally for dev; a ~€4/mo Hetzner VPS for prod.

**Why.** Verified Sep 2026: **Neon free = 0.5 GB, Supabase free = 500 MB.** We need
[~3.5 GB](02-architecture/02-data-model.md#sizing). Both fail by ~7×. The cheapest managed
tier that fits costs more than the VPS.

**Cost of this.** We own backups and updates. Acceptable — the entire dataset is
reproducible from a public source, so the disaster-recovery story is "re-run the ingest."

**Reverses if.** A managed tier offers ≥5 GB free, or the ops burden starts costing more
time than €4/mo is worth.

---

## ADR-004 — PMTiles on Cloudflare R2
**19 Sep 2026 · Accepted**

**Decision.** Host the `.pmtiles` archive on R2, not S3 or the app host.

**Why.** **Zero egress fees.** Map tiles are egress-heavy; the same traffic costs ~$9/100 GB
on S3 and ~$15/100 GB on Vercel. This single choice is worth more than every other cost
decision combined.

**Reverses if.** Never, realistically. R2's egress pricing is the moat of this decision.

---

## ADR-005 — Ship v1 with no LLM
**19 Sep 2026 · Accepted**

**Context.** `BUILD.md` Phase 2 is LLM-generated briefs. `CLAUDE.md` demands
citation-or-silence.

**Decision.** v1 generates its brief entirely from structured data — the `keywords`
controlled vocabulary (157+ terms, 98.8% coverage), hole counts, date ranges, operators.
No language model in the loop.

**Why.** A `GROUP BY` cannot hallucinate. This satisfies the project's hardest constraint
by construction rather than by prompt engineering, costs $0, and is genuinely useful on
its own. Generated prose is then added as an explicitly labelled layer *above* a factual
base, which is also the right UX.

**Reverses if.** Never fully — the factual base stays. Prose gets added on top.

---

## ADR-006 — Normalised schema, not the API's flat shape
**19 Sep 2026 · Accepted**

**Decision.** Split `reports` (one row per A-number) from `report_geometries` (many);
normalise keywords and commodities into join tables.

**Why.** Measured **5.3× polygon duplication** (2,648 rows → 504 A-numbers). A flat mirror
of the API makes every user-facing count wrong by ~5× unless every query remembers
`DISTINCT`. Normalising makes correctness structural instead of a thing you must remember
at 2am.

**Reverses if.** Nothing plausible.

---

## ADR-007 — Lazy-fetch full abstracts, never bulk-scrape
**19 Sep 2026 · Accepted**

**Context.** Layer 22's `abstract` is `varchar(250)` and truncated mid-word. Full text is
behind a per-report URL in `dpxe_abs`.

**Decision.** Check the DASC bulk download for untruncated abstracts first. If absent,
fetch per-A-number on demand for reports inside a user's polygon, and cache permanently
(`reports.abstract_fetched_at`).

**Why.** 615k requests against a free government service is rude, slow, probably rate
limited, and risks getting blocked — which would end the project. Rate limit, set a real
User-Agent with contact details.

**Reverses if.** DASC turns out to ship full abstracts in bulk, in which case this
disappears entirely.

---

## ADR-008 — Retarget the product away from `BUILD.md` Phase 2
**19 Sep 2026 · Proposed — needs your call**

**Context.** [NextMaps](01-research/03-competitive-landscape.md) has shipped the Phase 2
product: polygon → AI desk study from the full WAMEX A-file record, **every claim cited to
its A-number**, flags thin evidence, includes assays and original PDFs. $200/mo Pro tier.

**Proposal.** Build Phases 0–1 as the learning vehicle they are. Publish the cleaned corpus
(uncontested, falls out of Phase 1 for free). Point exports at `mineio`. **Do not build
Phase 2 as a commercial product.**

**Why.** The market is validated — someone charges $200/mo for this — but the specific
wedge is taken by a better-resourced incumbent with paid data we can't match.

**Status.** Awaiting decision. See
[product options](01-research/04-product-options.md).

---

## ADR-009 — arm64 PostGIS image
**19 Sep 2026 · Accepted**

**Context.** `postgis/postgis:17-3.5` publishes **linux/amd64 only**. `docker compose up`
fails outright on Apple Silicon.

**Decision.** Use `imresamu/postgis:17-3.5` — a multi-arch rebuild by a PostGIS
contributor, `linux/amd64, linux/arm64`.

**Reverses if.** The official image publishes arm64.

---

## ADR-010 — No basemap in Phase 0
**19 Sep 2026 · Accepted, with a caveat about how we got here**

**Decision.** Ship a self-contained MapLibre style: a background colour plus our own
data. No external basemap.

**Why.** An external CDN basemap is a runtime dependency on someone else's service, an
extra attribution obligation, and a failure mode we do not control. The architecture
already calls for self-hosted static tiles.

**Honest note on how this decision arose.** It was triggered while debugging a blank map
that turned out to have nothing to do with the basemap — the real cause was a hidden
browser tab suspending `requestAnimationFrame` (see `LEARNING-LOG.md`). CARTO Positron was
loading fine. The reasoning above stands on its own, but the trigger was a misdiagnosis,
and restoring an external basemap is a one-line change if you want a geographic reference
before Phase 1.

**Reverses if.** You want road/town context before Phase 1 lands a Protomaps basemap in
the same PMTiles bucket.

---

## ADR-011 — Set up map layers on `styledata`, not `load`
**19 Sep 2026 · Accepted**

**Context.** MapLibre's `load` event waits for the style **and the first rendered frame**.

**Decision.** Add sources and layers on `styledata` (guarded by an idempotence flag),
never on `load`.

**Why.** Browsers suspend `requestAnimationFrame` in hidden or background tabs, so the
first frame — and therefore `load` — may never arrive. Gating data loading on it means a
user who opens the app in a background tab gets a permanently empty map with no error.
Found the hard way; see `LEARNING-LOG.md`.

**Reverses if.** Nothing plausible.

---

## ADR-012 — Serve MapLibre's Web Worker from `public/`
**19 Sep 2026 · Accepted**

**Context.** MapLibre v6 locates its worker with
`new URL("./maplibre-gl-worker.mjs", import.meta.url)`. Under Next.js that resolves into
`/_next/static/chunks/`, where the file does not exist — so the request returns Next's
HTML 404 page and the worker dies with a MIME-type error.

**Decision.** Copy `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` into
`public/maplibre/` and call `maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")`.
An npm `sync:maplibre` script (wired to `predev` and `postinstall`) keeps the copies in
step with the installed version.

**Why not commit the files by hand.** They would silently go stale on the next
`npm update`, and a stale worker against a newer main bundle fails in confusing ways.

**Reverses if.** MapLibre ships a bundler-agnostic worker resolution.

---

## ADR-013 — Sequential queries on one pooled client
**19 Sep 2026 · Accepted**

**Context.** `/api/brief` runs nine queries that all reference a `TEMP TABLE aoi`, so they
must share one connection. They were written with `Promise.all`.

**Decision.** Run them sequentially.

**Why.** A single `pg` client cannot execute concurrent queries — it silently queues them
and warns that this is deprecated and removed in `pg@9`. Total brief time is ~300–680 ms
sequentially, which is well inside the 2-second target in `BUILD.md` §8.

**Reverses if.** The brief gets slow enough to need parallelism, in which case the `aoi`
geometry gets passed per-query and the queries run on separate pooled clients.

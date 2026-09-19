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

**Why.** 119k requests against a free government service is rude, slow, probably rate
limited, and risks getting blocked — which would end the project. Rate limit, set a real
User-Agent with contact details.

**Reverses if.** DASC turns out to ship full abstracts in bulk, in which case this
disappears entirely.

---

## ADR-008 — Retarget the product away from `BUILD.md` Phase 2
**19 Sep 2026 · Accepted (Roshan, same day)**

**Context.** [NextMaps](01-research/03-competitive-landscape.md) has shipped the Phase 2
product: polygon → AI desk study from the full WAMEX A-file record, **every claim cited to
its A-number**, flags thin evidence, includes assays and original PDFs. $200/mo Pro tier.

**Proposal.** Build Phases 0–1 as the learning vehicle they are. Publish the cleaned corpus
(uncontested, falls out of Phase 1 for free). Point exports at `mineio`. **Do not build
Phase 2 as a commercial product.**

**Why.** The market is validated — someone charges $200/mo for this — but the specific
wedge is taken by a better-resourced incumbent with paid data we can't match.

**Decision.** Accepted. wamex-explorer is the classroom, not the product. Sequence:
Phase 1 → publish the cleaned corpus → grow `mineio` as the export engine → national only
after a spike. **Phase 2 is still built** — as the learning vehicle and the showcase, not
as a business. See [product options](01-research/04-product-options.md), "How to evaluate
a target".

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

---

## ADR-014 — Bulk data via DASC's official automation URLs
**19 Sep 2026 · Accepted**

**Decision.** Ingest from the DASC bulk GDB files at the URLs in DASC's own "URL document
for dynamic datasets" (`dasc.dmirs.wa.gov.au/Download/File/3599`): drillholes
`/download/file/1969`, WAMEX `/download/file/4847`. Never paginate the REST API for a
full load.

**Why.** It is the sanctioned path — the department publishes the document specifically
"to facilitate automated downloading." The files regenerate nightly and are served from
Azure Blob in Sydney, which honours HTTP Range. Observed throughput from this network is
only 20–130 KB/s (a 121 MB file took ~35 min), so `wamex/dasc.py` resumes on failure.

**Reverses if.** DASC stops publishing the document or the URLs.

---

## ADR-015 — GDAL from the OSGeo Docker image, not Homebrew
**19 Sep 2026 · Accepted**

**Context.** `brew install gdal` pulls **130 dependencies** including gcc and the entire
AWS C++ SDK — ~8 GB — and it failed halfway on a full disk.

**Decision.** `ghcr.io/osgeo/gdal:alpine-small-latest` (~150 MB) on the compose network,
wrapped by `wamex/gdal.py`. It has every driver we need: OpenFileGDB, PostgreSQL,
GeoJSONSeq. `tippecanoe` stays on brew — it has no dependencies.

**Why.** One binary that reads a GDB does not justify 8 GB of toolchain. The image also
gives every clone an identical GDAL. Cost: ~2 s of container start per call.

**Reverses if.** Never, realistically.

---

## ADR-016 — tippecanoe `--drop-rate=1`
**19 Sep 2026 · Accepted**

**Context.** The first build used tippecanoe defaults, which thin points to 1/2.5 per zoom
level below the maximum. At z10 over Kalgoorlie that left **876** of ~84,000 holes
visible — the drill patterns, which are the whole point of the map, vanished.

**Decision.** `--drop-rate=1 --drop-densest-as-needed --extend-zooms-if-still-dropping`
with the default 500 KB tile-size limit. Points are dropped only where a tile actually
overflows, which is only at the low zooms where the whole state sits in a handful of
tiles.

**Result.** Kalgoorlie at z10: **12,054** rendered. All of WA at z4: 24,639 for 1.2 MB.
File grew 125 → 254 MB — an acceptable price on R2 with zero egress.

**Reverses if.** The file size becomes a problem, in which case cluster at low zooms
(`--cluster-distance`) rather than thin at all zooms.

---

## ADR-017 — WA bounds include the Indian Ocean Territories
**19 Sep 2026 · Accepted**

**Context.** The first drillhole transform rejected **27,409** points at ~106°E, −10.5°S as
"outside WA".

**Decision.** Bounds are 96–130°E, −36 to −9°S.

**Why.** Those points are **Christmas Island** — a phosphate mine whose exploration is
administered by WA's mines department and reported into WAMEX. Cocos (Keeling) at 96.8°E
is included for safety. They are real, and the bound was wrong, not the data. Same lesson
as the 1753 dates: look at the rejects before trusting the rule that rejected them.

**Reverses if.** Nothing plausible.

---

## ADR-018 — Permalinks keyed by content hash; stored briefs are never regenerated
**19 Sep 2026 · Accepted**

**Context.** `BUILD.md` Phase 2: "Permalink per brief. Shareable." `CLAUDE.md`: "cached by
polygon hash."

**Decision.** `briefs.id = base32(sha256(canonical polygon + canonical filters))[:12]`.
Coordinates rounded to 6 dp, filter keys sorted, empties dropped. `POST /api/briefs` returns
the existing row if the id exists. The stored `result` is the brief exactly as generated,
with `data_version` (max `extract_date` at the time). `/b/<id>` renders the stored result;
`/?b=<id>` reopens the polygon on the map and runs a *live* brief.

**Why.** The same ground drawn twice must be the same link — that is what makes a link a
citation. And a link someone shared must show what they saw: silently regenerating a
stored brief after a weekly data refresh would change the numbers under a screenshot.
The document prints its data version so a reader can tell it is a snapshot.

**Cost.** ~400 KB per stored brief (500 reports with abstracts, ~300 grid cells). At a
few thousand briefs that is a gigabyte; acceptable, revisit at 10k.

**Reverses if.** Storage matters, in which case store geometry + filters only and cache
regenerated results with a TTL — accepting that old links drift.

---

## ADR-019 — Coverage by square grid in the local MGA zone
**19 Sep 2026 · Accepted**

**Decision.** Tile the polygon with `ST_SquareGrid` in EPSG `7800 + zone`, cell edge
`sqrt(area/300)` rounded to 50 m (min 50). A cell belongs if its centroid is inside.
Holes snap to cells by integer division, counted over the whole cell. Three tiers: no
hole / no hole ≥ 50 m / no RC-DD-RCD. Water bores and costeans excluded. `hits` CTE is
`MATERIALIZED`.

**Why squares, not hexagons.** Point-in-square is arithmetic; point-in-hexagon is a
polygon test. 0.4 s vs 1.3 s on a 1° box. **Why MGA.** Cells must be metres, and Web
Mercator is ~15% stretched at 30°S. **Why the centroid rule.** Edge slivers otherwise
count as undrilled for being small. **Why MATERIALIZED.** The planner inlined the
aggregate under a nested loop and ran it once per cell — 9 s instead of 0.4.

**Limits, stated in the document.** One hole anywhere in a cell makes it "drilled"; the
50 m and RC/DD thresholds are proxies for reaching fresh rock, not measurements of it.
Full reasoning: [03-concepts/05-coverage-and-what-was-never-tested.md](03-concepts/05-coverage-and-what-was-never-tested.md).

**Reverses if.** We want neighbour-aware statistics (clusters of untested cells), where
hexagons are genuinely better — at which point precompute the hex id per hole at ingest.

---

## ADR-020 — Full-abstract fetch etiquette
**19 Sep 2026 · Accepted (implements ADR-007)**

**Context.** ADR-007 resolved: the bulk data has no full abstracts. Phase 2 found worse —
GSWA abstracts stop in 2014, and **26,760 reports since have no abstract in bulk at all**
— and better: the per-report page carries structured, company-written abstracts with
drill intercepts for exactly those reports.

**Decision.** One serial queue per process, ≥ 600 ms between requests, 15 s timeout,
User-Agent `wamex-explorer/0.2 (open-source WAMEX viewer; <WAMEX_CONTACT>)`. Fetch only
for a report a user is looking at (`GET /api/abstract/:a`) or the reports on one brief
page (`POST /api/abstract`, ≤ 25 per call, still serial). Cache forever in
`reports.abstract_full`; record failures in `abstract_fetch_error` and do not retry for
7 days. The contact string comes from an environment variable, not the source.

**Why.** A free government service behind a CDN. Getting blocked ends the project.
Politeness is cheap; the per-page cost to a user is ~0.8 s per report, and every fetch
makes the corpus better for the next person.

**Never.** No bulk pre-fetch, not even "just the 26,760 recent ones", without asking the
department first. That conversation is worth having — it is the corpus-publishing
conversation (Option 4) — but it is a conversation, not a script.

---

## ADR-021 — The document's prose is templated, and still no LLM
**19 Sep 2026 · Accepted (extends ADR-005)**

**Context.** `BUILD.md` Phase 2 is written as "generate a structured brief". The
document at `/b/<id>` reads as prose in places ("Between 1937 and 2024, 504 open-file
reports were lodged…").

**Decision.** Every sentence in the document is a fixed template with numbers from
`GROUP BY` substituted in, or a string copied verbatim from the record beside its
A-number. The one general-knowledge statement (regolith depth) is marked "general note,
not from this record". Absences are phrased as facts about the record ("no report lists
lithium as a target"), never as facts about the ground.

**Why.** The audience checks. A template cannot hallucinate a number, and a verbatim
abstract with its A-number is a citation. This satisfies `CLAUDE.md` §"citation or
silence" by construction. If prose generation is ever added, it sits *above* this layer,
labelled, and is fed only the retrieved abstracts — the template layer stays the floor.

**Reverses if.** Never fully; see ADR-005.

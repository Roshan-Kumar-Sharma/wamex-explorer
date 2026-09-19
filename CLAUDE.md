# wamex-explorer

A web app over Western Australia's free, public WAMEX exploration data: **draw a polygon on a map,
get a written history of everything ever done on that ground.**

Read `BUILD.md` for the plan. Read `DATA.md` for verified endpoints, schemas and record counts.

---

## The product thesis — don't lose this

**It is not a map. It is a document generator.** The map is the input device; the output is a
shareable written brief. DMIRS/DMPE already ships a free spatial viewer — "WAMEX on a map" is a
worse copy of a government service. The product is **synthesis**: answering *"what has already been
done on this ground?"*, which currently costs a geologist two to three days of reading PDFs.

---

## Non-negotiable: citation or silence

The audience is expert and adversarial. Geologists will test this on ground they know personally.
One hallucinated claim in a screenshot kills the product — this community is small and talks.

1. Every factual claim cites its `anumber`, linked and traceable
2. Never generate a sentence not grounded in retrieved text
3. Separate database facts (hole counts) from report claims (someone's 1983 opinion — attribute it)
4. State what is missing; gaps are more valuable than confident filler
5. Never imply economic or investment conclusions

Build citations in from day one. Trust cannot be retrofitted.

---

## Key facts

- **3,466,691** open-file drillholes (SLIP layer 28); **118,834** unique WAMEX reports (layer 22 has 615,050 rows, but they are ~5× *exact duplicates* — a bad join in the upstream export. Always `COUNT(DISTINCT anumber)`.)
- **`anumber` joins holes to reports** — the most important relationship in the dataset
- **Layer 22's `abstract` is `varchar(250)`, truncated mid-word** — in both the API and the DASC bulk file — **and empty for 26,760 post-2014 reports** (GSWA stopped writing abstracts in 2014). The per-report `dpxe_abs` page has the full text: GSWA-written before 2014, structured company-written (with drill intercepts) after. `web/lib/abstract.ts` fetches lazily, serially, caches forever. Never bulk-scrape (ADR-020).
- **Sentinels, not nulls:** `report_year` 1753 (SQL Server) and 1899 (Excel) — floor is 1930; `maxdepth` ±999/±9999 — cap 9000. Quarantine into `rejected_rows`, never drop.
- **`keywords` is a 1,161-term controlled vocabulary, 98.8% coverage.** This — not the LLM — is the zero-hallucination backbone. v1 ships with no LLM.
- **Layer 28 is collars only — no assays.** Don't promise assays in v1.
- Licence: **CC BY 4.0**, attribution *"Based on Department of Mines, Petroleum and Exploration material"* must be visible in UI and exports
- Coordinates are WGS84; convert to MGA only on export
- Data updates weekly

## Where Phase 2 stands

Built as the learning vehicle, not a business (ADR-008 — NextMaps already sells this).
The document is at `/b/<id>` (server-rendered from `briefs.result`, never silently
regenerated — ADR-018); `web/lib/brief.ts` builds it; `web/app/BriefDocument.tsx` renders
it. Coverage grid = squares in the local MGA zone, centroid rule (ADR-019). All prose is
templated (ADR-021). Seeded permalinks: `/b/super-pit`, `/b/boddington`, `/b/tropicana`,
`/b/mt-keith`. Exports at `/api/briefs/:id/{timeline.csv,timeline.md,reports.csv,brief.md,holes.geojson}`.
Baselines (`sql/021_baselines.sql`) rank an area against drilled ground across WA.
**Framing:** the department mandates a "G) Previous exploration activities" section in
every report — our timeline is that table, generated (see `docs/01-research/05-…`).
**Not deployed; do not deploy without Roshan's explicit go-ahead. No Claude co-author
trailer on commits.**

## Stack decisions (made — don't relitigate)

PostGIS + PMTiles (tippecanoe) + MapLibre GL + deck.gl. Ingest bulk from DASC; **never query SLIP
live per user request**. LLM calls on demand only, cached by polygon hash. Budget under $20/month.

## Related

- `~/Engineering/mineio/` — the format library; this app's export engine, and this app is its showcase
- `~/Engineering/mining-engineering/` — Brent Buffham drill & blast work
- `~/Engineering/career-guidance/side-income/mining-tech/00-OPPORTUNITY-MAP.md` — why this project exists

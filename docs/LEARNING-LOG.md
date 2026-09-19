# Learning log

Session by session: what we did, what broke, what it taught. Newest first.

---

## 2026-09-19 (evening) — Phase 2: the brief becomes a document

### What we did

The map now produces a **document**. Draw an area → "Save & share as document" → a
permalink like `/b/super-pit` that renders the ground history as a page: at a glance,
exploration timeline, drilling summary, commodity focus over time, what the record does
not show, full report inventory, provenance footer. Still no LLM (ADR-021): every
sentence is a template filled from `GROUP BY`, every abstract is verbatim with its
A-number.

```
psql $DSN -f sql/020_phase2.sql          # briefs table, abstract_fetch_error column
cd web && npm run dev
node scripts/seed-briefs.mjs             # /b/super-pit, /b/boddington, /b/tropicana, /b/mt-keith
```

| Piece | Where | Note |
|---|---|---|
| Brief builder | `web/lib/brief.ts` | extracted from the route; 19 queries on one client |
| Timeline, method×decade, depth, deepest hole | `lib/brief.ts` | deepest hole is cited to its A-number |
| Coverage grid | `lib/brief.ts` → `coverage` | square grid in MGA zone, 3 tiers, drawn on the map |
| Full abstracts | `lib/abstract.ts`, `/api/abstract` | serial, 600 ms gap, cached forever |
| Permalinks | `/api/briefs`, `/b/[id]`, `lib/briefId.ts` | id = hash of polygon + filters |
| Document | `app/BriefDocument.tsx` | server-rendered, printable |
| Famous ground | `web/scripts/seed-briefs.mjs` | four boxes, each verified by dominant operator |

Timings: Golden Mile box (159 km², 504 reports, 12k holes) **288 ms**; a 1°×1° box
(10,822 reports, 357k holes) **2.9 s** — over the 2 s target at that extreme; fine at
prospect scale.

### What we learned

**1. GSWA stopped writing abstracts in 2014, and the bulk data hides it.** Coverage of the
`abstract` field: 94–100% for every five-year band to 2014, then **3–5%**. 26,760 reports
since 2015 have no abstract in the bulk export. But the per-report page has one — a
structured, *company-written* abstract (Location / Geology / Work Done / Results /
Conclusions / Prospects / Assays) that for A138136 runs to 7,000 characters and lists
every drilling programme's best intercept. So the lazy fetcher (ADR-007) is not a
nicety for truncated text; it is the *only* route to anything about the last decade, and
what it returns is most of what Phase 3 wanted from PDFs. Written up in
[03-concepts/04-reading-a-wamex-abstract.md](03-concepts/04-reading-a-wamex-abstract.md).

**2. Two more sentinels, from two more systems.** `report_year = 1899` on 10 reports whose
titles say 2012–14: **1899-12-30 is Excel's day zero.** The Phase 0 floor of 1880 let it
through; nothing genuine exists before 1935, so the floor is now 1930. And `maxdepth =
9999` on 64 holes — the positive twin of the −999 we already caught. The deepest genuine
hole is 4,431 m (a Canning Basin petroleum well filed under a minerals report), so the
cap is 9000. Three sentinel families now: SQL Server's 1753, Excel's 1899, and ±9999.
*Lesson: every upstream system leaves its own fingerprint for "unknown". Look at the
extremes of every numeric column before trusting them.*

**3. A query 20× slower than its parts means the planner did something to the parts.**
The coverage query was 0.4 s in a psql prototype and 9 s in the app. `EXPLAIN (ANALYZE)`
showed `loops=301`: the aggregate CTE, referenced once, was inlined under a nested loop
and re-run per grid cell. `AS MATERIALIZED` fixed it. Before that, a different 9 s: an
`ST_Transform(ST_Expand(…))` expression inline in a join condition is not a constant to
the planner, so it scanned and transformed all 3.4M points. Moving it to a CTE column let
the GIST index work. Both in
[03-concepts/05-coverage-and-what-was-never-tested.md](03-concepts/05-coverage-and-what-was-never-tested.md).

**4. Coverage numbers depend on rules you must print.** Same Golden Mile box: 20%
undrilled with 750 m hexagons, 34% with clipped 750 m squares (edge slivers counted),
33% with squares under the centroid rule. None is wrong; each answers a differently
worded question. The document prints cell size, cell count, the centroid rule and the
"any hole anywhere in the cell" caveat, because a percentage without them is a number
without a meaning.

**5. The grid looks tilted on the map, and it should.** Squares aligned to MGA grid north
are rotated relative to lat/long by the **grid convergence** — up to ~3° at a zone edge.
A drill grid laid out in MGA has the same tilt.

**6. A server component cannot import a function from a `"use client"` file.** Next.js
refuses at render time ("attempted to call isTruncated() from the server"). Shared helpers
go in `lib/`, not beside the component. Same family: route files may export only handlers,
so a constant exported from `route.ts` breaks the build.

**7. The brief writes history you can check.** The Golden Mile timeline shows gold in 1937,
WMC through the 60s–80s, then a cluster of nickel explorers 1967–74 — INCO, International
Nickel, Tasminex, Australian Selection — before gold returns in the 80s. That cluster is
the **Poseidon nickel boom** (1969–70) appearing in a `GROUP BY`. Tropicana shows 4,260
aircore holes averaging 32 m before RC and diamond — a greenfields discovery under sand
cover, drilled the way you drill under cover. Neither story was written; both were
counted.

### Verified

- [x] Same polygon → same permalink id (idempotent `POST /api/briefs`)
- [x] `/b/<id>` renders the stored result; `/?b=<id>` reopens the polygon and runs live
- [x] Coverage: 326 cells rendered on the map, 116 undrilled, 14,469 holes in view
- [x] Abstract fetch: 1.5 s first call, cache on second, 404 on unknown A-number
- [x] All four famous-ground boxes verified by dominant operator before seeding
- [x] Oldest report 1935; deepest hole 4,431 m; 0 rows outside the new floors
- [x] `npm run build`, `tsc`, `eslint` clean

### Open / not done

- 1°×1° brief is 2.9 s; the 18 non-coverage queries each redo the spatial join.
  Materialising the intersecting A-number set once would cut most of it.
- Per-report DRILLING SUMMARY table on the abstract page is parsed away, not stored.
- Stored brief is ~400 KB; the coverage grid geometry is most of it (ADR-018).
- `WAMEX_CONTACT` env var is unset locally; the User-Agent falls back to the repo URL.
- No static map image in the document; "Open on the map" is the round trip.
- Not deployed. Nothing public.

### Next

- Publish the cleaned corpus (Option 4) — now including the two new sentinel rules
- Weekly refresh, and the question of what a refresh does to stored briefs (ADR-018)
- Deploy: Hetzner + R2, only with Roshan's go-ahead

---

## 2026-09-19 (afternoon) — Phase 1: all of Western Australia

![All WA drillholes](images/phase1-all-wa-drillholes.png)

*3,465,828 drillholes, one 254 MB PMTiles file. Blue = RC, teal = aircore, grey = RAB,
red = diamond, amber = auger. The Pilbara is the blue cluster top-left; the Yilgarn
greenstone belts are the NNW-trending lines through the centre; the deserts are empty.*

### What we did

```
cd ingest && ./.venv/bin/python run_phase1.py      # download → load → transform → tiles
echo "NEXT_PUBLIC_PMTILES_URL=/tiles/drillholes.pmtiles" > web/.env.local
```

| Step | Time | Result |
|---|---|---|
| Download WAMEX GDB (96 MB) + drillholes GDB (121 MB) | ~35 min | slow link, resumable |
| ogr2ogr → `raw_wamex` | 70 s | 615,050 rows |
| ogr2ogr → `raw_drillholes` | **18 s** | 3,465,828 rows |
| `010_transform_wamex.sql` | 46 s | 118,834 reports |
| `011_transform_drillholes.sql` | 67 s | 3,465,828 holes, 0 geometry rejects |
| export → tippecanoe → PMTiles | 2.5 min | 254 MB |

Plus: Terra Draw free polygons, facets (commodity / hole type / decade / operator /
depth), and the brief now covers the whole state.

### What we learned — and one thing we had wrong

**1. The "615,050 reports" number was wrong, and so was our first explanation for it.**
Layer 22 has 615,050 rows and **118,834 distinct A-numbers**. In Phase 0 we explained the
5.2× ratio as "one report covers many tenements, one row per polygon". That fit the domain
and the numbers. It was wrong. The bulk data showed 108,522 of 108,523 shaped reports have
**exactly one geometry**, and the duplicate rows are byte-identical — same `item_no`, same
URL, same shape. **They are exact duplicate rows**, almost certainly a one-to-many join
left in the government's export. Every published "615k reports" figure counts them.

*Lesson: a plausible explanation that fits the numbers is not a verified one. It took one
query — `count(DISTINCT geometry) per anumber` — to find out. The Phase 0 handling
(`COUNT(DISTINCT anumber)`) was right by luck; the docs and the orientation material were
teaching the wrong reason. Both are now corrected.*

**2. The bulk file does not carry full abstracts either.** `ABSTRACT: String (250)` in the
GDB. ADR-007 is resolved: the lazy per-report fetcher is required. Phase 2 work.

**3. 27,409 "outside WA" rejects were Christmas Island.** A phosphate mine, administered by
WA's mines department, reported into WAMEX. The bounds were wrong; the data was fine. Same
shape of mistake as the 1753 dates: **read the rejects before trusting the rule.**

**4. Depth has sentinels too.** `-999` and `-9999` for "unknown". 5,424 holes. Nulled and
quarantined. Auger average depth went from −2 m to 1.8 m.

**5. Three drill codes nobody here can decode.** `RM` (3,790), `LD` (3,669), `MT` (2,722).
Left as `OTHER` and flagged. **Guessing would be worse than admitting it** — ask a
geologist.

**6. `DISTINCT ON` beat everything else for dedup.** 615k → 119k rows in under a second.

**7. tippecanoe's default drop-rate hides exactly what we want to show.** Default thins
points to 1/2.5 per zoom level. At z10 over Kalgoorlie that left 876 of ~84k visible — the
drill grids, which are the visual signature of exploration, disappeared. `--drop-rate=1`
drops only where tiles overflow: 12,054 visible, file 125 → 254 MB. ADR-016.

**8. Homebrew's GDAL is 130 packages and 8 GB.** It failed on a full disk. The OSGeo
Docker image is 150 MB and has every driver we need. ADR-015.

**9. The disk was full.** 980 MB free at the start. Homebrew's cache (3.4 GB) and the
extracted GDBs (1.5 GB) were the recoverable parts. Docker's disk image does not shrink
when data inside it is freed. **Check `df -h` before a bulk ingest.**

**10. `FROM a, b JOIN c ON …` again.** No — this time it was an off-by-one in placeholder
numbering (`$2` where `$1` was meant, because `push` ran before the index was read) and
`pg` needing `::text[]` to type an array parameter. Both found by the filter tests,
which is why the filter tests exist.

### Verified

- [x] Reference box: **504 reports** — identical to Phase 0 REST load
- [x] Reference box holes: 12,387 vs 12,396 — the GDB is dated 14 Sep, the API was read
      19 Sep, and WA gained 863 holes in between. Consistent, not a loss.
- [x] **0 orphan drillholes** statewide — every hole's `anumber` exists in `reports`
- [x] Depth ladder statewide: DD 229 m > RC 65 > AC 45 > RAB 34
- [x] Every hole in the Golden Mile box targets gold (12,396 / 12,396)
- [x] PMTiles served with HTTP 206 Range; whole-of-WA view = 82 KB → 1.2 MB with drop-rate 1
- [x] Facets stack, toggle and clear; all seven filter combos match direct SQL
- [x] Perth box: 119 reports / 838 holes in 252 ms (all-WA query, under 2 s target)
- [x] `npm run build`, `tsc`, `eslint` clean

### Open / not done

- `abstract_full` still NULL everywhere — fetcher is Phase 2
- `RM` / `LD` / `MT` hole codes undecoded — needs a geologist
- No basemap (ADR-010); Protomaps basemap PMTiles would go in the same bucket
- Tiles live in `web/public/` for dev. Prod = R2 (ADR-004), not yet deployed
- The `/api/holes` sampling endpoint still exists as the no-tiles fallback

### Next

- Option 4: publish the cleaned corpus (the transform SQL is most of the work)
- Weekly refresh job (`run_phase1.py` is idempotent; needs a scheduler)
- Deploy: Hetzner + R2, per the cost model

---

## 2026-09-19 (later) — Phase 0 built and verified

### What we did

Built the whole Phase 0 loop: SLIP REST → Python ingest → PostGIS → Next.js API →
MapLibre → draw a box → cited brief.

```
docker compose up -d                       # PostGIS 3.5, schema auto-applied
cd ingest && ./.venv/bin/python run_phase0.py --reset
cd web && npm run dev
```

### The result

**357,483 drillholes** and **10,899 reports** (from 56,318 polygons) for the 1°×1°
Kalgoorlie box, loaded in **5.5 minutes**.

**The cross-check that matters:** `DATA.md` recorded 12,396 drillholes for the box
121.40–121.55°E, 30.70–30.80°S, measured directly against the live API. Our full
pipeline — paginate, clean, normalise, load, spatially query — returns **12,396**.
Exact. Nothing was lost or duplicated end to end.

Second sanity check: the top operator for that ground is **Kalgoorlie Consolidated Gold
Mines**, 98 reports, 1971–2019. KCGM runs the Super Pit. That is the right answer, and
it is the kind of thing a local geologist checks first.

### What we learned

**1. The 1753 dates are a sentinel, not corruption.** The quarantine caught 452 reports
with `report_year = 1753`. Their titles said "Mar 1987", "Annual report (1989)",
"01/01/97 - 30/06/98". **1753 is SQL Server's `datetime` minimum** — it is how upstream
NULLs were stored. `date_from` recovers the true year for **451 of 452** (99.8%).

*Lesson: quarantine rather than drop. Had we silently nulled these we would never have
looked at them, and we would have lost 451 real dates. The reject table paid for itself
within an hour of existing.*

**2. Holetype codes are 4-char abbreviations, and two of them are not exploration.**
The raw values are `AUG`, `UNKN`, `PERC`, `WAT`, `COST`, `SON` — not the full words. Two
matter for correctness: **`WAT` is a water bore and `COST` is a costean (a surface
trench, not a hole at all)**. Counting them as exploration drilling inflates "how much
work happened here". They are now excluded from drilling totals and shown separately.

*Lesson: look at the actual distinct values before writing the mapping. A 52,000-row
"OTHER" bucket is a question, not a category.*

**3. The normalisation validated itself.** Average depth by method came out
DD 192 m, RC 76 m, AC 47 m, RAB 42 m — exactly the cost/confidence ladder described in
the [orientation doc](00-orientation/01-what-is-mineral-exploration.md), which was
written before any data was loaded. Independent confirmation that the mapping is right.

**4. `FROM a, b JOIN c ON ...` does not mean what it looks like.** Postgres parses it as
`a, (b JOIN c ON ...)`, so `a` is **not in scope** inside the ON clause. Five queries
failed with `invalid reference to FROM-clause entry for table "rg"`. Fix: put the real
joins first and `CROSS JOIN aoi` last.

**5. One `pg` client cannot run concurrent queries.** `Promise.all` over nine queries
sharing a `TEMP TABLE` silently queued them and emitted a deprecation warning —
removed in `pg@9`. Made sequential; still ~300 ms.

### The debugging session worth reading

The map rendered nothing: blank canvas, no error. Four hypotheses, in order:

1. **Basemap CDN blocked?** No — `fetch` returned HTTP 200 from the page.
2. **WebGL unavailable?** No — WebGL 2.0 present.
3. **MapLibre's worker 404ing?** **Yes, and this one was real.** MapLibre v6 resolves
   its worker with `new URL("./maplibre-gl-worker.mjs", import.meta.url)`, which under
   Next points into `/_next/static/chunks/` where no such file exists. Next serves its
   HTML 404 page, and the browser rejects it: *"Failed to load module script:
   non-JavaScript MIME type text/html."* Fixed by serving the worker from `public/`
   (ADR-012). This would have broken tiles in a real browser too.
4. **Still blank.** `map.isStyleLoaded()` was `false` even for a trivial inline style
   with no sources at all — which ruled out the network entirely. The actual cause:

```js
document.visibilityState  // "hidden"
requestAnimationFrame     // never fires
```

**The preview tab was hidden, so `requestAnimationFrame` was suspended, so MapLibre
never rendered its first frame, so the style never finished loading.** Nothing was
wrong with the map. Confirmed by polyfilling rAF with `setTimeout` and forcing a
remount: style loaded, 11,914 holes rendered, `/api/holes` fired.

*Lessons, and the second is the real one:*

- *Check the environment before the code. `document.visibilityState` would have cost
  ten seconds at the start and saved most of that session.*
- ***Two of the four "fixes" were for problems that did not exist.*** The worker 404 was
  genuine. Dropping the external basemap (ADR-010) was triggered by a misdiagnosis —
  the basemap was fine. The reasoning for self-hosting still holds, but it is worth
  being honest that the decision was reached by accident rather than by design.
- *The bug did surface one genuine defect: gating layer setup on MapLibre's `load` event
  means a user opening the app in a **background tab** gets a permanently empty map,
  because `load` waits for a frame that never comes. Now set up on `styledata`
  (ADR-011). A real user-facing bug, found only because the environment simulated it.*

### Verified

- [x] `docker compose up` → PostGIS 3.5 with schema applied
- [x] Paginated ingest past the 10,000-record cap (36 pages of drillholes)
- [x] 12,396 holes in the reference box — exact match with `DATA.md`
- [x] 5.17× polygon dedupe confirmed on the full load
- [x] Draw a box → brief in **676 ms** (target: under 2 s)
- [x] Zero-LLM brief: counts, metres, controlled vocabulary, operators, gaps
- [x] "What is missing" section: gap decades, confidentiality lag, collars-only
- [x] Every report row links to its A-number at the source
- [x] CC BY attribution in the UI and in the brief footer
- [x] `npm run build` clean; `tsc --noEmit` clean

### Not done / known limits

- **Map display is sampled** (12,000 points max, deterministic striding). All *numbers*
  come from PostGIS. PMTiles in Phase 1 removes the cap.
- **No basemap** — see ADR-010.
- **Rectangle draw only.** Free polygons in Phase 1.
- **The API accepts any polygon**, including outside the loaded box, and will honestly
  return zeros. The panel says the coverage area; it does not yet refuse out-of-area draws.
- **Full abstracts not fetched yet** — `abstract_full` is still NULL. The brief uses the
  250-char truncation. Deciding ADR-007 (check DASC bulk first) comes before writing a fetcher.

### Next

- Check whether the DASC bulk WAMEX download carries untruncated abstracts (decides ADR-007)
- Phase 1: bulk ingest all of WA, tippecanoe → PMTiles, free polygon draw
- Investigate layers 35–37 (430,553 "Historical Exploration Activity" features)

---

## 2026-09-19 — Research and verification, before writing any code

### What we did

Re-verified every claim in `DATA.md` against the live API, then researched the competitive
landscape before committing to a build.

### What we found

**1. The endpoints work, and the data is alive.** Layer 28 went from 3,465,810 (16 Sep) to
**3,466,691** (19 Sep) — **+881 holes in three days**. The weekly refresh in `DATA.md` is
real, measured, not just documented.

*Lesson: re-run the verification, don't trust the doc. Three days was enough for a number
to move.*

**2. The core assumption was half wrong.** `BUILD.md` §2 calls the populated `abstract`
field "the unlock." It's `varchar(250)`, **hard-truncated mid-word**, empty for 14.2% of
rows. Measured: min 0, median 250, **max exactly 250** — a ceiling, not a distribution.

*Lesson: when every value tops out at a round number, that's a schema constraint, not
data. Checking the distribution took one query and saved building on sand.*

**3. But the real corpus is better than promised.** `dpxe_abs` holds a URL to the full
abstract — 900–1,200 chars of dense GSWA-written prose with hole counts, metres by method,
plant throughput, prospect names, and recommendations. Later reports follow a visible
`Location: / Geology: / Work Done: / Result:` template.

*Lesson: the finding that broke the assumption also fixed it. Keep pulling the thread.*

**4. `keywords` is a controlled vocabulary — and it changes the build order.** 157 distinct
curated terms, **98.8% coverage**. This means a genuinely useful, fully factual brief can
be built with **no LLM at all**. A `GROUP BY` cannot hallucinate.

*Lesson: the safest path and the cheapest path turned out to be the same path. That's
usually a sign you've found the right shape.*

**5. 5.3× polygon duplication.** 2,648 rows → 504 unique A-numbers. Every report count
needs `COUNT(DISTINCT anumber)` or it's wrong by 5×.

*Lesson: always check rows-vs-entities before trusting a count.*

**6. Bad data is present.** `report_year` ranges 1753–2024. Validate and quarantine.

**7. Someone already built our Phase 2.** [NextMaps](01-research/03-competitive-landscape.md)
ships polygon → cited AI desk study, including the A-number citation mechanism we'd
identified as our moat, plus assays, hyperspectral and native title. $200/mo.

*Lesson: this is the one that stings, and it's the one that most justifies the day of
research. Finding it now cost a day. Finding it in three months would have cost three
months.*

### What we built

The `docs/` tree — orientation, verified research, architecture, concepts.

### Open questions

- [ ] Does the **DASC bulk download** carry untruncated abstracts? (Decides ADR-007)
- [ ] How big is the full keyword vocabulary statewide? (157 in one box)
- [ ] What are layers **35–37** (430k "Historical Exploration Activity" features)? Not
      mentioned in `BUILD.md` at all
- [ ] Do SA/QLD/NT have abstracts of comparable quality? (Decides Option 1)

### Next

Phase 0: one Kalgoorlie box → local PostGIS → MapLibre → draw a box, count holes.
Build it as the learning vehicle regardless of where the product lands.

---

## Template for future entries

```markdown
## YYYY-MM-DD — <what this session was about>

### What we did
### What broke / what surprised us
### What it taught
### Open questions
### Next
```

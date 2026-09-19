# Learning log

Session by session: what we did, what broke, what it taught. Newest first.

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

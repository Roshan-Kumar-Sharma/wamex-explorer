# Learning log

Session by session: what we did, what broke, what it taught. Newest first.

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

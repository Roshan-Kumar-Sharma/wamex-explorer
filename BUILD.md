# Build Instructions

Read `DATA.md` first — every endpoint, schema and count there is verified working as of 16 Sep 2026.

---

## 1. What you are actually building (and the honest problem)

**The naive version is "WAMEX on a map." Do not build that. It already exists.**

DMIRS/DMPE already ships GeoVIEW.WA, the DASC portal, and the WAMEX search system. A map with dots
on it is not a product — it is a worse copy of a government service that is already free.

**The real pain is not finding the data. It is synthesis.**

A geologist evaluating a piece of ground has to answer: *what has already been done here, by whom,
when, and what did they conclude?* Today that means finding 40 reports spanning 1974–2009, opening
each PDF, and reading. That is two to three days of work, and it is done from scratch by every
person who ever looks at that ground.

**So the product is: draw a polygon → get a written ground history.**

The map is the input device, not the output. The output is a document. This matters for three reasons:

1. A document is **shareable** — a geologist sends it to their boss, the boss asks where it came from. That is the viral mechanism.
2. A document is **screenshot-able** on LinkedIn, where this audience lives.
3. A document is **differentiated** — the government will never build it.

Working names: *Priorwork*, *Groundtruth*, *Precedent*. Pick something that sounds like the output,
not like the database.

---

## 2. The unlock that makes this cheap

**Layer 22's `abstract` field is plain text and already populated across 615,050 reports.**

You do not need to OCR a single PDF to ship something genuinely useful. 615k abstracts is already a
corpus. PDF retrieval is Phase 3, and even then only on demand for the handful of reports inside a
user's polygon — never a bulk index.

This single fact takes the project from "six-month data engineering slog" to "shippable in a month."

---

## 3. Architecture

**Do not query SLIP live on every user request.** It is slow, capped at 10,000 records, and you'd be
hammering a government service. Ingest once, serve your own.

```
DASC bulk download (GDB/SHP)  ──weekly──►  PostGIS
                                             │
                        ┌────────────────────┼────────────────────┐
                        ▼                    ▼                    ▼
                  PMTiles (static)     polygon query API      LLM brief job
                  3.4M points          holes + reports        cites anumbers
                        │                    │                    │
                        └──────────► MapLibre GL + deck.gl ◄──────┘
```

**Stack:**
- **PostGIS** — the whole thing is spatial joins; nothing else is appropriate
- **PMTiles** for the 3.4M drillhole points — a single static file, no tile server, cheap hosting. Generate with `tippecanoe`.
- **MapLibre GL JS** + **deck.gl** for rendering. Free, no Mapbox billing.
- **Node/TypeScript** API (plays to your MERN strength) or FastAPI if you'd rather stay in Python near `mineio`.
- LLM calls **on demand only**, never batch across 615k records.

Budget target: **under $20/month.** Static PMTiles + a small Postgres + serverless functions + pay-per-call LLM. Keep it there — you are jobless and this must not become a bill.

---

## 4. Phases

### Phase 0 — prove the pipeline (one weekend)
- Paginate layer 28 for **one 1°×1° box around Kalgoorlie** via the REST API (see `DATA.md` for the working query)
- Load into local PostGIS
- Render with MapLibre
- **Success:** you can draw a box and count holes inside it

Do not scale up until this works end to end.

### Phase 1 — the fast map (weeks 1–2)
- Bulk download full WA drillholes + WAMEX report polygons from DASC
- PostGIS ingest with `extract_date` tracking; split `target_commodity`; convert epoch dates
- `tippecanoe` → PMTiles for all 3.46M points
- Polygon draw tool → returns holes and intersecting reports as a table
- Facets: commodity, hole type, decade, operator, depth range
- **Ship this.** It is useful on its own, purely because it is fast. Speed alone is a reason to switch off a government portal.

### Phase 2 — the ground history brief (weeks 3–4) ← *this is the product*
For a drawn polygon:
- Pull all intersecting reports with abstracts, all holes, all operators
- Generate a structured brief:
  - **Exploration timeline** — who worked this ground, when, targeting what
  - **Drilling summary** — hole counts by type and decade, depth distribution, spatial coverage gaps
  - **Commodity focus over time** — what people were looking for, and when that changed
  - **Report inventory** — every anumber, linked, with its abstract
  - **What was never tested** — the most valuable section, and the one nobody else can generate
- Permalink per brief. Shareable. Attribution footer.

### Phase 3 — deep retrieval
- On demand, for the ~20 most relevant reports in a polygon, fetch the actual PDF, extract text, summarise
- Strictly on demand. Never bulk index.

### Phase 4 — export, via `mineio`
- Export selected holes as CSV / OMF / IREDES using your own library
- Coordinates are WGS84 in the source; **convert to MGA on export** — the exact trap `mineio` exists to handle
- The two projects now feed each other: this app is `mineio`'s showcase, `mineio` is this app's export engine

---

## 5. The risk that can kill this

**LLM hallucination in front of an expert, adversarial audience.**

Geologists will test this on ground they know personally. One fabricated claim in a screenshot and
the product is dead — this community is small and talks.

**Non-negotiable rules:**

1. **Every factual claim cites its `anumber`**, linked, traceable to source text. No exceptions.
2. **Never generate a sentence that isn't grounded in retrieved text.** If the abstracts don't say it, the brief doesn't say it.
3. **Separate "what the data shows" from "what the reports claim."** Hole counts are facts from the database. Geological conclusions are *someone's 1983 opinion* and must be attributed as such — "Company X reported..." never "the ground contains..."
4. **Say what is missing.** "No reports found for 1990–2004" is more valuable and more trustworthy than a confident summary of nothing.
5. **Never imply economic or investment conclusions.** You are summarising public records, not advising on prospectivity.

Build the citation mechanism in Phase 2 from day one. Retrofitting trust is impossible.

---

## 6. Honest risk register

| Risk | Reality | Mitigation |
|---|---|---|
| Government already has a viewer | True, and free | Compete on speed + synthesis, never on "it's a map" |
| No assays in layer 28 | Confirmed — collars only | Don't promise assays in v1; geochemistry is a separate phase |
| LLM hallucination | Fatal with this audience | Citation-or-silence, see §5 |
| Weekly data updates | Real | Scheduled refresh keyed on `extract_date` |
| Cost creep from LLM calls | Real | On-demand only, cache briefs by polygon hash |
| Endpoints move | Department renamed twice already | One config file for all base URLs |
| Nobody uses it | The default outcome | See §7 — distribution is the actual work |

---

## 7. Distribution — this is the real work

Building it is the easy half.

1. **Pre-generate briefs for famous WA ground** — Kalgoorlie Super Pit, Boddington, Tropicana, Mt Keith. Publish them as public permalinks. Every WA geologist knows this ground and will immediately check your output against what they know. If it holds up, you have instant credibility; these are the links that travel.
2. **Post in SWUNG Slack as a question**, not an announcement: *"I've been pulling apart the WA open-file data — does this match how you'd actually approach ground assessment?"* Questions get replies; launches get ignored.
3. **LinkedIn** is where this audience actually is. One post showing a brief for ground everyone recognises.
4. **AusIMM Bulletin / Coring Magazine** for a written piece later.
5. **Perth angle** — this is a Perth product for a Perth audience, in the city you want to move to. Say so.

---

## 8. Definition of done for v1

- Draw a polygon anywhere in WA, get holes + reports in **under two seconds**
- Generate a ground history brief with **every claim cited to an anumber**
- Shareable permalink
- CC BY attribution visible in UI and on every export
- Runs for under $20/month
- Three pre-generated briefs for well-known deposits, public

If you hit that, you have the most useful free tool in WA exploration — and something no generalist
developer portfolio can match.

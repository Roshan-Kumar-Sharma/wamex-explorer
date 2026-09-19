# What a geologist needs from this — user research, ongoing

*Started 19 Sep 2026. A running document: each session adds what it learned about how the
people who will use this actually work, what they complain about, and what that means for
the build. Roshan is not from the industry; this is how we compensate. Sources at the end.*

---

## 1. The finding that reframes the product

The department's own reporting guideline (gazetted 16 Oct 2025) prescribes the structure of
every mineral exploration report lodged in WA. The mandatory section headings are:

> A) Bibliographic data sheet · B) Table of contents · C) Introduction · D) Location and
> access · E) Tenement details · F) Geology · **G) Previous exploration activities** ·
> H) Current exploration activities · I) Conclusions and recommendations · J) List of
> references · K) Appendices

And for section G, verbatim:

> "Include a brief history of all exploration that has taken place in the area where the
> tenement/s is located – both by the current holder and previous explorers where known.
> **A table format is acceptable.**"

Roughly 80,000 annual reports and 28,000 surrender reports each contain a section G. Every
one was compiled by a geologist reading WAMEX. **Our document is section G, generated.**
That is a much sharper description of what we built than "a ground history brief", and it
tells us what the output must look like: a table a geologist could paste into their own
report, with every row traceable to an A-number — because their report will be checked by
the department and by the next geologist.

**Implications**
- Offer the timeline as a **copyable table** (and CSV/Markdown export) in the exact shape a
  section G expects: period · company · tenements · work done · results · reference.
- Say so on the page: *"Section G of your next annual report, with citations."*
- The "Work done" column is what we lack most. Pre-2014 GSWA abstracts and post-2014
  structured abstracts both carry it (`Work done:` / the drilling summary table). Fetching
  abstracts is therefore not a nicety — it fills the column geologists need.

## 2. Exact rules we were paraphrasing

From the same guideline; the brief should state these, not "a statutory period":

- **Annual reports** are confidential for **five years**, then eligible for open file under
  regulation 96(4) (the "Sunset clause") — or three months after the tenement is
  surrendered, forfeited, expired or cancelled, whichever is earlier.
- **Surrender and partial-surrender reports** go open file **three months** after surrender.
- Coordinates: **GDA2020 / MGA** mandatory now; GDA94 and AGD84/AMG in older data. Column
  headers differ by datum (`MGA_N` vs `AMG_N`) — a trap for anyone merging old collar files.
- Post-2014 abstracts follow a department template: **Location · Geology · Work done ·
  Results · Conclusions**, plus a **Drilling summary** table, a **Surface geochemistry
  summary** table and a **Surveys completed** list. Structured data we can parse.

So the "Confidential work" bullet in the document should read: *"Annual reports stay
confidential for five years (or until three months after surrender); surrender reports are
released three months after surrender. Work from the last five years on live ground is
therefore mostly absent."* Applied 19 Sep 2026.

## 3. What the competitors' pages teach about presentation

Two WA startups now sell polygon/tenement → cited history (see
[03-competitive-landscape.md](03-competitive-landscape.md)). We are not competing (ADR-008)
but their free pages show what this audience responds to:

| Device (NextMaps tenement page) | Why it works | Our equivalent |
|---|---|---|
| "27 WAMEX reports **vs WA median 53**" | A count means nothing alone; a baseline turns it into a judgement the reader makes themselves | Compute statewide/regional baselines: reports, holes, metres per km² for *drilled* ground; show "this area vs WA median" |
| "11 of 27 reports contain drilling" | Tells you how much of the archive is *data* vs *words* | We have it: holes per report via `anumber` |
| **% of tenement each report covers** | Relevance cue: a regional report at 100% vs a prospect report at 2% | `ST_Area(ST_Intersection(rg.geom, aoi)) / ST_Area(aoi)` per report — cheap |
| Organised **by tenement** (E 47/5068) | Geologists think in tenements, not polygons | Add SLIP layer 3 (Mining Tenements); "select a tenement" as a draw mode |
| Timeline by decade | Same as ours | ✓ |
| "Verify against primary sources before reliance. Data as at 2026-09-18." | Trust through humility; a dated snapshot | We print data version; add the verify line |
| Free tier = register + history; paid = signals | The history is the hook, not the product | Consistent with ADR-008: ours stays free |

Canetoad.ai's framing, worth keeping on a sticky note:

> "WAMEX is an archive. It is not a working exploration model." …
> "The reader becomes the integration layer. That is where time disappears." …
> "Keep uncertainty visible and original reports accessible."

**Implications**
- Baselines and per-report coverage % are the two cheapest, highest-value additions.
- Tenement selection is the biggest UX gap; it needs layer 3 verified first (DATA.md lists
  it, count unverified).
- "Uncertainty visible" is already our stance (section 5); keep it the *first* thing a
  sceptic sees, not the last.

## 4. How the work is actually done (workflow, from the sources)

1. **Start from a question, not a download.** "Is this ground worth pegging?" "Why did the
   last three holders leave?" "Has anyone drilled below 100 m here?" The tool should make
   these one-click: filters already do commodity/method/depth; add "surrender reports only"
   and "reports with drilling only".
2. **Plot the old collars against the current picture.** The map with hole types by colour
   is exactly this. Missing: the ability to see *one report's* holes highlighted.
3. **Verify coordinates.** Old data mixes AGD84/AMG and GDA94/MGA; a 200 m shift is the
   classic error. We only have WGS84 collars from the department (already converted), but
   the export (Phase 4, `mineio`) must state datum and zone on every file.
4. **Separate old interpretations from mapped evidence.** Our rule 3 in CLAUDE.md. In UI
   terms: hole counts and metres are one visual register (facts); abstract text is another
   (quoted, attributed).
5. **Keep the original report one click away.** Every A-number links to the department's
   record. Keep it that way in every export too.

## 5. What "amazing" means to this audience

Working assumptions, to be tested against real geologists (SWUNG, LinkedIn — BUILD.md §7):

- **Density over decoration.** They read drill logs. Tables, tabular numbers, small type,
  no hero images. The document already leans this way; resist "dashboard" styling.
- **The gaps are the product.** A page that says "nothing below 50 m in 40% of this ground,
  no report 1940–1959, no lithium ever listed" earns more trust than one that only lists
  what exists — because it proves we looked.
- **Speed is a feature they will remark on.** GeoVIEW.WA is slow. 300 ms for a polygon is
  a talking point; keep the 1° box under 2 s too.
- **Never a sentence they can catch out.** One fabricated number on a screenshot ends it.
  Templated prose and verbatim abstracts (ADR-021) are the guarantee; keep it.
- **Export beats display.** They will want the timeline in their report, the collars in
  their GIS, the A-number list in a spreadsheet. CSV/GeoJSON/Markdown before anything
  fancier; OMF/IREDES via `mineio` later.
- **Print matters.** Briefs get printed for meetings and attached to emails. The print CSS
  exists; test it on a real printer-PDF.

## 6. Backlog derived from this document

Ordered by value ÷ effort, as of 19 Sep 2026:

1. Exact confidentiality wording in section 5 — *done 19 Sep*.
2. Per-report **% of polygon covered** and footprint size in the inventory — *done 19 Sep*.
   Still open: a sort-by-coverage option.
3. **Baselines** — *done 19 Sep* as percentile curves over drilled 2/5/10/25 km squares
   (`sql/021_baselines.sql`), cell size matched to the area's scale. Regional (map-sheet)
   baselines still open.
4. **Section G export** — *done 19 Sep*: `/api/briefs/:id/timeline.csv|timeline.md|
   reports.csv|brief.md|holes.geojson`, all with attribution.
5. **Tenements**: verify SLIP layer 3 and DASC bulk tenements; "select tenement" mode;
   show tenement outlines under the polygon; live tenement numbers in the header.
6. Parse the abstract page's **Drilling summary / Surface geochemistry / Surveys** tables
   into columns — structured per-report "work done".
7. Filters: "surrender reports only", "reports with drilling only".
8. Highlight one report's holes on the map from the inventory.
9. Ask three geologists to check the four seeded briefs against what they know. Their
   corrections become the next version of this document.
10. **Operator-name normalisation.** `WESTERN MINING CORPORATION LTD` / `Western Mining
    Corporation Limited` / `WMC RESOURCES LTD` are one company to a reader; and the
    string differs between the report and drillhole tables, so hole counts by operator
    are undercounted. Normalise for grouping, keep the raw string for citation.

---

## Sources

- DMPE, *Guidelines for Mineral Exploration Reports on Mining Tenements* (gazetted 16 Oct 2025) —
  https://www.wa.gov.au/system/files/2025-10/mineral-exploration-tenements-guideline.pdf
- Discovery Alert, *Western Australia's 2026 Mineral Exploration Data Release Framework* —
  https://discoveryalert.com/western-australia-mineral-exploration-data-transparency-2026/
- NextMaps tenement page, E 47/5068 — https://www.nextmaps.com.au/tenement/e-47-5068
- NextMaps, AI Prospectivity Reports — https://www.nextmaps.com.au/
- Canetoad.ai, *Make WAMEX work for research* (9 Jun 2026) —
  https://www.canetoad.ai/articles/how-to/make-wamex-work-for-research
- GSWA, *125 years of legacy data at the Geological Survey of Western Australia* —
  https://www.sciencedirect.com/science/article/pii/S2214242815000236
- DMPE, WAMEX — https://www.dmp.wa.gov.au/WAMEX-Minerals-Exploration-1476.aspx

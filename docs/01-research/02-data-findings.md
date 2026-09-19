# Data findings that change the build plan

Five findings from the [verification log](01-verification-log.md), ordered by how much
they change what we do.

---

## Finding 1 — the abstract corpus is better than promised, but harder to get

### What `BUILD.md` assumed

> "Layer 22's `abstract` field is plain text and already populated across 615,050
> reports... This single fact takes the project from a six-month data engineering slog to
> shippable in a month."

### What is actually true

The spatial layer's `abstract` is **`varchar(250)`, hard-truncated mid-word**, and empty
for 14.2% of rows. As a synthesis corpus it is close to useless — you get a title
restatement and then the text stops.

**But** the `dpxe_abs` field holds a URL to the full abstract, and the full abstracts are
outstanding. This is A38628 in full:

> Mount Monger gold project was 50 km southeast of the city of Kalgoorlie on the Kurnalpi
> and Widgiemooltha 1:250 000 map sheets. Exploration from 1992 to 1993 included auger
> drilling and sampling (5646 holes for 5646 m), aerial magnetic surveys, colour aerial
> photography, photogrammetry, geophysical interpretation, aircore (339 holes for 12 405 m)
> and RC (547 holes for 30 839 m) drilling. New tenements were acquired to provide
> additional ore supply to the CIP plant that treated 550 000 t @ 2.6 g/t Au. Additional
> mineable resources were defined and new targets generated. Exploration on fourteen
> prospects were reported in volumes 3 to 16. Further soil sampling and drilling were
> recommended. Prospects: Baguss; Brays Toil; Caledonia; Dinnie; Eland; Fingalls; ...

Look at what is in there: **hole counts, metres drilled by method, plant throughput and
head grade, prospect names, and explicit recommendations.** These are written by GSWA
geologists in a consistent house style. Later reports follow a visible template:

```
Location: ... Geology: ... Work Done: ... Result: ... Conclusions: ...
```

That structure is a gift — it means targeted extraction rather than open-ended
summarisation, which is both cheaper and far less hallucination-prone.

### What this changes

| | Before | After |
|---|---|---|
| Corpus source | layer 22 `abstract` field | per-A-number fetch via `dpxe_abs` |
| Corpus quality | assumed good, actually fragments | **genuinely excellent, ~900–1,200 chars** |
| Acquisition cost | free with the bulk pull | **615k HTTP fetches** (or a DASC bulk file) |

**Action:** before writing any scraper, check whether the DASC bulk WAMEX download
carries the untruncated abstract. A one-off file beats 615k requests against a government
server. If it doesn't, fetch lazily — only for A-numbers inside a user's polygon, cached
permanently. Never bulk-scrape 615k URLs; it's rude, slow, and probably rate-limited.

> **Etiquette note:** this is a free public service run by a government department. Rate
> limit, set a real User-Agent with contact details, and prefer bulk downloads. Getting
> blocked would end the project.

## Finding 2 — `keywords` is a controlled vocabulary, and it's the zero-risk backbone

157 distinct terms in one test box; **98.8% of reports carry them.**

```
Drilling; Auger drilling; RC drilling; Geology; Aerial colour photography;
Photogrammetry; Mine production; Geophysics; Aerial magnetic surveys
```

This is a **curated taxonomy of exploration activity**, and it is almost completely
overlooked in `BUILD.md`.

### Why it matters more than the LLM

`CLAUDE.md`'s hardest constraint is *citation or silence*. Keywords let you make a large
class of factually complete statements with **no language model in the loop at all**:

> Between 1971 and 2024, 504 reports cover this ground. Recorded activity includes RC
> drilling (180 reports), diamond drilling (152), soil sampling (76), IP surveys (26) and
> gravity surveys (26). 25 reports record no exploration conducted.

Every number there is a `GROUP BY` over a curated field. It cannot hallucinate. It is
also genuinely useful — which means **a defensible, trustworthy v1 needs no LLM
whatsoever.** Ship that first; add generated prose later as an explicitly-labelled layer
on top of a factual base.

This inverts the build order in `BUILD.md`, and it inverts it in the safer direction.

## Finding 3 — 5.3× polygon duplication

```
2,648 polygon rows  →  504 unique anumbers
```

One report covers many tenements; layer 22 stores one row per polygon.

**Every user-facing count must be `COUNT(DISTINCT anumber)`.** Reporting "2,648 reports"
over-counts by 5× and would be spotted instantly by anyone who knows the ground. In a
product whose entire value proposition is trust, that is a fatal-class bug.

Schema consequence: split into `reports` (one row per A-number) and `report_geometries`
(many rows, FK to A-number). Don't mirror the flat API shape.

## Finding 4 — real data-quality defects exist

`report_year` ranges **1753–2024** in the Kalgoorlie box. 1753 is ~130 years before WA's
gold rush.

Ingest must validate and quarantine rather than pass through. Build a
`rejected_rows` table from day one; a visible reject count is a quality signal, and
silently charting a 1753 data point in a "exploration through time" histogram is the kind
of thing that ends a demo.

## Finding 5 — assays are obtainable after all (but heavy)

`DATA.md` says layer 28 is collars-only. True. But
**[wamexgeochem.net.au](https://wamexgeochem.net.au/)** (Expedio, for GSWA, May 2026
release) publishes harmonised open-file geochemistry as **Postgres backups: 56.7 GB
downhole, 4.1 GB surface.**

So the position becomes:

- ✅ Still correct: **don't promise assays in v1** — it's a separate ingest with real
  complexity (unit harmonisation, detection limits, QA/QC)
- ❌ Now outdated: "assays aren't available"
- ⚠️ Their own warning: **no quality control on the assay values**; units must be verified
  against original reports. Anything we surface from it inherits that caveat, verbatim.

The 4.1 GB **surface** geochemistry file is the tractable one. Start there if we go this
way, not the 56.7 GB downhole set.

---

## Summary of changes to the plan

| # | Finding | Effect |
|---|---|---|
| 1 | Abstract truncated at 250; full text behind per-report URL | Corpus acquisition is now a real task, not free |
| 2 | `keywords` is a 98.8%-complete controlled vocabulary | **Ship a factual v1 with no LLM at all** |
| 3 | 5.3× polygon duplication | `COUNT(DISTINCT anumber)` everywhere; split the schema |
| 4 | `report_year` = 1753 exists | Validate + quarantine on ingest |
| 5 | Geochemistry downloadable (56.7 GB / 4.1 GB) | Assays are a Phase, not an impossibility |

---

**Next:** [03-competitive-landscape.md](03-competitive-landscape.md)

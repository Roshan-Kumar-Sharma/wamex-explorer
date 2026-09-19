# Reading a WAMEX abstract

*Written during Phase 2, when the brief started quoting abstracts and we had to know what
we were quoting.*

## What an A-number is

Every report a company lodges with the department under the Mining Act gets an accession
number — **A12345**, the `anumber` in our tables. It is the primary key of the whole
system: a drillhole's `anumber` says which report it was drilled for; a report's polygon
says which tenements it covered. One A-number is one document, lodged once. It never
changes and it never gets reused.

The web page for a report is `wamex.dmp.wa.gov.au/Wamex/Search/ReportDetails?ANumber=12345`.
Everything the brief says links there.

## The seven report types

Measured across all 118,834 open-file reports (Phase 1 load):

| Type | Reports | What it is |
|---|---|---|
| **Annual** | 79,540 | The statutory yearly report on a live tenement. What was done this year, what it found, what is planned. Most of the archive. |
| **Final Surrender** | 18,809 | Filed when the tenement is given up. Often the most useful document on a piece of ground: it has to summarise *everything* done over the tenement's life and say why it was dropped. |
| **Non-statutory** | 10,241 | Lodged voluntarily or under other arrangements — company data submissions, old mine records, consultants' reviews. |
| **Partial Surrender** | 9,114 | Part of the tenement dropped; the report covers the dropped ground. |
| **Co-Funded Drilling** | 840 | Drilling half-paid by the government's Exploration Incentive Scheme (EIS). Condition of the grant: the results go open-file fast. |
| **Core Library Drilling** | 265 | Core submitted to the GSWA core library in Perth (Carlisle). Physical rock you can go and look at. |
| **Co-Funded Geophysics** | 25 | EIS-funded surveys. |

The domain signal in the type: a **Final Surrender** report on your ground means someone
stopped, and the report says why. A run of **Annual** reports means someone kept paying rent.

## Confidentiality — why recent work is missing

A report is confidential when lodged. It becomes **open-file** (public) after a statutory
period, or when the tenement is surrendered, whichever is earlier. Practically: the latest
open-file work on a live tenement is usually a few years behind what the company actually
did. The brief states the latest `date_released` for the polygon for exactly this reason —
"latest open-file release here: 2026-05-04" tells the reader how current the record can be.

## Two generations of abstract

This is the finding that changed Phase 2. There are two kinds of abstract in WAMEX, and
the bulk data carries neither properly.

### Before ~2014: GSWA-written

Department geologists (GSWA, the Geological Survey of WA) read each report and wrote a
one-paragraph abstract. They are terse, uniform and excellent:

> The Lady Gladys project (GML30/1360 and GML30/1388) was on the Menzies 1:250 000 map
> sheet. Geology was not discussed. Exploration for gold from January 1993 to December
> 1993 comprised 4122 m of vertical RC grade control drilling within the Lady Gladys North
> Laterite pit and Lady Gladys North Saprolite pit. Drill details were not presented or
> discussed.
> Prospects: Lady Gladys
> Assays: Au
> — A40846, verbatim

Note the house style: map sheet, whether geology was discussed, what was done with
quantities, what was *not* presented. The two trailing lines — **Prospects** and
**Assays** — are structured: named prospects, and the elements assayed for (`Au` = gold).

In the bulk export this text is prefixed with the microfilm item number and a generated
header — `M3575/3: Mulline gold exploration: (Annual Report) (1/1/1993-1/12/1993)` — and
**cut at 250 characters**. 35,592 abstracts (30%) hit the limit.

### After ~2014: company-written, structured

GSWA stopped writing abstracts around 2014. Coverage in the bulk field falls from 94%
(2010–14) to **3–5%** (2015 onward): **26,760 reports** since 2015 have no abstract in
the bulk data at all.

But the per-report page has one. Companies now write their own, and the department's form
imposes a structure:

```
Location: …
Geology: …
Work Done: …          ← programmes, hole counts, metres
Results: …            ← actual intercepts: "6 metres @ 5.36 g/t Au from 236 m"
Conclusions & Recommendations: …
Prospects: …
Assays: Au
```

A138136 (Paddington Gold, 2024) runs to ~7,000 characters and lists every drilling
programme with its best intercept. This is most of what `BUILD.md` Phase 3 wanted to get
from PDFs — available as text, without a PDF, one HTTP request per report.

## Where the full text lives, and how we fetch it

`reports.url_abstract` → `…/WAMEX/ExternalTool/CreateReportAbstractDialog?aNumber=N`. A
server-rendered HTML fragment: a REPORT INFORMATION table, an ABSTRACT div
(`.htmlTextContainer`), a DRILLING SUMMARY table (hole type / count / metres), and
usually-empty geochemistry and survey summaries.

We fetch it **only for reports someone is reading**, one request at a time with a 600 ms
gap and a User-Agent that identifies the project, and cache the text forever in
`reports.abstract_full` (ADR-007, ADR-020). A failed fetch is recorded and not retried for
a week. 119k requests against a free government service would be the fastest way to end
the project.

## How to read the brief's inventory with this in mind

- **Short abstract, under 245 chars, pre-2014** — that *is* the whole GSWA abstract minus
  the Prospects/Assays lines. Nothing more to fetch except those two lines.
- **Cut at 250** — the rest is one click away.
- **"No abstract in the bulk data", post-2014** — the click will usually return a long
  structured company abstract with intercepts.
- **Genuinely empty page** — some reports have none. The brief says so rather than filling
  the gap.

Every abstract in the brief is the department's or the company's text, verbatim, with its
A-number. We never paraphrase it (CLAUDE.md: citation or silence).

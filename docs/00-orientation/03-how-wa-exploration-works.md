# How exploration works in WA — the system that generates our data

Every field in our schema exists because of a legal or administrative process. Understand
the process, and the schema explains itself.

---

## 1. The lifecycle that produces a WAMEX record

```
1. Company identifies ground
        │
2. Pegs / applies for a tenement  ─────────►  layer 3 (Mining Tenements)
        │                                     tenid, holder1..9, grantdate, enddate
3. Tenement granted
        │  ┌── obligation: minimum annual expenditure
        │  └── obligation: annual report on work done
        │
4. Company explores  ──────────────────────►  layer 28 (Drillholes)
        │                                     one row per collar, tagged with anumber
        │
5. Files a statutory report ───────────────►  layer 22 (WAMEX reports)
        │                                     one report = an anumber
        │                                     polygon = the tenement area reported on
6. Confidentiality period
        │
7. Report goes OPEN FILE  ─────────────────►  public, CC BY 4.0, in our dataset
        │
8. GSWA geologist writes an abstract ──────►  the corpus our product reads
```

**Step 8 is the one nobody expects and it is the most valuable thing here.** These
abstracts are not machine-generated and not company marketing. A government geologist
read the report and summarised it in a consistent house style. See
[data findings](../01-research/02-data-findings.md).

## 2. Why layer 22 has 615,050 rows but only 118,834 reports

The spatial layer and the DASC bulk file both contain **615,050 rows**. There are only
**118,834 distinct A-numbers**. The average report appears **5.18 times**, never more
than 6.

The first, natural explanation — "one report covers many tenements, so it gets one row
per polygon" — turned out to be **wrong**. When the bulk file was loaded and inspected:

```
108,522 of 108,523 shaped reports have exactly ONE distinct geometry
duplicate rows are byte-identical: same item_no, same URL, same date, same shape
```

They are simply **exact duplicate rows** — almost certainly a one-to-many join left in
the government's export query. Every published "615,050 reports" figure, including the one
this project started with, is counting those duplicates.

**Implications:**

- The real corpus is **~119k reports**, not 615k. Smaller, and still the largest open
  exploration-report set in the country.
- `COUNT(DISTINCT anumber)` is still mandatory everywhere. Reporting "2,648 reports cover
  this ground" when it's 504 is a credibility-level bug, whatever the cause of the
  duplication.
- `report_geometries` holds one MultiPolygon per report. A single report *does* cover many
  tenements — but that shows up as **many parts inside one MultiPolygon**, not many rows.

Look at a real title to see the many-tenements reality:

```
Mount Monger Project, Annual Report (17 vols) for the period 01/05/1992 to 30/04/1993,
E15/317-318; GML26/6912; M25/25; M26/148...M26/417; P25/919...P25/1248; P26/1698...P26/2410
```

One A-number. Seventeen volumes. Dozens of tenements. **One row, one MultiPolygon.**

*The lesson worth keeping: a plausible explanation for a data quirk is not the same as a
verified one. The first explanation fit the numbers and the domain; only loading the
data and checking `count(DISTINCT geometry)` per report showed it was wrong.*

## 3. Why the data is messy — and it is messy

| Mess | Cause | What we do |
|---|---|---|
| `report_year` of **1753** | Data entry error, present in live data | Validate to 1900–current on ingest; quarantine outliers |
| `author_company` sometimes null | Inconsistent capture across 50+ years | Fall back to `operator`; never invent |
| Same company, many spellings | No canonical company register; mergers, renames | Fuzzy-match into a lookup table; keep the raw string |
| `target_commodity` = `COPPER; NICKEL` | Multi-value string, not normalised | Split on `;`, trim, normalise into a join table |
| Dates as epoch **milliseconds** | ArcGIS convention | Convert on ingest |
| `abstract` cut at 250 chars | Field is `varchar(250)` in the spatial layer | Fetch full text separately — [see findings](../01-research/02-data-findings.md) |

**The mess is not incidental — it is 50 years of changing standards, department renames,
and company collapses.** Budget real time for it. In data work the cleaning *is* the work.

## 4. Reporting obligations shape the content

A company must report annually. This has effects you can see in the data:

- **Reports cluster on anniversary dates**, not on when work happened.
- **"No exploration conducted"** is a valid, common report. Our keyword vocabulary has a
  `No exploration` term — 25 hits in one Kalgoorlie box alone. A tenement can be held for
  years with nothing done. **That is a genuine signal of untested ground**, and it is
  computable without any AI.
- **Final / surrender reports** are the richest. When a company gives up ground it files a
  summary of everything it did. `report_type` distinguishes these.
- **Combined reporting** — groups of tenements reported together, which is why polygons
  sprawl.

## 5. Confidentiality — why recent ground looks empty

Reports are confidential for a period after submission before going open file. So:

> **The most recent few years of exploration are largely invisible in this dataset.**

If a user draws a polygon over ground that a junior has been actively drilling since 2023,
our brief may show *nothing recent* — not because nothing happened, but because it is
still closed file. **We must say this explicitly in any generated output.** Silence that
looks like absence is exactly the failure mode `CLAUDE.md` rule 4 warns about.

`date_released` tells us when a report went open file. Compare it to `date_to` to see the
lag, and state the effective data horizon on every brief.

## 6. Who our user actually is

| User | What they need | Willingness to pay |
|---|---|---|
| **Junior explorer geologist** | "What's been done on ground we're considering?" | Company card, if it saves days |
| **Consultant / tenement manager** | Due-diligence packs for clients | Yes — it's billable |
| **Prospector** | Cheap, visual, fast | Low |
| **Investor / analyst** | Screening, verifying ASX claims | Yes |
| **Student / researcher** | Open data, bulk access | No |

The paying workflow is **ground evaluation before an acquisition or pegging decision** —
compressing 2–3 days of PDF reading into minutes. That is a real, expensive, recurring
pain.

It is also, as it turns out, a pain someone is already being paid to solve. See
[competitive landscape](../01-research/03-competitive-landscape.md).

---

**Next:** [../01-research/01-verification-log.md](../01-research/01-verification-log.md)

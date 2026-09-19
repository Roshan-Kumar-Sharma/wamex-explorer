# What mineral exploration actually is

You need this to understand why the data looks the way it does. Skip it and the schema
will feel arbitrary.

---

## 1. The core problem of the industry

Metal is in the ground. You cannot see it. It is almost never on the surface, and where
it was on the surface, someone found it in 1893.

So exploration is **a search problem under extreme uncertainty, where every observation
costs money.** A company spends years and millions narrowing "somewhere in this 500 km²"
down to "this 200 m × 80 m block, 140 m down, at 2.1 grams of gold per tonne."

Roughly **1 in 1,000** early-stage prospects becomes a mine. The other 999 generate
*reports*. Those reports are our dataset. **We are working with a database of
predominantly failed searches** — and that is exactly what makes it valuable, because
knowing what failed is how you avoid repeating it.

## 2. The funnel, and where our data sits

```
  Regional targeting        desk study, maps, government geophysics
        ↓                   cost: $0 – tens of thousands
  Surface work              soil/rock-chip sampling, ground geophysics
        ↓                   cost: tens of thousands
  First-pass drilling       cheap, shallow, wide-spaced (RAB / aircore)
        ↓                   cost: hundreds of thousands
  Infill drilling           RC — the workhorse
        ↓                   cost: millions
  Resource definition       diamond core, close spacing
        ↓                   cost: many millions
  Feasibility → mine        ~1 in 1,000 make it here
```

**Layer 28 (drillholes) captures rows 3–5. Layer 22 (reports) captures all of it.**

Each stage kills most candidates. A company drills 40 RAB holes, sees nothing, walks
away, and files a report. Twenty years later someone else has a new geological model,
re-reads that report, and drills 300 m deeper in the same spot. **That re-reading is the
workflow this project is about.**

## 3. Why an expensive hole is only a "collar" in our data

A drillhole has several distinct data products:

| Data | What it is | In layer 28? |
|---|---|---|
| **Collar** | Where the hole starts: x, y, elevation, total depth | **Yes** |
| **Survey** | How the hole bends as it goes down (azimuth/dip at depth) | No |
| **Lithology** | The rock types logged down the hole | No |
| **Assay** | The lab results — grams per tonne, ppm | No |

Layer 28 is **collars only**. That is not a bug or an oversight — the legal minimum a
company must submit is a validated collar file. Assays "may also be available depending
on the company's submission."

This is why `DATA.md` says *do not promise assays in v1*. You can honestly say
"47 holes were drilled here, deepest 312 m, mostly RC, between 1994 and 2001." You
**cannot** say "grades of 2 g/t were returned" from layer 28. That claim lives in the
report text, or in the separate geochemistry database
([see the findings doc](../01-research/02-data-findings.md)).

Confusing those two is precisely the kind of error that would destroy credibility with
this audience.

## 4. Drilling types, and why the type tells you a story

`holetype` is one of the most information-dense fields in the whole dataset, because
**the method a company chose tells you how confident and how funded they were.**

| Code | Name | Cost | Sample quality | What it means when you see it |
|---|---|---|---|---|
| **RAB** | Rotary Air Blast | cheapest | poor, contaminated | Early, wide reconnaissance. "We're guessing." |
| **AC** | Aircore | cheap | fair | First-pass geochemical targeting through cover. |
| **RC** | Reverse Circulation | mid | good | The workhorse. "We think something is here." |
| **DD / DDH** | Diamond Drilling | expensive | excellent — solid core | "We're serious." Used for resource definition and structure. |
| **RCD** | RC with diamond tail | mixed | RC then core at depth | Cheap to the target, precise at it. |
| **Rotary / Auger** | | cheap | poor | Often water bores or shallow soil work. |

**Read this as a sequence.** A block of ground that went RAB → nothing → abandoned is a
weak test. Ground that went RAB → AC → RC → DD over eight years means somebody kept
finding enough to justify spending more. That progression is a genuine, defensible,
database-derived signal — no LLM required, no hallucination risk.

Conversely: **shallow RAB holes over prospective ground are the classic "never properly
tested" signature.** Cheap 30 m holes cannot find something at 150 m. This is the basis
of the coverage-gap idea in [product options](../01-research/04-product-options.md).

## 5. Commodities, and what WA is actually about

- **Gold (Au)** — dominates WA, especially the Eastern Goldfields around Kalgoorlie.
  Measured in **g/t** (grams per tonne). ~1 g/t is roughly the open-pit economic edge.
- **Nickel (Ni)** — Kambalda, Mt Keith. Measured in **%**.
- **Iron ore (Fe)** — the Pilbara. Measured in **%**. This is what WA's economy runs on.
- **Lithium (Li)** — Greenbushes, Pilgangoora. Measured as **% Li₂O**. Recent boom.
- **Copper, Base metals (Cu, Pb, Zn)**, **Rare earths (REE)**, **Uranium (U)**.

Note the units differ per commodity. `target_commodity` in our data is a
**semicolon-delimited string** like `COPPER; NICKEL` — not normalised, so we must split it.

Commodity focus moves in waves with metal price. The same patch of ground gets looked at
for nickel in 1970, gold in 1988, and lithium in 2022 — **by different companies who
often never read each other's reports.** That is the product thesis in one sentence.

## 6. Why reports exist at all: it's the law

A company holding an exploration tenement must **spend a minimum amount each year** and
**report what they did**. If they don't, they can lose the ground.

Two consequences that matter for us:

1. **Reporting is a compliance obligation, not a marketing exercise.** Quality varies
   wildly. Some reports are 400 pages of real science; some are three pages saying
   effectively "no exploration conducted this year." The controlled vocabulary actually
   has a term for that: `No exploration` (25 occurrences in our Kalgoorlie test box).
2. **After a confidentiality period the reports become "open file"** — public, free,
   CC BY 4.0. 615,050 of them. This is a genuinely unusual public good; most
   jurisdictions are not this open.

**These are someone's contemporaneous opinions, under commercial pressure, using the
science of their day.** A 1974 report concluding "no economic potential" was correct
given 1974 geological models and 1974 gold prices ($35/oz vs ~$5,000/oz today). It tells
you nothing definitive about the ground.

This is why `CLAUDE.md` insists on separating **database facts** from **report claims**.
"Company X reported no significant results" is true and citable. "The ground is barren"
is a fabrication.

---

**Next:** [02-glossary.md](02-glossary.md)

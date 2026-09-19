# Five things worth building on this data

Given that [NextMaps already shipped Phase 2](03-competitive-landscape.md), here are five
options that are *not* a clone. Scored honestly, including the ones I'd advise against.

Scoring: **Moat** (how hard to copy) · **Effort** · **Career value** (toward a Perth
mining-tech role) · **Revenue potential**.

---

## Option 1 — Australia-wide open-file exploration search

**The pitch:** every competitor is WA-only. Build the one place that answers "what's been
done on this ground?" for **WA + SA + QLD + NT + NSW**.

Explorers do not respect state borders — commodity booms move (lithium in WA, copper in
SA, critical minerals in QLD), and a geologist screening a national portfolio currently
uses five incompatible government portals with five different schemas.

| | |
|---|---|
| **Moat** | ★★★★★ — the moat *is* the integration grind. A funded WA-focused competitor won't do it; it's unglamorous and slow |
| **Effort** | ★★★★★ — highest here. Five jurisdictions, five schemas, five licences |
| **Career value** | ★★★★☆ — proves serious data-engineering range |
| **Revenue** | ★★★☆☆ — real, but you're competing on breadth against incumbents with depth |

**Known starting points:** WA = SLIP ArcGIS REST (verified). QLD = CKAN API at
`geoscience.data.qld.gov.au/api/3/action/` (clean, documented). SA = SARIG, free, no
login. NT = NTGS. NSW = MinView.

**Biggest risk:** each jurisdiction has different licensing and different data richness.
WA's GSWA-written abstracts may have no equivalent elsewhere — if so, the unified product
is shallow outside WA and the whole premise weakens. **Verify the other states' report
metadata quality before committing.** That's a one-day spike and it should be done first.

---

## Option 2 — `mineio` as the product, not the app ⭐

**The pitch:** stop building an app; build the **open-source data interchange library for
mining**. Collar/survey/assay/lithology in, and OMF / IREDES / CSV / DXF / Leapfrog /
Micromine / Datamine / Surpac out — with coordinate handling (WGS84 ↔ MGA2020, zones 50/51)
that is actually correct.

Every geologist loses time to format conversion every week. The tooling is proprietary,
expensive, and bad. There is no good open alternative.

WAMEX stops being the product and becomes the **test corpus and showcase** — which is
exactly the relationship `CLAUDE.md` already describes between the two repos.

| | |
|---|---|
| **Moat** | ★★★☆☆ — copyable in principle, but nobody has, and first-mover in OSS compounds |
| **Effort** | ★★★☆☆ — bounded, incremental, testable. Ship value in week one |
| **Career value** | ★★★★★ — **highest here.** A cited OSS library in your target industry is worth more than a dead SaaS |
| **Revenue** | ★☆☆☆☆ — realistically zero directly |

**Why I rate this highest despite zero revenue:** the stated goal is a Perth mining-tech
role. A public library that WA geologists actually use gets you interviews that a
shut-down web app never will. It survives contact with a competitor because it isn't
competing. And it's the only option here where 3.4M drillholes of real, messy, public
test data is a genuine advantage.

---

## Option 3 — the coverage-gap engine ("what was never tested")

**The pitch:** invert the question. Not "summarise what was done" (commoditised), but
**compute, rigorously and statewide, what was never done.**

Drilling density per km², maximum depth tested versus prospective depth, spatial gaps
between holes, ground held for years with `No exploration` keywords, ground tested only
by shallow RAB before modern geological models existed.

This is **deterministic spatial analysis, not language generation** — no hallucination
surface at all, which sits perfectly with `CLAUDE.md`'s citation-or-silence rule.

| | |
|---|---|
| **Moat** | ★★★☆☆ — methodology is the moat; NextMaps could add it |
| **Effort** | ★★★☆☆ — PostGIS-heavy, conceptually interesting |
| **Career value** | ★★★★☆ — this is real geoscience data science |
| **Revenue** | ★★★☆☆ — genuinely valuable if the methodology holds up |

**The distinction from NextMaps:** they emit a *sentence* saying evidence is thin. This
is a **ranked, reproducible, statewide layer** with a published method. Different artifact,
different rigour.

**Biggest risk:** you need real geological input for it to be credible. "Under-drilled"
without "prospective" is just a map of where nobody bothered — often for excellent
reasons (it's a salt lake, it's a national park, it's barren granite). **This option needs
a geologist collaborator to be defensible.** Don't ship it solo.

---

## Option 4 — publish the open WAMEX corpus ⭐

**The pitch:** nobody has ever published a cleaned, deduplicated, joined WAMEX dataset.
Do it. 615,050 reports with full abstracts (via `dpxe_abs`), the 157+ term controlled
vocabulary, drillhole joins on `anumber`, normalised commodities, quarantined bad rows —
on HuggingFace, with a data paper and a reproducible pipeline.

The licence permits it: **CC BY 4.0, commercial use allowed**, attribution required.

| | |
|---|---|
| **Moat** | ★★★★☆ — first mover takes the canonical slot permanently |
| **Effort** | ★★☆☆☆ — **lowest here**, and it's work you must do anyway for any other option |
| **Career value** | ★★★★★ — a citable public artifact; SWUNG and academia will actually use it |
| **Revenue** | ☆☆☆☆☆ — none, by design |

**Why this is the smartest first move:** the cleaning work is a prerequisite for options
1, 2 and 3 anyway. Publishing it costs almost nothing extra and converts invisible
infrastructure work into a public credential. It cannot be competed away — NextMaps will
never open-source their corpus, it's their asset.

It is also **the ideal SWUNG post**: a free dataset is a gift, not a pitch. Per `BUILD.md`
§7, questions get replies and launches get ignored — a dataset release is the most
reply-generating thing you can post.

Secondary angle: the `keywords` vocabulary is a **ready-made multi-label classification
benchmark** — 615k documents, curated labels, 98.8% coverage. Rare and genuinely useful
to ML researchers.

---

## Option 5 — go to drill & blast instead

**The pitch:** exploration data tooling is crowded. **Production drill & blast is not.**
You already have `~/Engineering/mining-engineering/` (Brent Buffham's work) and `mineio`
already targets IREDES — a drill & blast standard.

Blast pattern design, hole deviation, energy distribution, fragmentation prediction,
IREDES rig integration. The incumbents are expensive desktop software.

| | |
|---|---|
| **Moat** | ★★★★☆ — far fewer entrants; domain knowledge is the barrier |
| **Effort** | ?????  — **not yet scoped** |
| **Career value** | ★★★★☆ — production engineering, arguably more employable than exploration |
| **Revenue** | ★★★☆☆ — mine sites have budgets; exploration juniors don't |

**Honest caveat:** I have not researched this properly. It's on the list because the
adjacency is real and the crowding is visibly lower, not because I've validated it.
Treat it as a research task, not a recommendation.

---

## Scoreboard

| # | Option | Moat | Effort | Career | Revenue | Verdict |
|---|---|---|---|---|---|---|
| 1 | Australia-wide search | ★★★★★ | ★★★★★ | ★★★★ | ★★★ | Spike the other states first |
| 2 | **`mineio` as the product** | ★★★ | ★★★ | **★★★★★** | ★ | **Do this** |
| 3 | Coverage-gap engine | ★★★ | ★★★ | ★★★★ | ★★★ | Needs a geologist |
| 4 | **Open WAMEX corpus** | ★★★★ | **★★** | **★★★★★** | ☆ | **Do this first** |
| 5 | Drill & blast | ★★★★ | ? | ★★★★ | ★★★ | Research it |

## Recommendation

**Sequence 4 → 2, and keep building wamex-explorer Phases 0–1 as the vehicle for both.**

1. **Build Phase 0 and Phase 1 anyway.** Not as a business — as the thing that teaches you
   PostGIS, vector tiles, coordinate systems, and the domain. That learning is the stated
   goal, and it is not invalidated by a competitor existing.
2. **The cleaned corpus falls out of Phase 1 for free.** Publish it (Option 4). Low effort,
   high credibility, uncontested.
3. **Point the export path at `mineio`** (Option 2). It becomes the durable artifact.
4. **Do not build Phase 2 as a commercial product.** Build a small version to learn RAG and
   citation discipline if you want — but don't spend months competing with a shipped,
   better-resourced product on its home ground.
5. **Spike Option 1 or 5** when you want a bigger swing, on evidence rather than hope.

The one thing not to do is build Phase 2 as specified and discover NextMaps in three
months.

---

## How to evaluate a target — the rule behind the scoreboard

Written after the question *"NextMaps built something better, but if there's space for
others, can't we build something better and cheaper?"* The instinct is half right, and
the half that's wrong will waste a year. This is the filter.

### NextMaps is not a monopoly, and that is the problem

A monopoly has something that keeps others out — locked data, patents, network effects,
regulatory capture. NextMaps has none of those. The data is CC BY 4.0. They are a small
WA startup that got there first. **Anyone can enter tomorrow.** That sounds like an
opening; it is actually the warning sign, because it means the field is open to everyone
*and* one player already has a head start, customers, and domain knowledge.

### Why "better and cheaper" fails against a small, fast incumbent

| "Cheaper" | Their free tier already includes WAMEX layers and 15 AI questions a day. You cannot undercut free. |
| "Better" | Requires knowing what a tenement manager needs on a Tuesday morning. That is domain knowledge the incumbent's founder has and a newcomer does not. You would be guessing at "better" from outside. |
| Market size | WA exploration employs ~4,500 people. Paying seats might be a few thousand. Two players splitting that and racing on price means both starve. Second place in a small market eats scraps. |
| Structural edge | Cheaper only wins with a cost advantage the incumbent cannot match. A solo dev pays the same cloud bill. |

### When "better and cheaper" does work

Against incumbents that are **big, slow, expensive, and unable to change** — never
against a two-year-old startup with a free tier.

| Incumbent profile | Examples | Seat price | Why they cannot respond |
|---|---|---|---|
| Legacy mine-planning software | Surpac, Vulcan, Micromine, Datamine, Deswik | **$20k–60k/yr** | Decades old, Windows desktop, proprietary formats, glacial releases. Cannot drop price without destroying their own revenue; cannot modernise without a rewrite. |
| Drill & blast design | A handful of players | Expensive | Same shape. |

`mineio` — open format interchange — is *exactly* the wedge into that space: it attacks the
lock-in without competing head-on with the software itself.

> These markets are not yet researched in this project. This is the **shape** to look
> for, not a verified target. Option 5 is where that research starts.

### The four-part filter

"If there is space, go for it" is too loose — there is space in plenty of markets nobody
wants. Use all four:

1. **A pain someone already pays to remove.** Not one you think they *should* have.
2. **A structural reason you can address it better** — domain knowledge, distribution,
   cost structure, or a technical edge they cannot copy.
3. **The incumbent is big-and-slow, not small-and-fast.**
4. **The market is big enough that second place still eats.**

| | 1. Paid pain | 2. Structural edge | 3. Big & slow | 4. Market size |
|---|---|---|---|---|
| Clone NextMaps | ✓ | ✗ | ✗ | ✗ |
| Legacy mine software (via `mineio`) | ✓ | *becomes ✓ with domain knowledge* | ✓ | ✓ |

### What this means right now

Every choice should serve the actual goal — a Perth mining-tech role — because that is
also the only foundation a later startup could stand on. A public WAMEX corpus and a
working open-source library get the job *and* build the three things you cannot start a
company in this industry without: domain knowledge, reputation, distribution. A clone
gets none of them.

Two things to keep in view:

- **NextMaps proved the market and it may grow.** Keep `wamex-explorer` alive as the
  classroom. Once the domain is genuinely understood, the niche they neglect will be
  visible. Picking it now is guessing.
- **NextMaps is a small WA startup.** Someone who shows up with a public, cleaned WAMEX
  dataset and deep pipeline knowledge is exactly who they would hire. Do not rule that
  out.

---

**Next:** [../02-architecture/01-tech-stack.md](../02-architecture/01-tech-stack.md)

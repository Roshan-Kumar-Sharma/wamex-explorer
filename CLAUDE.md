# wamex-explorer

A web app over Western Australia's free, public WAMEX exploration data: **draw a polygon on a map,
get a written history of everything ever done on that ground.**

Read `BUILD.md` for the plan. Read `DATA.md` for verified endpoints, schemas and record counts.

---

## The product thesis — don't lose this

**It is not a map. It is a document generator.** The map is the input device; the output is a
shareable written brief. DMIRS/DMPE already ships a free spatial viewer — "WAMEX on a map" is a
worse copy of a government service. The product is **synthesis**: answering *"what has already been
done on this ground?"*, which currently costs a geologist two to three days of reading PDFs.

---

## Non-negotiable: citation or silence

The audience is expert and adversarial. Geologists will test this on ground they know personally.
One hallucinated claim in a screenshot kills the product — this community is small and talks.

1. Every factual claim cites its `anumber`, linked and traceable
2. Never generate a sentence not grounded in retrieved text
3. Separate database facts (hole counts) from report claims (someone's 1983 opinion — attribute it)
4. State what is missing; gaps are more valuable than confident filler
5. Never imply economic or investment conclusions

Build citations in from day one. Trust cannot be retrofitted.

---

## Key facts

- **3,465,810** open-file drillholes (SLIP layer 28), **615,050** WAMEX reports (layer 22)
- **`anumber` joins holes to reports** — the most important relationship in the dataset
- **Layer 22's `abstract` is plain text, already populated.** No OCR needed to ship. This is the unlock.
- **Layer 28 is collars only — no assays.** Don't promise assays in v1.
- Licence: **CC BY 4.0**, attribution *"Based on Department of Mines, Petroleum and Exploration material"* must be visible in UI and exports
- Coordinates are WGS84; convert to MGA only on export
- Data updates weekly

## Stack decisions (made — don't relitigate)

PostGIS + PMTiles (tippecanoe) + MapLibre GL + deck.gl. Ingest bulk from DASC; **never query SLIP
live per user request**. LLM calls on demand only, cached by polygon hash. Budget under $20/month.

## Related

- `~/Engineering/mineio/` — the format library; this app's export engine, and this app is its showcase
- `~/Engineering/mining-engineering/` — Brent Buffham drill & blast work
- `~/Engineering/career-guidance/side-income/mining-tech/00-OPPORTUNITY-MAP.md` — why this project exists

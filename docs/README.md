# docs/

Learning-first documentation for wamex-explorer. Written for someone who is a competent
developer but **new to mining and geoscience**. Every doc assumes zero domain knowledge
and builds up.

Read in this order:

| # | Doc | What it gives you |
|---|---|---|
| 1 | [00-orientation/01-what-is-mineral-exploration.md](00-orientation/01-what-is-mineral-exploration.md) | The industry, from zero. Why any of this data exists. |
| 2 | [00-orientation/02-glossary.md](00-orientation/02-glossary.md) | Every term you'll hit. Come back to this constantly. |
| 3 | [00-orientation/03-how-wa-exploration-works.md](00-orientation/03-how-wa-exploration-works.md) | Tenements, reporting law, why WAMEX exists at all. |
| 4 | [01-research/01-verification-log.md](01-research/01-verification-log.md) | What we actually checked against the live API, and what we found. |
| 5 | [01-research/02-data-findings.md](01-research/02-data-findings.md) | **Read this.** Findings that change the build plan. |
| 6 | [01-research/03-competitive-landscape.md](01-research/03-competitive-landscape.md) | **Read this too.** Someone already built our Phase 2. |
| 7 | [01-research/04-product-options.md](01-research/04-product-options.md) | Five things worth building, scored. |
| 8 | [02-architecture/01-tech-stack.md](02-architecture/01-tech-stack.md) | Frontend + backend decisions, with reasons. |
| 9 | [02-architecture/02-data-model.md](02-architecture/02-data-model.md) | The database schema and why it looks like that. |
| 10 | [02-architecture/03-cost-model.md](02-architecture/03-cost-model.md) | Staying under $20/month, verified. |
| 11 | [02-architecture/04-running-locally.md](02-architecture/04-running-locally.md) | **Run Phase 0 yourself.** Commands, checks, troubleshooting. |

Concept notes (written as we hit each topic, not upfront):

- [03-concepts/01-coordinate-systems.md](03-concepts/01-coordinate-systems.md) — WGS84, MGA, why it matters
- [03-concepts/02-postgis-basics.md](03-concepts/02-postgis-basics.md) — spatial SQL from scratch
- [03-concepts/03-vector-tiles-and-pmtiles.md](03-concepts/03-vector-tiles-and-pmtiles.md) — how you draw 3.4M points in a browser
- [03-concepts/04-reading-a-wamex-abstract.md](03-concepts/04-reading-a-wamex-abstract.md) — A-numbers, report types, confidentiality, and the two generations of abstract
- [03-concepts/05-coverage-and-what-was-never-tested.md](03-concepts/05-coverage-and-what-was-never-tested.md) — regolith vs fresh rock, the coverage grid, and how to phrase an absence

Running records:

- [DECISIONS.md](DECISIONS.md) — every architectural decision, dated, with the reasoning and what would reverse it
- [LEARNING-LOG.md](LEARNING-LOG.md) — session-by-session: what we did, what broke, what it taught

---

## How to use these while building

The rule: **when we do something you don't understand, we stop and write it down here
before moving on.** A doc that explains a thing we actually built beats a doc that
explains a thing in general.

If a concept note doesn't exist yet for something we're about to use, that's the signal
to write it.

---

Based on Department of Mines, Petroleum and Exploration material, used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

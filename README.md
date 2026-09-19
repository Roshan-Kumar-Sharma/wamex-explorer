# wamex-explorer

Draw a polygon anywhere in Western Australia. Get a written history of everything ever done on that
ground — every drillhole, every exploration report, every company that tried and what they concluded.

Built on WA's free, public, CC BY 4.0 open-file exploration data:
**3.47 million drillholes** and **118,834 exploration reports** going back to 1970.

| File | What |
|---|---|
| `BUILD.md` | What to build, phased, with the honest risks |
| `DATA.md` | Verified API endpoints, schemas, record counts, licence, gotchas |
| `CLAUDE.md` | Project context, auto-loaded by Claude Code |
| `docs/` | **Learning-first documentation** — domain primer, glossary, verified research, architecture, concepts |

**Status:** **Phase 0 working.** Draw a box near Kalgoorlie, get a cited ground-history
brief in under a second. Phase 1 in progress: all 118,834 WA reports loaded; drillholes next.
See [docs/02-architecture/04-running-locally.md](docs/02-architecture/04-running-locally.md).

⚠️ **Read [`docs/01-research/03-competitive-landscape.md`](docs/01-research/03-competitive-landscape.md)
before building Phase 2** — a commercial product (NextMaps) already ships polygon → cited
ground history. `BUILD.md`'s phases 0–1 still stand; phase 2 needs a rethink. See
[`docs/01-research/04-product-options.md`](docs/01-research/04-product-options.md).

Start at [`docs/README.md`](docs/README.md). Phase 1 is next: bulk ingest all of WA + PMTiles.

---

Based on Department of Mines, Petroleum and Exploration material, used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

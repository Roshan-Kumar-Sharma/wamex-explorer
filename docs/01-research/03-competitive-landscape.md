# Competitive landscape

Researched 19 September 2026.

**Headline: the product described in `BUILD.md` Phase 2 already exists commercially.**
This is the most important thing in these docs. Everything else is detail.

---

## 1. NextMaps — direct competitor, already shipped

[nextmaps.com.au](https://www.nextmaps.com.au/) — a WA mining tenement map, due-diligence
and marketplace platform.

Their **AI Prospectivity Reports** feature, in their own words:

> enter any WA tenement or area of interest, select a commodity, and within minutes
> receive a desk study built from the full WAMEX A-file record for that ground

with reports covering geological setting, exploration history, prospectivity assessment,
compiled drilling and geochemistry, original A-file PDFs, and — this is the part that
should sting — **every finding cited back to the source A-number, "not a black box
summary."** They also explicitly **"flag where the evidence is thin, not just where it's
strong."**

### Side by side with our plan

| `BUILD.md` Phase 2 | NextMaps today |
|---|---|
| Draw polygon → written ground history | ✅ Shipped |
| Every claim cited to an `anumber` | ✅ Shipped, and marketed as the differentiator |
| "What was never tested" section | ✅ "flags where the evidence is thin" |
| Exploration timeline, who worked the ground | ✅ Tenement Timeline, playable forward/back |
| Report inventory with abstracts | ✅ Plus original A-file PDFs |
| Drilling summary | ✅ Plus **assays** and geology logs |
| Shareable permalink | ✅ Tenure Packs, ASX-quality exports |

They are not *approaching* our plan. They have **implemented it, including the trust
mechanism we identified as our moat**, and they went further — assays, native title,
heritage, hyperspectral.

### Everything else they have

- **10.2M surface geochem points**, **2.5M drillholes across 70+ elements**
- Magnetics, gravity, radiometrics; ASTER and EnMAP hyperspectral mineral maps
- Timestamped Sentinel-2 imagery
- Native title, heritage, land access
- **Distressed Tenements** (forfeiture risk, rent overdue, underspending)
- **Warden's Court matters, refreshed every 15 minutes**
- Ground Release Zones, Application Hotspots, expenditure compliance

### Pricing

| Tier | Price | Notes |
|---|---|---|
| Free | $0 | Live tenement/WAMEX/geoscience layers, 15 questions/day, 3 trial outputs |
| Premium | **$50/user/mo** | Intelligence layers, watchlists, alerts, exports |
| Pro | **$200/user/mo** | Market analytics, unlimited Tenure Packs, 10 Prospectivity Data Rooms/mo |

### How to read this

Two honest readings, and both are true:

**The bad news.** Our differentiated v1 is now a feature-incomplete clone. We cannot win
on "polygon → cited brief." A free tier that includes WAMEX layers and 15 AI questions a
day destroys any freemium wedge. They have paid data (assays, hyperspectral, native
title) that we do not and largely cannot afford.

**The good news, and it is real.** *Somebody built this and charges $200/month for it.*
The thesis in `BUILD.md` — that synthesis of open-file data is worth money — is
**validated by a functioning market**, not just by our reasoning. That is worth more than
it feels like right now. Most project ideas die because nobody wanted them; this one dies
because somebody wanted it enough that a competitor got there first. Those are very
different failure modes.

## 2. Government — access solved, synthesis not attempted

| System | What it does | Threat |
|---|---|---|
| **GeoVIEW.WA** | GIS viewer, spatial + text WAMEX search, drillholes, geochem | Low — it's a viewer |
| **WAMEX portal** (rebuilt **May 2024**) | Dashboard, spatial map search, instant bulk download, real-time release | Medium — killed the "access is hard" wedge |
| **DASC** | Bulk spatial downloads, weekly | None — it's our supply |
| **wamexgeochem.net.au** | Harmonised assays, web query + Postgres dumps | None — supply |
| **TENGRAPH** | Tenement mapping | Low |

The May 2024 WAMEX rebuild matters: **the government already fixed "finding the data."**
`BUILD.md` §1 argues the real pain is synthesis, not access — that argument is correct
and is now *more* correct, because access is no longer painful at all.

**No government system attempts summarisation or synthesis.** The announcement makes no
mention of AI. That gap is real; NextMaps is simply already in it.

## 3. Expedio — the incumbent government vendor

[expedio.com.au](https://expedio.com.au/) built WAMEX Geochem and the harmonised MDHDB
for GSWA under the Geoscience Data Transformation Program. They took a database of
2.5M drillholes and 7M surface samples that was "difficult to work with" and made it
queryable.

**No AI, no text extraction, no summarisation** — data engineering and access, on
government contract.

Not a competitor. Worth knowing as (a) the shape of who gets paid in this ecosystem, and
(b) a realistic employer or collaborator for someone who arrives with demonstrated WAMEX
fluency.

## 4. Tenement monitoring — crowded, don't enter

| Product | Coverage |
|---|---|
| **GroundSleuth** | Daily ground monitoring, email alerts on tenure change. **WA only.** |
| **NextMaps** | Alerts on pegging, expiry, transfers, Warden's Court |
| **MTen** | Tenement compliance, all AU states |
| **M&M Walter, Measured Group** | Managed tenement services |

"Vacant ground alerts" is a solved, competitive category. Do not build it.

## 5. Research / adjacent, not commercial

- **Geo-LLM** (Paul Cleverley, May 2025) — Llama 4 reading 400-page geology reports into
  a structured geology DSL, generating 3D models. Research, not a product.
- **GeoGPT** (Deep-time Digital Earth + Zhejiang Lab) — geoscience LLM, open science.
- **Micromine Origin Grade Copilot** — AI in commercial mining software, resource-estimation focused.
- **Earth AI**, **Minerva Intelligence** — prospectivity/targeting ML, not report synthesis.

## 6. What nobody has built

This is the useful output of all the above.

| Gap | Evidence | Hard? |
|---|---|---|
| **Multi-state open-file synthesis** | NextMaps: WA only. GroundSleuth: WA only. SA (SARIG), QLD (GSQ CKAN API), NT, NSW all separate | Yes — and that's the moat |
| **Open, cleaned WAMEX research corpus** | No public dataset exists. 615k GSWA-written abstracts + controlled vocabulary is a unique NLP resource | No |
| **Rigorous coverage-gap computation** | Everyone *mentions* thin evidence in prose; nobody publishes a defensible statewide under-tested raster | Medium |
| **Open-source mining data interchange** | Format conversion is a daily tax; tooling is proprietary and expensive | Medium |

These feed directly into [product options](04-product-options.md).

---

## Sources

- [NextMaps](https://www.nextmaps.com.au/) · [tenements](https://www.nextmaps.com.au/tenements)
- [GroundSleuth](https://www.globaltenements.com/software/groundsleuth/)
- [WAMEX: the new and improved (May 2024)](https://www.wa.gov.au/government/announcements/wamex-the-new-and-improved)
- [WA Exploration Geochemistry Online](https://wamexgeochem.net.au/)
- [Expedio — Open File Data Solutions with GSWA](https://expedio.com.au/case-studies/open-file-data-solutions-with-gswa/)
- [GeoVIEW.WA](https://geoview.dmp.wa.gov.au/geoview/?Viewer=GeoVIEW)
- [GSQ Open Data API](https://github.com/geological-survey-of-queensland/open-data-api)
- [SARIG](https://www.energymining.sa.gov.au/industry/minerals-and-mining/maps-data-and-online-tools/sarig)

---

**Next:** [04-product-options.md](04-product-options.md)

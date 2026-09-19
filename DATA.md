# WAMEX Data Reference

**All endpoints and figures below were verified live on 16 Sep 2026.** Re-verify before relying on them.

---

## Licence — read this first

**Creative Commons Attribution 4.0 International (CC BY 4.0).** Commercial use permitted.

Required attribution for modified/transformed data:

> Based on Department of Mines, Petroleum and Exploration material

This must be **visible in the UI and on every export or generated document**. It is a licence
condition, not a courtesy. Retain any copyright notices that accompany the material.

**Naming churn warning:** the department has been DMIRS → DEMIRS → DMPE over recent years. Dataset
IDs still use the `DMIRS-` prefix and endpoints still use `dmirs.wa.gov.au`. Expect renames; don't
hardcode the department name anywhere except the attribution string.

---

## Primary API — SLIP ArcGIS REST

Base:
```
https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer
```

Mirror (documented on data.wa.gov.au):
```
https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer
```

Also available: **WFS** and **WMS** at `.../Industry_and_Mining_WFS/MapServer/WFSServer` and
`.../Industry_and_Mining/MapServer/WMSServer`.

`maxRecordCount` is **10000** on every layer. Large pulls need `resultOffset` pagination — watch for
`exceededTransferLimit: true` in responses.

### Layers that matter

| ID | Layer | Geometry | **Verified count** |
|---|---|---|---|
| **28** | Mineral Exploration Drillholes (open file) (DMIRS-046) | Point | **3,465,810** |
| **22** | Mineral exploration reports (WAMEX) (DMIRS-033) | Polygon | **615,050 rows = 118,834 reports** (rows are ~5.2× exact duplicates; see `docs/LEARNING-LOG.md`) |
| 3 | Mining Tenements (DMIRS-003) | Polygon | — |
| 1 | DMIRS Core Library Drill Holes (DMIRS-004) | Point | 4,130 |
| 35/36/37 | Historical Exploration Activity (points/lines/polygons) | Mixed | — |
| 0 | Minedex (DMIRS-001) — mines and deposits | — | — |

Other layers available: petroleum wells, seismic surveys, geological map sheet indexes, mineral
field boundaries, tectonic units.

### Layer 28 — Drillholes (the spine of the product)

```
objectid, holeid, latitude, longitude, target_commodity, maxdepth,
extract_date, operator, collarid, holetype, project, anumber,
period_from, period_to
```

`holetype` values seen: `RAB`, and the usual RC / DD / AC family.

**`anumber` is the join key to layer 22.** This is the most important relationship in the dataset —
it connects a physical hole to the report that describes it.

### Layer 22 — WAMEX reports

```
objectid, anumber, title, report_year, author_name, author_company,
report_type, date_from, date_to, project, operator, abstract,
keywords, target_commodity, date_released, item_no, dpxe_abs,
dpxe_rep, extract_date, digital_file, is_shaped
```

**`abstract` is `varchar(250)` and truncated mid-word** — in the API *and* the DASC bulk GDB
(verified 19 Sep 2026). 35,592 of 118,834 hit the limit. The full abstract is behind the
`dpxe_abs` URL (`…/WAMEX/ExternalTool/CreateReportAbstractDialog?aNumber=N`), one HTTP fetch
per report: server-rendered HTML with the text in `<div class="htmlTextContainer">`, followed
by `Prospects:` and `Assays:` lines and a per-report DRILLING SUMMARY table. Fetch lazily for
reports inside a user's polygon and cache permanently (ADR-007, ADR-020).

**The abstract field is empty for almost everything since 2015** (verified 19 Sep 2026):
coverage is 94–100% for every five-year band to 2014, then 3–5%. **26,760 post-2014 reports
have no abstract in bulk.** GSWA stopped writing them. The per-report page still has one —
a structured *company-written* abstract (Location / Geology / Work Done / Results /
Conclusions & Recommendations / Prospects / Assays), often several thousand characters with
drill intercepts. See `docs/03-concepts/04-reading-a-wamex-abstract.md`.

**`keywords`** (1,161 terms, 98.8% coverage) is the structured, no-LLM backbone.

Sample record (anumber 1):
```
title:           Wonganoo Project, Annual Report for the period ending 26th November 1970...
report_year:     1970
author_company:  AMALGAMATED PETROLEUM NL
target_commodity: COPPER; NICKEL
abstract:        M289/0: Wonganoo nickel-copper exploration: (Annual Report) (1/1/1971-?)
```

Note `target_commodity` is a `;`-delimited multi-value string, not normalised. Dates come back as
epoch milliseconds.

---

## Verified working spatial query

This is the core product interaction, confirmed working:

```bash
B="https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer"
GEOM='{"xmin":121.40,"ymin":-30.80,"xmax":121.55,"ymax":-30.70,"spatialReference":{"wkid":4326}}'

curl -s -G "$B/28/query" \
  --data-urlencode "geometry=$GEOM" \
  --data-urlencode "geometryType=esriGeometryEnvelope" \
  --data-urlencode "inSR=4326" \
  --data-urlencode "spatialRel=esriSpatialRelIntersects" \
  --data-urlencode "where=1=1" \
  --data-urlencode "outFields=holeid,holetype,maxdepth,target_commodity,operator,anumber" \
  --data-urlencode "outSR=4326" \
  --data-urlencode "f=json"
```

That box — roughly 0.15° × 0.10° near Kalgoorlie — returns **12,396 drillholes**. Polygon queries
work the same way with `geometryType=esriGeometryPolygon`.

Coordinates come back as **WGS84 lon/lat (EPSG:4326)**, not MGA. Convert to MGA only on export.

---

## Bulk download — DASC

For anything beyond prototyping, **do not paginate 3.4M records out of the REST API.** Bulk download
instead:

- **DASC (Data and Software Centre):** https://dasc.dmirs.wa.gov.au/
- Drillholes: `https://dasc.dmirs.wa.gov.au/home?productAlias=OpenFileDrillholes`
- WAMEX reports: `https://dasc.dmirs.wa.gov.au/home?productAlias=MinExpRepWAMEX`
- Formats: **GDB (Esri geodatabase), SHP (shapefile), TAB (MapInfo)**
- **Update frequency: weekly** — you need a refresh job
- A full copy of the drillhole + geochemistry database is available in SQL Server format; the full
  report set is available on physical hard drive
- Enquiries: `wamex.enquiries@dmirs.wa.gov.au`

---

## The assay gap — important, do not over-promise

**Layer 28 contains collars only.** The dataset documentation states the minimum submission is
"a collar file validated against the tenement outline", and that "additional files such as assays,
geology and surveys may also be available depending on the company's submission" — but those are
**not in the spatial layer.**

Downhole assays and surface geochemistry live separately:

- **Western Australia Exploration Geochemistry Online** — harmonised drillhole and surface geochemistry extracted from WAMEX reports, presented in pivoted format with complete pivoted tables downloadable.
- The **Company Mineral Drillhole Database (MDHDB)** reportedly holds **3M+ historic drillholes and 11M+ surface samples** (earlier figures cited 2M/7M — the dataset is growing).
- The combined company drillhole and surface geochemistry release went live **4 December 2024**.

**Do not advertise assays in v1.** Ship collars + reports, then add geochemistry as a distinct phase
once you've verified the join keys yourself.

---

## Gotchas

| Issue | Handling |
|---|---|
| 10,000 record cap per request | Paginate with `resultOffset`; check `exceededTransferLimit` |
| Dates are epoch milliseconds | Convert on ingest |
| `target_commodity` is `;`-delimited | Split and normalise into a lookup table |
| Coordinates are WGS84, not MGA | Convert only at export (use `mineio`) |
| Weekly updates | Scheduled refresh; store `extract_date` |
| Department renames | Keep the attribution string in one config value |
| Government already ships a viewer | See the honesty note in `BUILD.md` §1 |
| `report_year = 1753` (15,300 rows) | SQL Server `datetime` floor = NULL. Recover from `date_from` (99.8%) |
| `report_year = 1899` (10 rows) | Excel epoch (1899-12-30). Same recovery. Valid floor is **1930**; oldest genuine report is 1935 |
| `maxdepth = -999 / -9999 / 9999` | "Unknown". NULL it, quarantine the row. Deepest genuine hole is 4,431 m; cap at 9000 |
| 27,409 holes at ~106°E, −10.5°S | Christmas Island — WA-administered, genuine. Bounds are 96–130°E, −36 to −9°S |
| Layer 22 rows are 5.2× exact duplicates | Bad upstream join. `COUNT(DISTINCT anumber)` always; 615,050 rows = 118,834 reports |

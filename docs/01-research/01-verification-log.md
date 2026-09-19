# Verification log

Everything below was run live against the public API on **19 September 2026**. Commands
are included so you can re-run them yourself — don't take my word for any of it.

`DATA.md` was verified 16 Sep 2026. This log re-verifies it and goes further.

---

```bash
B="https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer"
```

## 1. Are the endpoints still alive? — YES

```bash
curl -s -G "$B/28/query" --data-urlencode "where=1=1" \
  --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"
```

| Layer | `DATA.md` (16 Sep) | Live (19 Sep) | Δ |
|---|---|---|---|
| 28 — Drillholes | 3,465,810 | **3,466,691** | **+881** |
| 22 — WAMEX reports | 615,050 | **615,050** | 0 |

**The +881 in three days is the weekly refresh, confirmed empirically.** This is not a
static dataset. The ingest pipeline must be incremental from day one, keyed on
`extract_date` — retrofitting that later means a full reload every week.

## 2. Full layer inventory

47 layers total. The ones that matter beyond `DATA.md`'s list:

| ID | Layer | Geometry | Count |
|---|---|---|---|
| 0 | Minedex — mines & deposits | Point | **48,431** |
| 3 | Mining Tenements | Polygon | **30,478** |
| 35 | Historical Exploration Activity — Points | Point | **364,659** |
| 36 | Historical Exploration Activity — Lines | Line | **36,805** |
| 37 | Historical Exploration Activity — Polygons | Polygon | **29,089** |

Layers 35–37 (430k features total) are **not mentioned in `BUILD.md` at all** and are
worth investigating — historical workings, costeans, shafts, old surveys.

Layer 3 field list (39 fields) confirms up to **nine holders per tenement** with
addresses (`holder1..holder9`, `addr1..addr9`), plus `grantdate` / `startdate` /
`enddate`. Enough to reconstruct tenure history.

## 3. The core spatial query — WORKS

Kalgoorlie box, 0.15° × 0.10°:

```bash
GEOM='{"xmin":121.40,"ymin":-30.80,"xmax":121.55,"ymax":-30.70,"spatialReference":{"wkid":4326}}'
curl -s -G "$B/22/query" \
  --data-urlencode "geometry=$GEOM" \
  --data-urlencode "geometryType=esriGeometryEnvelope" \
  --data-urlencode "inSR=4326" \
  --data-urlencode "spatialRel=esriSpatialRelIntersects" \
  --data-urlencode "where=1=1" \
  --data-urlencode "outFields=anumber,title,report_year,abstract,keywords" \
  --data-urlencode "returnGeometry=false" --data-urlencode "f=json"
```

Returns **2,648 rows → 504 unique A-numbers**.

## 4. THE BIG ONE — `abstract` is truncated

Measured across all 2,648 rows in that box:

```
abstract length:  min 0 | p25 57 | median 250 | p75 250 | p90 250 | max 250
empty:            375 rows (14.2%)
under 200 chars:  47.1%
over 1000 chars:  0.0%
```

`max = 250` exactly. That is not a distribution, that is a **ceiling**. Confirmed against
the layer definition:

```bash
curl -s -G "$B/22" --data-urlencode "f=json" | python3 -c "
import json,sys
for f in json.load(sys.stdin)['fields']: print(f['name'], f.get('length'))"
```

```
abstract    String    len=250      ← hard cap
keywords    String    len=250
dpxe_abs    String    len=1061     ← ???
```

Abstracts cut off **mid-word**:

> `...Exploration from 1992 to 1993 i`

**`BUILD.md` §2 — "Layer 22's `abstract` field is plain text and already populated" — is
only half true.** It is populated, and it is truncated to a fragment. See
[data findings](02-data-findings.md) for what we do about it.

## 5. `dpxe_abs` is a URL, and it resolves to the FULL abstract

```bash
curl -s -L "https://wamex.dmp.wa.gov.au/WAMEX/ExternalTool/CreateReportAbstractDialog?aNumber=38628"
```

Returns an HTML page with the complete abstract. Measured:

| A-number | Truncated (layer 22) | Full (dpxe_abs) | Gain |
|---|---|---|---|
| 38628 | 250 | **920** | 3.7× |
| 63511 | 250 | **1,216** | 4.9× |
| 100000 | 250 | **1,178** | 4.7× |

And the full text is genuinely excellent — see the samples in
[data findings](02-data-findings.md).

The page also carries **fields missing from the spatial layer**: for A38628 the spatial
layer had `author_company: null`, while the detail page gives
`Author: SMITH B`, `Operator: RAMSGATE RESOURCES LTD`.

## 6. `keywords` is a controlled vocabulary — and it's nearly complete

Across the 504 unique reports in the Kalgoorlie box:

```
unique keyword terms:      157
reports with no keywords:  6  (1.2%)
```

Top terms:

```
Drilling 313 | RC drilling 180 | Diamond drilling 152 | Geochemistry 138
Geophysics 129 | Geology 123 | Rotary drilling 105 | Geological mapping 77
Soil sampling 76 | Mineral resource estimate 73 | Data review 54
Rock chip sampling 39 | Ground magnetic surveys 36 | Mine production 31
Core library 30 | Petrology 29 | Auger drilling 28 | IP surveys 26
Gravity surveys 26 | No exploration 25 | ...
```

**98.8% coverage of a curated activity taxonomy.** This is a structured, deterministic
description of what happened on any piece of ground — with **zero LLM involvement and
therefore zero hallucination risk.** Significantly under-exploited in the current plan.

## 7. Data quality defects found

```
report_year range in Kalgoorlie box: 1753 – 2024
```

**1753** is 130 years before WA's gold rush. Confirmed bad data in the live feed. Ingest
must validate `report_year` into a sane range and quarantine the rest rather than
silently charting it.

## 8. Geochemistry — assays ARE available in bulk

`wamexgeochem.net.au` (WA Exploration Geochemistry Online), built by **Expedio for
GSWA**. Current basis: **May 2026 release**. Offers:

- Web query for downhole (DH) and surface (SS) assays
- **Postgres database backups: 56.7 GB (downhole) and 4.1 GB (surface)**
- SQL Server copies via DASC
- No public API found

Caveat stated on the site: **no quality control on assay results**; units of measure must
be verified against original reports.

So `DATA.md`'s "don't promise assays in v1" stands as *product* advice, but the technical
claim that assays are unavailable is outdated — they're downloadable, just heavy, and
56.7 GB does not fit the under-$20/month budget without care.

## 9. Competitive check — the important one

See [competitive landscape](03-competitive-landscape.md). Short version: **the Phase 2
product described in `BUILD.md` has already shipped commercially.**

---

## Commands to re-verify everything above

```bash
# counts
for L in 0 3 22 28 35 36 37; do
  curl -s -G "$B/$L/query" --data-urlencode "where=1=1" \
    --data-urlencode "returnCountOnly=true" --data-urlencode "f=json"; echo; done

# field definitions for any layer
curl -s -G "$B/22" --data-urlencode "f=json" | python3 -m json.tool | less

# full abstract for any anumber
curl -s -L "https://wamex.dmp.wa.gov.au/WAMEX/ExternalTool/CreateReportAbstractDialog?aNumber=<N>"
```

---

**Next:** [02-data-findings.md](02-data-findings.md)

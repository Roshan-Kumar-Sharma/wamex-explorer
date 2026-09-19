# Glossary

Terms you will meet in the data, the reports, and conversations with geologists.
Bookmark this.

---

## Data & identifiers

| Term | Meaning |
|---|---|
| **A-number / `anumber`** | The unique ID of a WAMEX report. e.g. `A38628`. **The single most important key in this project** — it joins drillholes (layer 28) to reports (layer 22), and it is the unit of citation. When we cite a claim, we cite an A-number. |
| **WAMEX** | *WA Mineral EXploration* — the database of statutory exploration reports. ~615,050 open-file records. |
| **Open file** | Public. Reports become open file after their confidentiality period expires. |
| **Confidential / closed file** | Still within the confidentiality window. Not in our data. |
| **DMIRS / DEMIRS / DMPE** | The WA government department. Renamed twice. Endpoints still use `dmirs.wa.gov.au`. Keep the name in exactly one config string. |
| **GSWA** | Geological Survey of Western Australia — the scientific arm. Wrote the report abstracts until ~2014; since then companies write their own, in a structured form. See `03-concepts/04-reading-a-wamex-abstract.md`. |
| **Report type** | *Annual* (yearly on a live tenement, 67% of the archive), *Final Surrender* (tenement given up — the life-of-tenement summary and the reason for leaving), *Partial Surrender*, *Non-statutory*, *Co-Funded Drilling / Geophysics* (EIS-funded, fast to open file), *Core Library*. |
| **EIS** | Exploration Incentive Scheme — WA government co-funds drilling and geophysics; the condition is early public release. |
| **Permalink / brief id** | In this project: a 12-char hash of the drawn polygon and filters. Same ground, same link. `/b/super-pit` etc. are slugs on top of ids. |
| **SLIP** | *Shared Location Information Platform* — WA's public spatial data service. Our ArcGIS REST endpoints. |
| **DASC** | *Data and Software Centre* — the bulk download portal. |
| **MDHDB** | *Minerals Drillhole and Geochemistry Database* — the separate, harmonised assay database. Where grades actually live. |
| **MINEDEX** | WA's database of mines and mineral deposits (48,431 records). Known deposits, as opposed to exploration attempts. |
| **TENGRAPH** | The government's tenement mapping system. |

## Tenure (who is allowed to be on the ground)

| Term | Meaning |
|---|---|
| **Tenement** | A granted title over a piece of ground. The legal unit of the industry. |
| **E** — Exploration Licence | e.g. `E15/317`. Right to explore, large area, time-limited, with minimum spend. |
| **P** — Prospecting Licence | Small, for prospectors and early work. |
| **M** — Mining Lease | e.g. `M26/148`. Right to actually mine. |
| **L** — Miscellaneous Licence | Infrastructure — roads, pipelines, bores. |
| **GML** | Gold Mining Lease (historical). |
| **Pegging** | Claiming ground. WA is largely first-in-time. |
| **Expenditure commitment** | Minimum annual spend required to keep a tenement. |
| **Forfeiture** | Losing a tenement, usually for underspending. |
| **Graticule / block** | The survey grid tenements are defined on. |
| **Vacant / open ground** | Ground under no live tenement. Available to peg. |

## Drilling

| Term | Meaning |
|---|---|
| **Collar** | The point where a hole meets the surface. x, y, z, total depth. **This is all layer 28 contains.** |
| **RAB** | Rotary Air Blast. Cheapest, shallow, poor samples. Reconnaissance. |
| **AC** | Aircore. Cheap, better than RAB, used to sample through cover. |
| **RC** | Reverse Circulation. The industry workhorse. Good samples, moderate cost. |
| **DD / DDH** | Diamond Drilling. Retrieves solid cylindrical **core**. Expensive, best data. |
| **Core** | The intact rock cylinder from diamond drilling. Stored in a **core library**. |
| **Downhole survey** | Measuring how a hole deviates. Holes bend — a "vertical" 300 m hole may end 20 m sideways. |
| **Azimuth / Dip** | Direction and angle of a hole. |
| **Intercept** | A length of hole with meaningful grade. Written like `12 m @ 3.4 g/t Au from 84 m`. |
| **Logging** | Recording rock type down the hole. |
| **`maxdepth`** | Total depth of the hole, in metres. |

## Measurement & reporting

| Term | Meaning |
|---|---|
| **g/t** | Grams per tonne. Gold grade. ~1 g/t ≈ open-pit economic edge. |
| **ppm / ppb** | Parts per million / billion. 1 g/t = 1 ppm. |
| **%** | Used for nickel, copper, iron, lithium (as % Li₂O). |
| **Oz** | Troy ounce, 31.1 g. |
| **Cut-off grade** | Minimum grade worth processing. |
| **JORC Code** | The Australasian reporting standard. Legally binding for ASX disclosure. |
| **Resource** (Inferred → Indicated → Measured) | Increasing geological confidence. |
| **Reserve** (Probable → Proved) | A resource *proven economic to mine*. Reserves are a subset of resources. |
| **Anomaly** | A measurement above background. A *target*, not a discovery. |
| **Prospect** | A named location being investigated. |
| **Barren** | No mineralisation found. |

> ⚠️ **Never state resource/reserve figures as fact in generated output without
> attributing them to the report and year.** JORC figures are legally sensitive and go
> stale. `A63511` reports a 2.83 Mt @ 2.25 g/t resource — that is *what the 2001 report
> said*, not what is there now.

## Geology (WA-specific)

| Term | Meaning |
|---|---|
| **Yilgarn Craton** | The ancient block of crust covering WA's southwest. Hosts most WA gold. |
| **Pilbara Craton** | The northwest. Iron ore, and some of the oldest rocks on Earth. |
| **Greenstone belt** | Bands of ancient volcanic/sedimentary rock within a craton. **Gold lives here.** |
| **Archean** | 4.0–2.5 billion years ago. Most WA gold host rocks. |
| **Regolith / Cover** | Weathered material over bedrock — commonly 20–100 m in the Yilgarn, deeper in palaeochannels. WA has deep cover, which is *why* exploration is hard here. RAB/aircore sample it; RC/diamond get below it. |
| **Fresh rock / bedrock** | Unweathered rock under the regolith. What the geologist actually wants. The brief uses "≥ 50 m or RC/DD" as a stated proxy for reaching it. |
| **Poseidon boom** | The 1969–70 nickel share bubble, triggered by Poseidon NL's Windarra discovery. Visible in the data as a cluster of nickel/copper/cobalt operators (INCO, Tasminex, Australian Selection…) around 1967–74 on ground that is otherwise gold. |
| **Ultramafic / Mafic / Felsic** | Rock chemistry: low → high silica. Ultramafic ≈ nickel. |
| **Shear zone** | A deformation structure. Often the plumbing that gold travelled through. |
| **Laterite / Saprolite** | Weathering layers in the regolith profile. |

## Geophysics & geochemistry

| Term | Meaning |
|---|---|
| **Aeromagnetics** | Airborne magnetic survey. Maps geology under cover. Very common in the keyword vocabulary. |
| **Gravity survey** | Maps density contrasts. |
| **IP** — Induced Polarisation | Detects disseminated sulphides. Common for base metals. |
| **EM** — Electromagnetics | Detects conductive bodies. Nickel sulphides. |
| **Soil / Lag / Rock chip sampling** | Surface geochemical sampling methods. |
| **Assay** | Lab analysis giving element concentrations. **Not in layer 28.** |

## Spatial & technical

| Term | Meaning |
|---|---|
| **WGS84 / EPSG:4326** | Global lat/long. What the API returns. |
| **MGA2020 / GDA2020** | Australian projected grid, in metres. What mining software expects. See [coordinate systems](../03-concepts/01-coordinate-systems.md). |
| **Zone 50 / 51** | The MGA zones covering WA. |
| **ArcGIS REST** | Esri's web API. SLIP's interface. |
| **WFS / WMS** | OGC standards — features / rendered images. |
| **PMTiles** | Single-file map tile format, served from static storage. |
| **Tippecanoe** | Tool that builds vector tiles from GeoJSON. |
| **GDB / SHP / TAB** | Esri Geodatabase / Shapefile / MapInfo — the bulk download formats. |
| **OMF** | Open Mining Format. Open 3D interchange format. |
| **IREDES** | International Rock Excavation Data Exchange Standard — drill rig communication. |
| **Grid convergence** | The angle between MGA grid north and true north — up to ~3° at a zone edge. Why the brief's coverage squares look tilted against a lat/long box. |

## Companies & people

| Term | Meaning |
|---|---|
| **Operator** | The company that did the work. |
| **Joint Venture (JV)** | Shared tenement arrangement. Reports may be filed by either party — one reason operator names are messy. |
| **Junior** | Small exploration company, no revenue, ASX-listed, survives on capital raises. **Our likely user.** |
| **Major** | BHP, Rio Tinto, Fortescue, Northern Star. |
| **SWUNG** | Software Underground — the open geoscience community. Active Slack. Our distribution channel. |
| **AusIMM** | Australasian Institute of Mining and Metallurgy. Professional body. |

---

**Next:** [03-how-wa-exploration-works.md](03-how-wa-exploration-works.md)

# Coordinate systems — and why mining cares so much

This is the concept most likely to silently produce wrong output, and the one geologists
will check first. `CLAUDE.md` calls it out as *"the exact trap `mineio` exists to handle."*

---

## The problem in one sentence

The Earth is a lumpy spheroid; maps and mine plans are flat; **there is no way to flatten
a curved surface without distorting something**, so you pick which distortion you can
live with.

## Two kinds of coordinates

### Geographic — angles on a spheroid

```
latitude  -30.7489°     (north/south)
longitude 121.4742°     (east/west)
```

**EPSG:4326 / WGS84.** What GPS gives you. What our API returns. Units are **degrees**,
which are not a distance — 1° of longitude is ~111 km at the equator and 0 km at the pole.

> **You cannot do metric geometry in degrees.** "These holes are 0.002 apart" is
> meaningless. Distances, areas and buffers in 4326 are wrong unless you use a geography
> type or reproject.

### Projected — metres on a flat grid

```
easting   341,208 m
northing  6,598,432 m
zone      51
```

**MGA2020** (Map Grid of Australia 2020), built on **GDA2020**. Units are **metres**. This
is what every mining package expects — Surpac, Micromine, Leapfrog, Datamine, Vulcan.

WA spans **zone 50** (114°E–120°E) and **zone 51** (120°E–126°E). Kalgoorlie at 121.47°E
is zone 51; Perth at 115.86°E is zone 50.

## The datum trap — GDA94 vs GDA2020

Australia moves. The continent drifts northeast at ~7 cm/year, and by 2020 the old GDA94
datum was **~1.8 metres** off from global position.

So GDA2020 replaced it. The consequence:

> **The same point has two different "correct" coordinates depending on datum, differing
> by ~1.8 m.**

For 50 years of WAMEX data spanning AGD66 → AGD84 → GDA94 → GDA2020, **you cannot assume
a datum — you must know it.** A 1.8 m error doesn't matter for a regional map. It matters
enormously when someone re-drills a historical hole and misses.

## Our rules

| Stage | System | Why |
|---|---|---|
| **Source** | WGS84 / EPSG:4326 | What the API gives |
| **Storage** | EPSG:4326 | One system everywhere, no ambiguity |
| **Display** | Web Mercator (EPSG:3857) | MapLibre handles this; you never touch it |
| **Area / distance** | `geography` or reproject | Never metric maths in degrees |
| **Export** | **MGA2020 zone 50/51** | What mining software needs |

**Convert only on export.** Storing one system and converting at the boundary means one
place to get it right, and `mineio` is that place.

> WGS84 and GDA2020 agree to within centimetres at epoch 2020, so treating API 4326 output
> as GDA2020-compatible is acceptable for this product. **State that assumption in
> exports rather than leaving it implicit** — a geologist will want to know.

## In practice

```python
from pyproj import Transformer

# WGS84 -> MGA2020 zone 51 (EPSG:7851)
to_mga51 = Transformer.from_crs("EPSG:4326", "EPSG:7851", always_xy=True)
easting, northing = to_mga51.transform(121.4742, -30.7489)
```

`always_xy=True` matters. Without it pyproj uses authority-defined axis order, which for
EPSG:4326 is **(lat, lon)** — the reverse of what you just typed. Silently swapped
coordinates put your holes in the wrong hemisphere.

```sql
-- correct: area in m², via geography
SELECT ST_Area(geom::geography) / 1e6 AS area_km2 FROM report_geometries;

-- wrong: "square degrees" — a meaningless number
SELECT ST_Area(geom) FROM report_geometries;
```

## EPSG codes to know

| Code | System |
|---|---|
| 4326 | WGS84 lat/long |
| 3857 | Web Mercator (web maps) |
| 7844 | GDA2020 lat/long |
| **7850** | **MGA2020 zone 50** — western WA |
| **7851** | **MGA2020 zone 51** — eastern WA, Kalgoorlie |
| 28350 / 28351 | MGA94 zones 50/51 (legacy, still common) |

## Failure modes to watch for

1. **Lat/long swapped** → points in the ocean off Somalia. Classic `always_xy` bug.
2. **Metric maths in degrees** → areas out by orders of magnitude.
3. **Wrong zone** → points ~hundreds of km east or west.
4. **Datum ignored** → ~1.8 m offset. Invisible on a map, fatal when re-drilling.
5. **Negative latitude dropped** → northern hemisphere. WA is all negative.

---

**Next:** [02-postgis-basics.md](02-postgis-basics.md)

# Vector tiles and PMTiles

How you draw 3,466,691 points in a browser without it dying.

---

## The problem

3.4M points as GeoJSON is roughly **600 MB–1 GB**. You cannot send that to a browser. Even
if you could, the browser cannot render 3.4M DOM elements or SVG paths.

But here's the thing: **at zoom level 4, looking at all of WA, you cannot perceive 3.4M
distinct points anyway.** They're one blob. So don't send them.

## The idea: tiles

Chop the world into a pyramid of square tiles. Zoom 0 is one tile for the whole world;
each zoom level quarters each tile.

```
z0:  1 tile          whole world
z4:  256 tiles       WA fits in a few
z10: ~1M tiles       a town
z14: ~268M tiles     a street
```

The browser requests **only the tiles in the viewport at the current zoom** — typically
4–20 tiles, a few hundred KB. Pan or zoom, fetch a few more.

## Raster vs vector tiles

| | Raster | Vector |
|---|---|---|
| Contains | A PNG image | Encoded geometry + attributes |
| Restyle | Re-render server-side | **Instantly, client-side** |
| Interactive | No — pixels | **Yes** — click a feature, get its data |
| Size | Larger | Smaller |

**We need vector.** Users must click a hole and see its `holeid`, `anumber`, `holetype`.
Pixels can't do that.

Vector tiles use **MVT** (Mapbox Vector Tile), a protobuf format. Universal, open.

## Generalisation — the clever part

A tile at z4 covering all of WA might contain 500,000 points. Still too many. So
`tippecanoe` **drops or clusters** features at low zooms, keeping everything only at high
zooms.

Visually you lose nothing — you couldn't resolve them anyway. This is why the whole
approach works.

> ⚠️ **Never compute statistics from tiles.** Counts at low zoom are generalised and
> therefore wrong. Tiles are for *display*; **PostGIS is for truth.** Every number shown
> to a user comes from a database query, never from what's rendered. Getting this backwards
> would produce confidently wrong hole counts — exactly the credibility failure
> `CLAUDE.md` is built to prevent.

## PMTiles — why not a tile server

Traditionally you run a tile server (Martin, pg_tileserv, TileServer GL) that generates
tiles on request. That's a process to run, pay for, scale and monitor.

**PMTiles is a single file** containing every tile, with an index at the front. The browser
uses an **HTTP Range request** to fetch just the bytes for the tiles it needs.

```
GET /drillholes.pmtiles
Range: bytes=1048576-1051000
```

Consequences:

- **No server.** Static object storage (Cloudflare R2).
- **No scaling concern.** It's a file on a CDN.
- **Effectively free.** R2 charges **zero egress** — see [cost model](../02-architecture/03-cost-model.md).

This is the single biggest cost decision in the project.

## Building ours

```bash
# 1. export from PostGIS to GeoJSON Lines (streams, doesn't buffer 3.4M in RAM)
ogr2ogr -f GeoJSONSeq drillholes.geojsonl \
  PG:"dbname=wamex" \
  -sql "SELECT objectid, holeid, anumber, holetype_std, maxdepth, geom FROM drillholes"

# 2. build the pmtiles archive
tippecanoe -o drillholes.pmtiles \
  --layer=drillholes \
  --minimum-zoom=4 --maximum-zoom=14 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --force \
  drillholes.geojsonl

# 3. upload to R2
rclone copy drillholes.pmtiles r2:wamex-tiles/
```

Key flags:

| Flag | Effect |
|---|---|
| `--drop-densest-as-needed` | Drops points from crowded tiles to hit the size limit. The main generalisation lever |
| `--extend-zooms-if-still-dropping` | Adds zoom levels until nothing needs dropping |
| `-z14` | Max zoom. Higher = bigger file. 14 is plenty for collars |
| `-Z4` | Min zoom. Below this, WA is too small to bother |

tippecanoe handles ~1M features/sec, so 3.4M points is a couple of minutes, not hours.

## Using it in MapLibre

```ts
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// register the pmtiles:// protocol once, before creating any map
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

map.addSource('drillholes', {
  type: 'vector',
  url: 'pmtiles://https://tiles.example.com/drillholes.pmtiles',
});

map.addLayer({
  id: 'holes',
  type: 'circle',
  source: 'drillholes',
  'source-layer': 'drillholes',   // must match --layer= from tippecanoe
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1, 14, 4],
    'circle-color': [
      'match', ['get', 'holetype_std'],
      'DD', '#e11d48',
      'RC', '#2563eb',
      'RAB', '#94a3b8',
      '#64748b',
    ],
  },
});
```

`source-layer` is the usual first mistake — it must match tippecanoe's `--layer` exactly,
and there is no error when it doesn't. The map is just empty.

## Why not deck.gl here

**deck.gl has no native PMTiles layer; MapLibre is specifically optimised for rendering
them.** For 3.4M points from tiles, MapLibre alone is the simpler and faster path.

deck.gl earns its place later, for **3D drillhole traces** (collar + azimuth + dip + depth
rendered as lines in space) — genuinely beyond MapLibre. See
[tech stack](../02-architecture/01-tech-stack.md).

## Rebuilding weekly

The data updates weekly (+881 holes in 3 days, measured). The PMTiles file must be rebuilt
and re-uploaded. That's a cron job: refresh PostGIS → re-run tippecanoe → upload.

The whole rebuild is a few minutes. Don't attempt incremental tile updates — regenerating
is simpler, cheap, and can't drift out of sync with the database.

---

**Back to:** [docs index](../README.md)

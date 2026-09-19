# Tech stack

Decided 19 Sep 2026. `CLAUDE.md` fixes the core choices (PostGIS, PMTiles, MapLibre) and
those are not being relitigated. This doc fills in everything around them, and proposes
**one evidence-based subtraction**.

---

## The shape of the system

```
┌──────────────────────────────────────────────────────────────┐
│  INGEST  (Python)                    runs weekly, offline    │
│  DASC bulk GDB/SHP ──► ogr2ogr ──► PostGIS ──► tippecanoe    │
│                                       │            │         │
└───────────────────────────────────────┼────────────┼─────────┘
                                        │            │
                              ┌─────────▼──┐   ┌─────▼──────┐
                              │ PostgreSQL │   │  .pmtiles  │
                              │ + PostGIS  │   │ (R2 static)│
                              └─────────┬──┘   └─────┬──────┘
                                        │            │
┌───────────────────────────────────────┼────────────┼─────────┐
│  SERVE  (TypeScript)                  │            │         │
│  Hono / Next Route Handlers ──────────┘            │         │
│         │                                          │         │
│         └──── JSON ────┐                           │         │
└────────────────────────┼───────────────────────────┼─────────┘
                         │                           │
              ┌──────────▼───────────────────────────▼─────────┐
              │  WEB  Next.js + MapLibre GL                    │
              └───────────────────────────────────────────────┘
```

**The split is deliberate: Python where the geospatial libraries live, TypeScript where
the user does.**

---

## Frontend

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15+ (App Router) + TypeScript** | Plays to your MERN strength per `CLAUDE.md`. One deploy target. Server components keep the map page light |
| Map | **MapLibre GL JS v5** | Fixed by `CLAUDE.md`. Free, no Mapbox billing, renders PMTiles natively |
| Tiles | **PMTiles** (`pmtiles` protocol handler) | Single static file, no tile server, effectively free hosting |
| Drawing | **Terra Draw** (or `@mapbox/mapbox-gl-draw` fork) | Polygon input. Terra Draw is MapLibre-native and actively maintained |
| Styling | **Tailwind v4 + shadcn/ui** | The output is a *document* — you need real typography, not map chrome |
| Server state | **TanStack Query** | Caching, dedupe, loading states for polygon queries |
| Charts | **Observable Plot** or Recharts | Timeline and depth histograms |

### The one change I'd make: drop deck.gl from v1

`CLAUDE.md` lists "MapLibre GL + deck.gl". The evidence says deck.gl is unnecessary here:
**deck.gl has no native PMTiles layer, and MapLibre is specifically optimised for
rendering PMTiles.** Adding deck.gl for 3.4M points that MapLibre already renders from
tiles means two rendering contexts to sync, for no gain.

**Keep deck.gl in the plan, add it when there's a reason** — the real reason will be 3D
drillhole traces (collar + azimuth + dip + depth as lines in 3D), which MapLibre genuinely
can't do and deck.gl does beautifully. That's a Phase 3+ feature.

This is a subtraction on evidence, not a relitigation of the stack. Flagging it rather
than silently doing it.

---

## Backend

Two runtimes, split by job. This is the most important decision in this doc.

### Ingest / ETL → **Python**

Non-negotiable. The geospatial toolchain is Python-native and there is no TypeScript
equivalent worth using:

| Tool | Job |
|---|---|
| **GDAL / `ogr2ogr`** | Read Esri GDB, SHP, MapInfo TAB → PostGIS. Nothing else reads GDB properly |
| **GeoPandas** | Dataframe operations on geometry |
| **pyproj** | WGS84 ↔ MGA2020 transforms |
| **psycopg3** + **SQLAlchemy** | Bulk load with `COPY` |
| **tippecanoe** (CLI) | GeoJSON → PMTiles |
| **Polars** or pandas | The cleaning work — dedupe, commodity splitting, year validation |

It also keeps the ingest code next to **`mineio`**, which is Python. Per `CLAUDE.md`
these projects are meant to feed each other.

### API → **TypeScript (Hono, or Next.js Route Handlers)**

The API does three things: take a polygon, run a PostGIS query, return JSON. That needs
no Python. Keeping it in TypeScript means one language for everything the user touches,
shared types between API and frontend, and trivial deployment.

**Start with Next.js Route Handlers.** Extract to standalone Hono only if the API
outgrows the web app — which it probably won't.

> **Why not FastAPI for everything?** It's a legitimate option and `BUILD.md` offers it.
> Rejected because it splits your frontend and API languages for no benefit — the API is
> thin. Python earns its place in ingest because of GDAL; it doesn't in the API layer.

### Database → **PostgreSQL 17 + PostGIS 3.5**

Fixed by `CLAUDE.md`, and correct — the whole product is spatial joins.

- **Dev:** Docker (`postgis/postgis:17-3.5`). Local, free, fast.
- **Prod:** see [cost model](03-cost-model.md). **Not Neon's free tier — verified at
  0.5 GB in 2026, too small for 3.4M points.**

Key extensions: `postgis`, `pg_trgm` (fuzzy company-name matching — you will need this),
`unaccent`.

### Tiles → **tippecanoe → `.pmtiles` → Cloudflare R2**

R2 specifically: **zero egress fees.** Map tiles are an egress-heavy workload and egress
is what turns a $5/month project into a $200/month surprise. 10 GB free storage.

### LLM → **Claude API, on demand, cached by polygon hash**

Fixed by `CLAUDE.md`. But per [data findings](../01-research/02-data-findings.md), **v1
should ship with no LLM at all** — the `keywords` controlled vocabulary supports a fully
factual brief with zero hallucination risk. Add generated prose later, as a clearly
labelled layer above a factual base.

---

## Full dependency list for Phase 0

```bash
# ingest
uv init && uv add geopandas psycopg[binary] pyproj polars shapely httpx
brew install gdal tippecanoe

# web
npx create-next-app@latest web --typescript --tailwind --app
cd web && npm i maplibre-gl pmtiles terra-draw @tanstack/react-query
```

---

## What we are explicitly NOT using, and why

| Not using | Why |
|---|---|
| Mapbox GL JS | Licensing + billing. MapLibre is the fork that stayed free |
| Tile server (Martin, pg_tileserv) | PMTiles is static. A server is a thing to run, pay for, and monitor |
| deck.gl (in v1) | No native PMTiles layer; MapLibre covers it. Revisit for 3D traces |
| Neon / Supabase free tier | Both 0.5 GB in 2026 — verified. Too small |
| Elasticsearch | Postgres FTS + `pg_trgm` is enough for 119k abstracts. Don't add a second datastore |
| An ORM in the API | The queries are hand-written PostGIS. An ORM fights you |
| Live SLIP queries per request | `CLAUDE.md` forbids it, correctly — slow, 10k-capped, and rude to a government service |

---

**Next:** [02-data-model.md](02-data-model.md)

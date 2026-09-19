# Running it locally

Everything runs on your machine; nothing is deployed.

---

## Prerequisites

- **Docker Desktop** (running)
- **Python 3.11+**
- **Node 20+**

For Phase 1: `brew install tippecanoe` (no dependencies). GDAL runs in Docker — see ADR-015.

**Disk:** Phase 1 needs ~6 GB free at peak (two GDB zips, their extraction, staging
tables, the export, and the tiles). Check `df -h` first.

## 1. Database

```bash
docker compose up -d
```

PostGIS 3.5 on **port 54329** (deliberately not 5432, to avoid clashing with any local
Postgres). `sql/001_schema.sql` is applied automatically on first boot.

> **Apple Silicon:** we use `imresamu/postgis:17-3.5`, not `postgis/postgis`. The official
> image is amd64-only and `docker compose up` fails on arm64. See ADR-009.

Check it:

```bash
docker exec -i wamex-db psql -U wamex -d wamex -c "SELECT postgis_version();"
```

## 2. Ingest — Phase 1 (all of WA)

```bash
cd ingest
python3 -m venv .venv && ./.venv/bin/pip install -e .
./.venv/bin/python run_phase1.py            # ~45 min, mostly download
```

Steps can be run individually: `--step download | load | transform | tiles`. Downloads
resume. The transform is a full reload and idempotent.

At the end it prints the env var to set:

```bash
echo "NEXT_PUBLIC_PMTILES_URL=/tiles/drillholes.pmtiles" > web/.env.local
```

Restart `npm run dev` after setting it — `NEXT_PUBLIC_*` is read at start.

Then drop the staging tables to reclaim ~4.5 GB (they rebuild in 90 s from the zips):

```sql
DROP TABLE raw_drillholes, raw_wamex;
```

## 2b. Ingest — Phase 0 (Kalgoorlie only, via REST)

```bash
cd ingest
python3 -m venv .venv && ./.venv/bin/pip install -e .
./.venv/bin/python run_phase0.py --reset
```

Pulls the 1°×1° Kalgoorlie box from the SLIP REST API. **~5.5 minutes**, ~357k drillholes
and ~10.9k reports. Paginates past the 10,000-record cap with a 0.5 s delay between
requests — please leave that in, it is a free government service.

Other boxes:

```bash
./.venv/bin/python run_phase0.py --bbox 121.4,-30.8,121.55,-30.7 --reset   # small, ~10 s
./.venv/bin/python run_phase0.py --skip-holes                              # reports only
```

## 3. Web

```bash
cd web
npm install
npm run dev
```

http://localhost:3000 — **Draw polygon** or **Draw box**, then read the panel. **Save &
share as document** creates the permalink and opens it.

> `npm run dev` uses **webpack**, not Turbopack (`npm run dev:turbo` if you want it).
> `predev` copies MapLibre's worker into `public/maplibre/` — see ADR-012.

## 3b. Phase 2 — permalinks, full abstracts, famous ground

The Phase 2 schema is a separate file because the database already existed when it was
written. Apply it once (idempotent):

```bash
psql postgresql://wamex:wamex@localhost:54329/wamex -f sql/020_phase2.sql
```

Baselines for the "against the rest of WA" comparison (36 s; re-run after every refresh):

```bash
psql postgresql://wamex:wamex@localhost:54329/wamex -f sql/021_baselines.sql
```

Optional, in `web/.env.local` — who the department sees when we fetch an abstract
(ADR-020). Falls back to the repo URL if unset:

```bash
echo 'WAMEX_CONTACT=you@example.com' >> web/.env.local
```

Pre-generate the four briefs for well-known ground (dev server must be running):

```bash
cd web && node scripts/seed-briefs.mjs
```

Then http://localhost:3000/b/super-pit, `/b/boddington`, `/b/tropicana`, `/b/mt-keith`.
Each box was checked against the register by dominant operator before it went in the
script; if you move one, do the same check.

## Checking the data

```bash
docker exec -i wamex-db psql -U wamex -d wamex
```

```sql
-- the dedupe that makes every count correct (expect ~5.2)
SELECT (SELECT count(*) FROM report_geometries)::numeric
     / (SELECT count(*) FROM reports) AS dedupe_factor;

-- what got quarantined, and why
SELECT reason, count(DISTINCT source_id) FROM rejected_rows GROUP BY 1 ORDER BY 2 DESC;

-- drilling profile (should show DD deepest, RAB shallowest)
SELECT holetype_std, count(*), round(avg(maxdepth)) AS avg_m
FROM drillholes GROUP BY 1 ORDER BY 2 DESC;

-- holes whose report is not in our box (expected; not an error)
SELECT count(*) FROM drillholes d
LEFT JOIN reports r USING (anumber) WHERE r.anumber IS NULL;
```

## API, without the UI

```bash
curl -s -X POST http://localhost:3000/api/brief \
  -H 'Content-Type: application/json' \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[121.40,-30.80],[121.55,-30.80],[121.55,-30.70],[121.40,-30.70],[121.40,-30.80]]]}}' | python3 -m json.tool
```

That exact box is the reference case: **504 reports** on either load path, and **12,396
drillholes** from the REST API on 19 Sep (12,387 from the 14 Sep bulk file — the state
gained 863 holes in between).

Phase 2 endpoints:

```bash
# create (or find) the permalink for a polygon -> {"id","url","existing"}
curl -s -X POST http://localhost:3000/api/briefs -H 'Content-Type: application/json' \
  -d '{"geometry":{...},"filters":{},"title":"optional"}'

# the stored brief, its polygon and filters
curl -s http://localhost:3000/api/briefs/super-pit | python3 -m json.tool | head -40

# one report's full abstract, fetched from DMPE on first call and cached after
curl -s http://localhost:3000/api/abstract/40846

# exports: section G table, inventory, whole brief, collars
curl -sO -J http://localhost:3000/api/briefs/super-pit/timeline.csv
curl -sO -J http://localhost:3000/api/briefs/super-pit/brief.md
curl -sO -J http://localhost:3000/api/briefs/super-pit/holes.geojson
```

In dev, `meta.timings` in the brief JSON is the wall time of each query in
`lib/brief.ts` order — the first place to look when a polygon is slow.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `no matching manifest for linux/arm64` | Wrong PostGIS image — ADR-009 |
| Map blank, no error in console | Is the tab **hidden**? Browsers suspend `requestAnimationFrame`, so MapLibre never paints. Check `document.visibilityState` |
| `Failed to load module script: text/html` | MapLibre worker not in `public/` — run `npm run sync:maplibre` |
| `invalid reference to FROM-clause entry` | `FROM a, b JOIN c` parses as `a, (b JOIN c)`. Put real joins first, `CROSS JOIN aoi` last |
| Ingest stalls | SLIP rate limiting. The client retries with backoff; leave `REQUEST_DELAY_S` alone |
| DASC download at 20 KB/s | Normal from this network. It resumes; let it run. Don't run two at once |
| `No space left on device` | Check `df -h`. `brew cleanup -s`, delete `data/dasc/<name>/` extractions, drop `raw_*` tables |
| Map shows few points when zoomed in | Tiles built with default drop-rate. Rebuild: `run_phase1.py --step tiles` (ADR-016) |
| Header says "Phase 0" | `NEXT_PUBLIC_PMTILES_URL` not set, or dev server not restarted after setting it |

## Resetting

```bash
docker compose down -v      # deletes the volume; re-ingest afterwards
```

---

**Back to:** [docs index](../README.md)

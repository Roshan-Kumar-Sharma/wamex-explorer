# Running it locally

Phase 0. Everything runs on your machine; nothing is deployed.

---

## Prerequisites

- **Docker Desktop** (running)
- **Python 3.11+**
- **Node 20+**

Not needed yet: `ogr2ogr` and `tippecanoe` arrive in Phase 1 with the bulk ingest.

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

## 2. Ingest

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

http://localhost:3000 — click **Draw an area**, drag a box inside the dashed outline.

> `npm run dev` uses **webpack**, not Turbopack (`npm run dev:turbo` if you want it).
> `predev` copies MapLibre's worker into `public/maplibre/` — see ADR-012.

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

That exact box is the reference case: **12,396 drillholes, 504 reports** — matching the
figure `DATA.md` measured directly against the live API.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `no matching manifest for linux/arm64` | Wrong PostGIS image — ADR-009 |
| Map blank, no error in console | Is the tab **hidden**? Browsers suspend `requestAnimationFrame`, so MapLibre never paints. Check `document.visibilityState` |
| `Failed to load module script: text/html` | MapLibre worker not in `public/` — run `npm run sync:maplibre` |
| `invalid reference to FROM-clause entry` | `FROM a, b JOIN c` parses as `a, (b JOIN c)`. Put real joins first, `CROSS JOIN aoi` last |
| Ingest stalls | SLIP rate limiting. The client retries with backoff; leave `REQUEST_DELAY_S` alone |

## Resetting

```bash
docker compose down -v      # deletes the volume; re-ingest afterwards
```

---

**Back to:** [docs index](../README.md)

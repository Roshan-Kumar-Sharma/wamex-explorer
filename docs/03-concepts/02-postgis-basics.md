# PostGIS basics

Spatial SQL from zero. Written against our actual schema, not toy examples.

---

## What PostGIS adds

A `geometry` column type, functions that operate on it, and — critically — **indexes that
make spatial queries fast**. Without the index, "which reports intersect this polygon?"
scans 3.2M rows.

```sql
CREATE EXTENSION postgis;
SELECT PostGIS_Version();
```

## Geometry types we use

| Type | Our table |
|---|---|
| `POINT` | `drillholes.geom` — one collar |
| `POLYGON` / `MULTIPOLYGON` | `report_geometries.geom` — report coverage |

The SRID (spatial reference ID) is part of the type: `geometry(Point, 4326)`. **Operations
between different SRIDs error out** — a good thing, it catches the bug class from
[coordinate systems](01-coordinate-systems.md).

## The functions that matter

```sql
-- does A intersect B? the workhorse
ST_Intersects(a, b)          -- boolean, uses the index

-- is A entirely inside B?
ST_Within(a, b)

-- distance in metres (note the ::geography cast)
ST_Distance(a::geography, b::geography)

-- parse GeoJSON from the frontend
ST_GeomFromGeoJSON($1)

-- emit GeoJSON to the frontend
ST_AsGeoJSON(geom)

-- area in km²
ST_Area(geom::geography) / 1e6

-- a buffer in metres
ST_Buffer(geom::geography, 500)
```

## Indexes: GIST

```sql
CREATE INDEX ON report_geometries USING GIST (geom);
CREATE INDEX ON drillholes USING GIST (geom);
```

A GIST index stores each geometry's **bounding box** in a tree. A spatial query then runs
in two stages:

1. **Index scan** — cheap bounding-box test, throws out ~99.9% of rows
2. **Exact test** — expensive true geometry test, on the survivors only

`ST_Intersects` uses the index automatically. **`ST_Distance` does not** — so to find
"holes within 500 m", don't compute distance for 3.4M rows:

```sql
-- slow: no index, scans everything
WHERE ST_Distance(geom::geography, $1::geography) < 500

-- fast: ST_DWithin uses the index
WHERE ST_DWithin(geom::geography, $1::geography, 500)
```

`ST_DWithin` is the single most useful optimisation in this whole file.

## Our real queries

**Count holes in a drawn polygon** — the Phase 0 success criterion:

```sql
SELECT count(*)
FROM drillholes
WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1));
```

**Activity summary from the controlled vocabulary** — zero-hallucination facts:

```sql
SELECT k.term, count(DISTINCT rk.anumber) AS reports
FROM report_geometries g
JOIN report_keywords rk USING (anumber)
JOIN keywords k ON k.id = rk.keyword_id
WHERE ST_Intersects(g.geom, ST_GeomFromGeoJSON($1))
GROUP BY k.term
ORDER BY reports DESC;
```

**Drilling by decade and type:**

```sql
SELECT (EXTRACT(year FROM period_from)::int / 10) * 10 AS decade,
       holetype_std,
       count(*)        AS holes,
       round(sum(maxdepth)) AS total_m
FROM drillholes
WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))
GROUP BY 1, 2 ORDER BY 1, 2;
```

**Remember `COUNT(DISTINCT anumber)` for anything report-related** — 5.3× duplication, see
[data findings](../01-research/02-data-findings.md).

## Reading query plans

```sql
EXPLAIN ANALYZE SELECT count(*) FROM drillholes
WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1));
```

Look for `Index Scan using ... on drillholes`. If you see `Seq Scan` on a 3.4M row table,
the index isn't being used and the query will take seconds instead of milliseconds.

Common causes: SRID mismatch, a function wrapping the indexed column, or stale stats
(`ANALYZE drillholes;` after bulk load — easy to forget, and the planner needs it).

## Bulk loading

`INSERT` row by row for 3.4M rows takes hours. Use `COPY`, or `ogr2ogr` directly:

```bash
ogr2ogr -f PostgreSQL PG:"dbname=wamex" drillholes.gdb \
  -nln drillholes_raw -lco GEOMETRY_NAME=geom \
  -t_srs EPSG:4326 -progress
```

Then transform from `drillholes_raw` into the real schema in SQL. **Load raw first,
transform second** — it means a parsing failure and a business-logic failure are different
problems on different days.

---

**Next:** [03-vector-tiles-and-pmtiles.md](03-vector-tiles-and-pmtiles.md)

-- Baselines: how dense is drilling and reporting across WA, per grid cell, so a
-- brief can say "this area is denser than X% of drilled ground at this scale".
--
-- Population: every square cell (2, 5, 10, 25 km, in the MGA2020 zone of the
-- cell's own longitude) that contains at least ONE exploration drillhole
-- (water bores and costeans excluded, as in the coverage grid). Cells with no
-- drilling at all are not in the population -- most of WA -- so the comparison
-- is against ground someone has drilled, not against desert.
--
-- Metrics per cell: holes / km2, metres / km2, distinct reports / km2 (reports
-- whose footprint intersects the cell). Stored as percentile curves (0..100)
-- so a rank is one array lookup. Re-run after each data refresh (~2-4 min).

SET client_min_messages = WARNING;

CREATE TABLE IF NOT EXISTS baselines (
    cell_km   integer NOT NULL,
    metric    text    NOT NULL,     -- holes_per_km2 | metres_per_km2 | reports_per_km2
    n_cells   integer NOT NULL,
    pct       float8[] NOT NULL,    -- 101 values: percentile 0 .. 100
    built_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cell_km, metric)
);

-- Every exploration hole snapped to its (zone, i, j) cell at each size.
DROP TABLE IF EXISTS _bl_holes;
CREATE TEMP TABLE _bl_holes AS
SELECT s.cell_km,
       z.srid,
       floor(ST_X(ST_Transform(d.geom, z.srid)) / (s.cell_km * 1000))::int AS i,
       floor(ST_Y(ST_Transform(d.geom, z.srid)) / (s.cell_km * 1000))::int AS j,
       d.maxdepth
  FROM drillholes d
  CROSS JOIN LATERAL (SELECT 7800 + floor((ST_X(d.geom) + 180) / 6)::int + 1 AS srid) z
  CROSS JOIN (VALUES (2), (5), (10), (25)) AS s(cell_km)
 WHERE d.holetype_std NOT IN ('WATER_BORE', 'COSTEAN');

DROP TABLE IF EXISTS _bl_cells;
CREATE TEMP TABLE _bl_cells AS
SELECT cell_km, srid, i, j,
       count(*)::int AS holes,
       coalesce(sum(maxdepth), 0)::float8 AS metres,
       ST_Transform(ST_MakeEnvelope(i * cell_km * 1000, j * cell_km * 1000,
                                    (i + 1) * cell_km * 1000, (j + 1) * cell_km * 1000, srid), 4326) AS geom
  FROM _bl_holes
 GROUP BY cell_km, srid, i, j;
CREATE INDEX ON _bl_cells USING GIST (geom);

-- Reports per cell: distinct A-numbers whose footprint touches the cell.
DROP TABLE IF EXISTS _bl_reports;
CREATE TEMP TABLE _bl_reports AS
SELECT c.cell_km, c.srid, c.i, c.j, count(DISTINCT rg.anumber)::int AS reports
  FROM _bl_cells c
  JOIN report_geometries rg ON ST_Intersects(rg.geom, c.geom)
 GROUP BY c.cell_km, c.srid, c.i, c.j;

DELETE FROM baselines;
INSERT INTO baselines (cell_km, metric, n_cells, pct)
SELECT cell_km, 'holes_per_km2', count(*),
       percentile_cont((SELECT array_agg(p / 100.0) FROM generate_series(0, 100) p)) WITHIN GROUP (ORDER BY holes::float8 / (cell_km * cell_km))
  FROM _bl_cells GROUP BY cell_km
UNION ALL
SELECT cell_km, 'metres_per_km2', count(*),
       percentile_cont((SELECT array_agg(p / 100.0) FROM generate_series(0, 100) p)) WITHIN GROUP (ORDER BY metres / (cell_km * cell_km))
  FROM _bl_cells GROUP BY cell_km
UNION ALL
SELECT c.cell_km, 'reports_per_km2', count(*),
       percentile_cont((SELECT array_agg(p / 100.0) FROM generate_series(0, 100) p)) WITHIN GROUP (ORDER BY coalesce(r.reports, 0)::float8 / (c.cell_km * c.cell_km))
  FROM _bl_cells c LEFT JOIN _bl_reports r USING (cell_km, srid, i, j) GROUP BY c.cell_km;

DROP TABLE _bl_holes; DROP TABLE _bl_cells; DROP TABLE _bl_reports;

SELECT cell_km, metric, n_cells, round(pct[51]::numeric, 3) AS median, round(pct[91]::numeric, 2) AS p90, round(pct[100]::numeric, 1) AS p99
  FROM baselines ORDER BY cell_km, metric;

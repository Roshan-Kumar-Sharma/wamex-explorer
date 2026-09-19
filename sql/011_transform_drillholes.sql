-- raw_drillholes (from DASC GDB via ogr2ogr) -> drillholes, drillhole_commodities.
-- Full reload; idempotent. holetype_map must be seeded first (see run_phase1.py).

SET client_min_messages = WARNING;

BEGIN;

INSERT INTO ingest_runs (layer, bbox) VALUES ('drillholes_gdb', 'all-WA');

TRUNCATE drillhole_commodities, drillholes RESTART IDENTITY CASCADE;
DELETE FROM rejected_rows WHERE source_layer = '28';

-- ── quarantine ───────────────────────────────────────────────────────────
INSERT INTO rejected_rows (source_layer, source_id, reason, raw)
SELECT '28', objectid::text,
       CASE WHEN geom IS NULL THEN 'missing_geometry'
            WHEN NOT (ST_X(geom) BETWEEN 112 AND 130 AND ST_Y(geom) BETWEEN -36 AND -12)
                 THEN 'coordinates_outside_wa'
       END,
       jsonb_build_object('objectid', objectid, 'holeid', holeid, 'anumber', anumber,
                          'x', ST_X(geom), 'y', ST_Y(geom))
FROM raw_drillholes
WHERE geom IS NULL
   OR NOT (ST_X(geom) BETWEEN 112 AND 130 AND ST_Y(geom) BETWEEN -36 AND -12);

-- ── drillholes ───────────────────────────────────────────────────────────
INSERT INTO drillholes (objectid, holeid, collarid, anumber, holetype, holetype_std,
    maxdepth, operator, project, period_from, period_to, extract_date, geom)
SELECT DISTINCT ON (r.objectid)
       r.objectid,
       nullif(trim(r.holeid), ''),
       nullif(trim(r.collarid), ''),
       r.anumber,
       nullif(trim(r.holetype), ''),
       coalesce(m.std, CASE WHEN nullif(trim(r.holetype), '') IS NULL THEN 'UNKNOWN' ELSE 'OTHER' END),
       r.maxdepth,
       nullif(trim(r.operator), ''),
       nullif(trim(r.project), ''),
       r.period_from::date, r.period_to::date, r.extract_date::date,
       ST_SetSRID(ST_Force2D(r.geom), 4326)
FROM raw_drillholes r
LEFT JOIN holetype_map m ON m.raw = upper(trim(r.holetype))
WHERE r.geom IS NOT NULL
  AND ST_X(r.geom) BETWEEN 112 AND 130 AND ST_Y(r.geom) BETWEEN -36 AND -12
ORDER BY r.objectid;

-- ── commodities ──────────────────────────────────────────────────────────
INSERT INTO commodities (name)
SELECT DISTINCT upper(trim(t))
FROM raw_drillholes r
CROSS JOIN LATERAL unnest(string_to_array(r.target_commodity, ';')) AS t
WHERE trim(t) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO drillhole_commodities (objectid, commodity_id)
SELECT DISTINCT r.objectid, c.id
FROM raw_drillholes r
JOIN drillholes d ON d.objectid = r.objectid
CROSS JOIN LATERAL unnest(string_to_array(r.target_commodity, ';')) AS t
JOIN commodities c ON c.name = upper(trim(t))
WHERE trim(t) <> '';

-- ── audit ────────────────────────────────────────────────────────────────
UPDATE ingest_runs SET
    finished_at = now(),
    rows_in = (SELECT count(*) FROM raw_drillholes),
    rows_loaded = (SELECT count(*) FROM drillholes),
    rows_rejected = (SELECT count(*) FROM rejected_rows WHERE source_layer = '28'),
    max_extract_date = (SELECT max(extract_date) FROM drillholes)
WHERE id = (SELECT max(id) FROM ingest_runs WHERE layer = 'drillholes_gdb');

ANALYZE drillholes; ANALYZE drillhole_commodities;

COMMIT;

SELECT holetype_std, count(*) AS holes, round(avg(maxdepth)) AS avg_m
FROM drillholes GROUP BY 1 ORDER BY 2 DESC;
SELECT 'rejected (28): ' || count(*) FROM rejected_rows WHERE source_layer = '28';

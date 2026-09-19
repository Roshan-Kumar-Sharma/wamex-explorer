-- raw_drillholes (from DASC GDB via ogr2ogr) -> drillholes, drillhole_commodities.
-- Full reload; idempotent. holetype_map must be seeded first (see run_phase1.py).

SET client_min_messages = WARNING;

BEGIN;

INSERT INTO ingest_runs (layer, bbox) VALUES ('drillholes_gdb', 'all-WA');

TRUNCATE drillhole_commodities, drillholes RESTART IDENTITY CASCADE;
DELETE FROM rejected_rows WHERE source_layer = '28';

-- Bounds include the Indian Ocean Territories: Christmas Island (105.6E, -10.5S)
-- has a phosphate mine and 27,409 drillholes in this dataset; WA's mines
-- department administers it. Cocos (Keeling) at 96.8E is included for safety.
-- ── quarantine ───────────────────────────────────────────────────────────
INSERT INTO rejected_rows (source_layer, source_id, reason, raw)
SELECT '28', objectid::text,
       CASE WHEN geom IS NULL THEN 'missing_geometry'
            WHEN NOT (ST_X(geom) BETWEEN 96 AND 130 AND ST_Y(geom) BETWEEN -36 AND -9)
                 THEN 'coordinates_outside_wa'
       END,
       jsonb_build_object('objectid', objectid, 'holeid', holeid, 'anumber', anumber,
                          'x', ST_X(geom), 'y', ST_Y(geom))
FROM raw_drillholes
WHERE geom IS NULL
   OR NOT (ST_X(geom) BETWEEN 96 AND 130 AND ST_Y(geom) BETWEEN -36 AND -9);

-- maxdepth of -999 / -9999 / 9999 is a sentinel for "unknown". Logged, then
-- NULLed below; the hole itself is real and kept. 9999 was found in Phase 2
-- (64 holes, all UNKNOWN/RAB). The deepest genuine value is 4,431 m -- a
-- Canning Basin petroleum well filed under a minerals report -- so the cap
-- is 9000, well clear of anything real.
INSERT INTO rejected_rows (source_layer, source_id, reason, raw)
SELECT '28', objectid::text,
       CASE WHEN maxdepth < 0 THEN 'maxdepth_negative_sentinel' ELSE 'maxdepth_9999_sentinel' END,
       jsonb_build_object('objectid', objectid, 'holeid', holeid, 'maxdepth', maxdepth)
FROM raw_drillholes WHERE maxdepth < 0 OR maxdepth >= 9000;

-- ── drillholes ───────────────────────────────────────────────────────────
INSERT INTO drillholes (objectid, holeid, collarid, anumber, holetype, holetype_std,
    maxdepth, operator, project, period_from, period_to, extract_date, geom)
SELECT DISTINCT ON (r.objectid)
       r.objectid,
       nullif(trim(r.holeid), ''),
       r.collarid::text,
       r.anumber,
       nullif(trim(r.holetype), ''),
       coalesce(m.std, CASE WHEN nullif(trim(r.holetype), '') IS NULL THEN 'UNKNOWN' ELSE 'OTHER' END),
       CASE WHEN r.maxdepth < 0 OR r.maxdepth >= 9000 THEN NULL ELSE r.maxdepth END,
       nullif(trim(r.operator), ''),
       nullif(trim(r.project), ''),
       r.period_from::date, r.period_to::date, r.extract_date::date,
       ST_SetSRID(ST_Force2D(r.geom), 4326)
FROM raw_drillholes r
LEFT JOIN holetype_map m ON m.raw = upper(trim(r.holetype))
WHERE r.geom IS NOT NULL
  AND ST_X(r.geom) BETWEEN 96 AND 130 AND ST_Y(r.geom) BETWEEN -36 AND -9
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

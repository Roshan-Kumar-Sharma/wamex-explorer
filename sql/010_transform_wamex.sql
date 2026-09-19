-- raw_wamex (from DASC GDB via ogr2ogr) -> reports, report_geometries,
-- keywords, commodities. Full reload; idempotent.
--
-- What the raw data actually looks like (measured 19 Sep 2026):
--   615,050 rows, 118,834 distinct anumbers, avg 5.18 rows each, max 6.
--   The duplicate rows are EXACT copies -- same item_no, same URL, same
--   geometry. This is a bad join in the upstream export, not "one polygon
--   per tenement". 108,522 of 108,523 shaped reports have exactly one
--   distinct geometry. So: DISTINCT ON (anumber) is correct and loses nothing.
--
--   59,242 rows (10,430 reports) have NULL geometry -- is_shaped = 0.
--   385 geometries are invalid (ring self-intersection) -> ST_MakeValid.
--   15,300 rows carry report_year = 1753 (SQL Server datetime floor = NULL).

SET client_min_messages = WARNING;

BEGIN;

INSERT INTO ingest_runs (layer, bbox) VALUES ('wamex_gdb', 'all-WA') ;

TRUNCATE report_commodities, report_keywords, report_geometries, reports
  RESTART IDENTITY CASCADE;
DELETE FROM rejected_rows WHERE source_layer = '22';

-- ── quarantine: bad years, before we touch them ──────────────────────────
INSERT INTO rejected_rows (source_layer, source_id, reason, raw)
SELECT '22', anumber::text,
       CASE WHEN date_from IS NOT NULL
                 AND extract(year FROM date_from) BETWEEN 1880 AND extract(year FROM now()) + 1
            THEN 'report_year_recovered_from_date_from'
            ELSE 'report_year_unrecoverable' END,
       jsonb_build_object('anumber', anumber, 'report_year', report_year,
                          'date_from', date_from, 'title', title)
FROM (SELECT DISTINCT ON (anumber) * FROM raw_wamex ORDER BY anumber, ogc_fid) r
WHERE report_year IS NOT NULL
  AND report_year NOT BETWEEN 1880 AND extract(year FROM now()) + 1;

-- ── reports: ONE row per anumber ─────────────────────────────────────────
INSERT INTO reports (anumber, title, report_year, report_year_raw, author_name,
    author_company, operator, report_type, project, date_from, date_to,
    date_released, abstract_short, url_abstract, url_report, has_digital_file,
    extract_date)
SELECT DISTINCT ON (anumber)
       anumber,
       nullif(trim(title), ''),
       CASE
         WHEN report_year BETWEEN 1880 AND extract(year FROM now()) + 1 THEN report_year
         WHEN date_from IS NOT NULL
              AND extract(year FROM date_from) BETWEEN 1880 AND extract(year FROM now()) + 1
           THEN extract(year FROM date_from)::smallint
         ELSE NULL
       END,
       report_year,
       nullif(trim(author_name), ''),
       nullif(trim(author_company), ''),
       nullif(trim(operator), ''),
       nullif(trim(report_type), ''),
       nullif(trim(project), ''),
       date_from::date, date_to::date, date_released::date,
       nullif(trim(abstract), ''),
       nullif(trim(dpxe_abs), ''),
       nullif(trim(dpxe_rep), ''),
       digital_file = 1,
       extract_date::date
FROM raw_wamex
ORDER BY anumber, ogc_fid;

-- ── geometries: one per (anumber, distinct shape) ────────────────────────
INSERT INTO report_geometries (anumber, geom)
SELECT anumber, ST_Multi(ST_MakeValid(ST_SetSRID(geom, 4326)))
FROM (SELECT DISTINCT ON (anumber, md5(ST_AsBinary(geom))) anumber, geom
        FROM raw_wamex WHERE geom IS NOT NULL
       ORDER BY anumber, md5(ST_AsBinary(geom)), ogc_fid) g
WHERE NOT ST_IsEmpty(geom);

-- ── controlled vocabulary ────────────────────────────────────────────────
INSERT INTO keywords (term)
SELECT DISTINCT trim(t)
FROM reports r JOIN raw_wamex w USING (anumber)
CROSS JOIN LATERAL unnest(string_to_array(w.keywords, ';')) AS t
WHERE trim(t) <> ''
ON CONFLICT (term) DO NOTHING;

INSERT INTO report_keywords (anumber, keyword_id)
SELECT DISTINCT w.anumber, k.id
FROM (SELECT DISTINCT ON (anumber) anumber, keywords FROM raw_wamex ORDER BY anumber, ogc_fid) w
CROSS JOIN LATERAL unnest(string_to_array(w.keywords, ';')) AS t
JOIN keywords k ON k.term = trim(t)
WHERE trim(t) <> '';

-- ── commodities ──────────────────────────────────────────────────────────
INSERT INTO commodities (name)
SELECT DISTINCT upper(trim(t))
FROM (SELECT DISTINCT ON (anumber) target_commodity FROM raw_wamex ORDER BY anumber, ogc_fid) w
CROSS JOIN LATERAL unnest(string_to_array(w.target_commodity, ';')) AS t
WHERE trim(t) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO report_commodities (anumber, commodity_id)
SELECT DISTINCT w.anumber, c.id
FROM (SELECT DISTINCT ON (anumber) anumber, target_commodity FROM raw_wamex ORDER BY anumber, ogc_fid) w
CROSS JOIN LATERAL unnest(string_to_array(w.target_commodity, ';')) AS t
JOIN commodities c ON c.name = upper(trim(t))
WHERE trim(t) <> '';

-- ── audit ────────────────────────────────────────────────────────────────
UPDATE ingest_runs SET
    finished_at = now(),
    rows_in = (SELECT count(*) FROM raw_wamex),
    rows_loaded = (SELECT count(*) FROM reports),
    rows_rejected = (SELECT count(*) FROM rejected_rows WHERE source_layer = '22'),
    max_extract_date = (SELECT max(extract_date) FROM reports)
WHERE id = (SELECT max(id) FROM ingest_runs WHERE layer = 'wamex_gdb');

ANALYZE reports; ANALYZE report_geometries; ANALYZE report_keywords; ANALYZE report_commodities;

COMMIT;

SELECT 'reports' AS t, count(*) FROM reports
UNION ALL SELECT 'report_geometries', count(*) FROM report_geometries
UNION ALL SELECT 'keywords', count(*) FROM keywords
UNION ALL SELECT 'commodities', count(*) FROM commodities
UNION ALL SELECT 'report_keywords', count(*) FROM report_keywords
UNION ALL SELECT 'rejected (22)', count(*) FROM rejected_rows WHERE source_layer='22';

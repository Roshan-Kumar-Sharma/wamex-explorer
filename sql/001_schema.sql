-- wamex-explorer schema, Phase 0
-- See docs/02-architecture/02-data-model.md for the reasoning behind every choice here.
-- Core principle: ONE ROW PER REAL-WORLD THING.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────
-- reports: ONE row per A-number.
-- The API returns one row per *polygon* (measured 5.3x duplication), so the
-- ingest must collapse to A-number here or every user-facing count is wrong.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE reports (
    anumber             integer PRIMARY KEY,
    title               text,
    report_year         smallint,      -- validated 1880..current+1, else NULL
    report_year_raw     integer,       -- original. 1753 exists in live data.
    author_name         text,
    author_company      text,
    operator            text,
    report_type         text,
    project             text,
    date_from           date,
    date_to             date,
    date_released       date,          -- when it went open file
    abstract_short      text,          -- the varchar(250) truncation
    abstract_full       text,          -- from dpxe_abs URL; NULL until fetched
    abstract_fetched_at timestamptz,
    url_abstract        text,
    url_report          text,
    has_digital_file    boolean,
    extract_date        date
);

-- MANY rows per A-number.
CREATE TABLE report_geometries (
    id      bigserial PRIMARY KEY,
    anumber integer NOT NULL REFERENCES reports(anumber) ON DELETE CASCADE,
    geom    geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX report_geometries_geom_idx ON report_geometries USING GIST (geom);
CREATE INDEX report_geometries_anumber_idx ON report_geometries (anumber);

-- ─────────────────────────────────────────────────────────────────────────
-- Controlled vocabulary. 157 terms measured, 98.8% coverage.
-- This is the zero-hallucination backbone: every fact derivable from these
-- tables is a GROUP BY, and a GROUP BY cannot hallucinate.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE keywords (
    id   serial PRIMARY KEY,
    term text UNIQUE NOT NULL
);
CREATE TABLE report_keywords (
    anumber    integer NOT NULL REFERENCES reports(anumber) ON DELETE CASCADE,
    keyword_id integer NOT NULL REFERENCES keywords(id),
    PRIMARY KEY (anumber, keyword_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Commodities: split from the ';'-delimited source string.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE commodities (
    id   serial PRIMARY KEY,
    name text UNIQUE NOT NULL
);
CREATE TABLE report_commodities (
    anumber      integer NOT NULL REFERENCES reports(anumber) ON DELETE CASCADE,
    commodity_id integer NOT NULL REFERENCES commodities(id),
    PRIMARY KEY (anumber, commodity_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- drillholes: the spine. Collars only -- no assays. See docs.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE drillholes (
    objectid     bigint PRIMARY KEY,
    holeid       text,
    collarid     text,
    anumber      integer,          -- soft join, NOT an FK: reports may be
                                   -- confidential/withdrawn. Track orphans instead.
    holetype     text,             -- raw
    holetype_std text,             -- normalised: RAB/AC/RC/DD/RCD/OTHER
    maxdepth     numeric,
    operator     text,
    project      text,
    period_from  date,
    period_to    date,
    extract_date date,
    geom         geometry(Point, 4326) NOT NULL
);
CREATE INDEX drillholes_geom_idx ON drillholes USING GIST (geom);
CREATE INDEX drillholes_anumber_idx ON drillholes (anumber);
CREATE INDEX drillholes_holetype_std_idx ON drillholes (holetype_std);

CREATE TABLE drillhole_commodities (
    objectid     bigint NOT NULL REFERENCES drillholes(objectid) ON DELETE CASCADE,
    commodity_id integer NOT NULL REFERENCES commodities(id),
    PRIMARY KEY (objectid, commodity_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Quality: never silently drop a row. A visible reject count is a trust signal.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE rejected_rows (
    id           bigserial PRIMARY KEY,
    source_layer text NOT NULL,
    source_id    text,
    reason       text NOT NULL,
    raw          jsonb NOT NULL,
    rejected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingest_runs (
    id               bigserial PRIMARY KEY,
    layer            text NOT NULL,
    bbox             text,
    started_at       timestamptz NOT NULL DEFAULT now(),
    finished_at      timestamptz,
    rows_in          integer,
    rows_loaded      integer,
    rows_rejected    integer,
    max_extract_date date
);

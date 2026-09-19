# Data model

The schema deliberately does **not** mirror the API's flat shape. Three findings force
that: 5.3× polygon duplication, semicolon-delimited multi-values, and real bad data.

---

## Core principle

> **One row per real-world thing.** A report is one thing even when it has 40 polygons.
> A commodity is one thing even when it arrives as `"COPPER; NICKEL"`.

Every user-facing count is then a plain `COUNT(*)` over the right table, instead of a
`COUNT(DISTINCT ...)` you have to remember. Correctness by construction beats
correctness by discipline.

---

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── reports: ONE row per A-number ────────────────────────────────────────
CREATE TABLE reports (
    anumber          integer PRIMARY KEY,
    title            text,
    report_year      smallint,          -- validated 1880..current, else NULL
    report_year_raw  integer,           -- keep the original. 1753 exists.
    author_name      text,
    author_company   text,
    operator         text,
    report_type      text,
    project          text,
    date_from        date,
    date_to          date,
    date_released    date,              -- when it went open file
    abstract_short   text,              -- the varchar(250) truncation
    abstract_full    text,              -- from dpxe_abs, NULL until fetched
    abstract_fetched_at timestamptz,
    url_abstract     text,
    url_report       text,
    has_digital_file boolean,
    extract_date     date,              -- source refresh tracking
    UNIQUE (anumber)
);

-- ── report geometries: MANY rows per A-number (5.3× on average) ──────────
CREATE TABLE report_geometries (
    id        bigserial PRIMARY KEY,
    anumber   integer NOT NULL REFERENCES reports(anumber) ON DELETE CASCADE,
    geom      geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX ON report_geometries USING GIST (geom);
CREATE INDEX ON report_geometries (anumber);

-- ── controlled vocabulary: the zero-hallucination backbone ──────────────
CREATE TABLE keywords (
    id    serial PRIMARY KEY,
    term  text UNIQUE NOT NULL          -- 'RC drilling', 'Soil sampling', ...
);
CREATE TABLE report_keywords (
    anumber     integer REFERENCES reports(anumber) ON DELETE CASCADE,
    keyword_id  integer REFERENCES keywords(id),
    PRIMARY KEY (anumber, keyword_id)
);

-- ── commodities: split from the ';'-delimited string ────────────────────
CREATE TABLE commodities (
    id          serial PRIMARY KEY,
    name        text UNIQUE NOT NULL,   -- normalised: 'GOLD'
    symbol      text                    -- 'Au'
);
CREATE TABLE report_commodities (
    anumber       integer REFERENCES reports(anumber) ON DELETE CASCADE,
    commodity_id  integer REFERENCES commodities(id),
    PRIMARY KEY (anumber, commodity_id)
);

-- ── drillholes: the 3.4M spine ──────────────────────────────────────────
CREATE TABLE drillholes (
    objectid     bigint PRIMARY KEY,
    holeid       text,
    collarid     text,
    anumber      integer,              -- the join to reports. NOT a hard FK: see below
    holetype     text,                 -- RAB / AC / RC / DD ...
    holetype_std text,                 -- normalised
    maxdepth     numeric,
    operator     text,
    project      text,
    period_from  date,
    period_to    date,
    extract_date date,
    geom         geometry(Point, 4326) NOT NULL
);
CREATE INDEX ON drillholes USING GIST (geom);
CREATE INDEX ON drillholes (anumber);
CREATE INDEX ON drillholes (holetype_std);

CREATE TABLE drillhole_commodities (
    objectid      bigint REFERENCES drillholes(objectid) ON DELETE CASCADE,
    commodity_id  integer REFERENCES commodities(id),
    PRIMARY KEY (objectid, commodity_id)
);

-- ── quality quarantine: never silently drop a row ───────────────────────
CREATE TABLE rejected_rows (
    id            bigserial PRIMARY KEY,
    source_layer  text NOT NULL,
    source_id     text,
    reason        text NOT NULL,        -- 'report_year_out_of_range'
    raw           jsonb NOT NULL,
    rejected_at   timestamptz DEFAULT now()
);

-- ── ingest audit ────────────────────────────────────────────────────────
CREATE TABLE ingest_runs (
    id              bigserial PRIMARY KEY,
    layer           text,
    started_at      timestamptz,
    finished_at     timestamptz,
    rows_in         integer,
    rows_loaded     integer,
    rows_rejected   integer,
    max_extract_date date
);
```

---

## Decisions worth explaining

### Why `drillholes.anumber` is not a hard foreign key

A hole may reference an A-number whose report is still confidential, or withdrawn, or bad
data. A hard FK would abort the ingest over a referential accident in a government feed.

**Soft-join instead, and count the orphans:**

```sql
SELECT count(*) FROM drillholes d
LEFT JOIN reports r USING (anumber)
WHERE r.anumber IS NULL;
```

That orphan count is a data-quality metric worth tracking over time. Hiding it behind a
constraint failure teaches you nothing.

### Why `report_year_raw` is kept alongside `report_year`

Because **1753 is in the live data**. The validated column is what you chart; the raw
column is what proves you didn't invent the correction. Being able to say "we rejected
N rows for out-of-range dates" is a trust signal, and trust is the entire product.

### Why keywords get their own tables

They are the zero-hallucination backbone. Normalised, they answer the core product
question with a `GROUP BY`:

```sql
-- "What activity happened on this ground?" — no LLM, no hallucination
SELECT k.term, count(DISTINCT rk.anumber) AS reports
FROM report_geometries g
JOIN report_keywords rk USING (anumber)
JOIN keywords k ON k.id = rk.keyword_id
WHERE ST_Intersects(g.geom, ST_GeomFromGeoJSON($1))
GROUP BY k.term
ORDER BY reports DESC;
```

### Why `abstract_full` is nullable and timestamped

We fetch it lazily, per A-number, only for reports inside a user's polygon — then cache
forever. `abstract_fetched_at` drives that cache. **Do not bulk-scrape 119k URLs** against
a free government service.

---

## The query that is the whole product

```sql
WITH poly AS (SELECT ST_GeomFromGeoJSON($1) AS g)
SELECT
    count(DISTINCT r.anumber)                         AS report_count,
    min(r.report_year)                                AS first_year,
    max(r.report_year)                                AS last_year,
    count(DISTINCT r.operator)                        AS operator_count
FROM reports r
JOIN report_geometries rg USING (anumber), poly
WHERE ST_Intersects(rg.geom, poly.g);
```

Note `COUNT(DISTINCT r.anumber)`. Without `DISTINCT` this over-reports by ~5×. That single
keyword is the difference between a credible tool and an embarrassing one.

---

## Sizing

| Table | Rows | Est. size |
|---|---|---|
| `drillholes` | 3.47M | ~600 MB + ~250 MB GIST index |
| `report_geometries` | ~109k | ~400 MB (multipolygons, one per report) |
| `reports` | 119k | ~100 MB with full abstracts |
| `report_keywords` | ~560k | ~30 MB |
| **Total** | | **~1.5 GB** |

This is why the 0.5 GB free tiers don't work. See [cost model](03-cost-model.md).

---

**Next:** [03-cost-model.md](03-cost-model.md)

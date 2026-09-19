"""Load SLIP layers into PostGIS.

Strategy: COPY raw into a staging table, then transform in SQL.
Load raw first, transform second -- it means a parsing failure and a
business-logic failure are different problems on different days.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Iterable

import psycopg

from .config import LAYER_DRILLHOLES, LAYER_REPORTS
from .slip import BBox, SlipClient
from .transform import (
    YEAR_MAX,
    YEAR_MIN,
    clean_text,
    clean_year,
    epoch_ms_to_date,
    norm_commodity,
    norm_holetype,
    split_multi,
)

log = logging.getLogger(__name__)

DRILLHOLE_FIELDS = (
    "objectid,holeid,collarid,anumber,holetype,maxdepth,operator,project,"
    "target_commodity,period_from,period_to,extract_date"
)
REPORT_FIELDS = (
    "objectid,anumber,title,report_year,author_name,author_company,operator,"
    "report_type,project,date_from,date_to,date_released,abstract,keywords,"
    "target_commodity,dpxe_abs,dpxe_rep,digital_file,extract_date"
)


def _start_run(cur: psycopg.Cursor, layer: str, bbox: BBox) -> int:
    cur.execute(
        "INSERT INTO ingest_runs (layer, bbox) VALUES (%s, %s) RETURNING id",
        (layer, json.dumps(bbox)),
    )
    return cur.fetchone()[0]


def _finish_run(
    cur: psycopg.Cursor, run_id: int, rows_in: int, loaded: int, rejected: int
) -> None:
    cur.execute(
        """UPDATE ingest_runs
              SET finished_at = now(), rows_in = %s,
                  rows_loaded = %s, rows_rejected = %s
            WHERE id = %s""",
        (rows_in, loaded, rejected, run_id),
    )


def _reject(
    cur: psycopg.Cursor, layer: str, source_id: Any, reason: str, raw: dict
) -> None:
    cur.execute(
        """INSERT INTO rejected_rows (source_layer, source_id, reason, raw)
           VALUES (%s, %s, %s, %s)""",
        (layer, str(source_id), reason, json.dumps(raw)),
    )


# ─────────────────────────────────────────────────────────────────────────
# Lookup tables
# ─────────────────────────────────────────────────────────────────────────
def _upsert_lookup(cur: psycopg.Cursor, table: str, col: str, values: Iterable[str]) -> dict[str, int]:
    vals = sorted({v for v in values if v})
    if not vals:
        return {}
    cur.executemany(
        f"INSERT INTO {table} ({col}) VALUES (%s) ON CONFLICT ({col}) DO NOTHING",
        [(v,) for v in vals],
    )
    cur.execute(f"SELECT {col}, id FROM {table}")
    return {r[0]: r[1] for r in cur.fetchall()}


# ─────────────────────────────────────────────────────────────────────────
# Layer 28 -- drillholes
# ─────────────────────────────────────────────────────────────────────────
def load_drillholes(conn: psycopg.Connection, client: SlipClient, bbox: BBox) -> dict[str, int]:
    cur = conn.cursor()
    run_id = _start_run(cur, "28_drillholes", bbox)

    cur.execute("""
        CREATE TEMP TABLE stg_holes (
            objectid bigint, holeid text, collarid text, anumber integer,
            holetype text, holetype_std text, maxdepth numeric,
            operator text, project text, commodities text[],
            period_from date, period_to date, extract_date date,
            lon double precision, lat double precision
        ) ON COMMIT DROP
    """)

    rows_in = loaded = rejected = 0
    all_commodities: set[str] = set()
    batch: list[tuple] = []

    def flush() -> None:
        nonlocal batch
        if not batch:
            return
        cur.executemany(
            """INSERT INTO stg_holes VALUES
               (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            batch,
        )
        batch = []

    for feat in client.iter_features(LAYER_DRILLHOLES, DRILLHOLE_FIELDS, bbox):
        rows_in += 1
        p = feat.get("properties") or {}
        g = feat.get("geometry") or {}

        if g.get("type") != "Point" or not g.get("coordinates"):
            _reject(cur, "28", p.get("objectid"), "missing_or_non_point_geometry", p)
            rejected += 1
            continue
        lon, lat = g["coordinates"][0], g["coordinates"][1]
        # WA spans roughly 112..129E, -35..-13S. Anything outside is bad data.
        if not (112 <= lon <= 130 and -36 <= lat <= -12):
            _reject(cur, "28", p.get("objectid"), "coordinates_outside_wa", p)
            rejected += 1
            continue

        commodities = [norm_commodity(c) for c in split_multi(p.get("target_commodity"))]
        all_commodities.update(commodities)

        batch.append((
            p.get("objectid"),
            clean_text(p.get("holeid")),
            clean_text(p.get("collarid")),
            p.get("anumber"),
            clean_text(p.get("holetype")),
            norm_holetype(p.get("holetype")),
            p.get("maxdepth"),
            clean_text(p.get("operator")),
            clean_text(p.get("project")),
            commodities,
            epoch_ms_to_date(p.get("period_from")),
            epoch_ms_to_date(p.get("period_to")),
            epoch_ms_to_date(p.get("extract_date")),
            lon, lat,
        ))
        if len(batch) >= 5000:
            flush()
    flush()

    # staging -> real table
    cur.execute("""
        INSERT INTO drillholes (objectid, holeid, collarid, anumber, holetype,
            holetype_std, maxdepth, operator, project, period_from, period_to,
            extract_date, geom)
        SELECT DISTINCT ON (objectid)
               objectid, holeid, collarid, anumber, holetype, holetype_std,
               maxdepth, operator, project, period_from, period_to, extract_date,
               ST_SetSRID(ST_MakePoint(lon, lat), 4326)
          FROM stg_holes
         ORDER BY objectid
        ON CONFLICT (objectid) DO NOTHING
    """)
    loaded = cur.rowcount

    cmap = _upsert_lookup(cur, "commodities", "name", all_commodities)
    if cmap:
        cur.execute("""
            INSERT INTO drillhole_commodities (objectid, commodity_id)
            SELECT DISTINCT s.objectid, c.id
              FROM stg_holes s
              CROSS JOIN LATERAL unnest(s.commodities) AS t(name)
              JOIN commodities c ON c.name = t.name
              JOIN drillholes d ON d.objectid = s.objectid
            ON CONFLICT DO NOTHING
        """)

    cur.execute(
        "UPDATE ingest_runs SET max_extract_date = (SELECT max(extract_date) FROM drillholes) WHERE id = %s",
        (run_id,),
    )
    _finish_run(cur, run_id, rows_in, loaded, rejected)
    conn.commit()
    return {"rows_in": rows_in, "loaded": loaded, "rejected": rejected}


# ─────────────────────────────────────────────────────────────────────────
# Layer 22 -- WAMEX reports
# ─────────────────────────────────────────────────────────────────────────
def load_reports(conn: psycopg.Connection, client: SlipClient, bbox: BBox) -> dict[str, int]:
    cur = conn.cursor()
    run_id = _start_run(cur, "22_reports", bbox)

    cur.execute("""
        CREATE TEMP TABLE stg_reports (
            anumber integer, title text, report_year smallint, report_year_raw integer,
            author_name text, author_company text, operator text, report_type text,
            project text, date_from date, date_to date, date_released date,
            abstract_short text, url_abstract text, url_report text,
            has_digital_file boolean, extract_date date,
            keywords text[], commodities text[], geom_json text
        ) ON COMMIT DROP
    """)

    rows_in = rejected = 0
    all_keywords: set[str] = set()
    all_commodities: set[str] = set()
    batch: list[tuple] = []

    def flush() -> None:
        nonlocal batch
        if not batch:
            return
        cur.executemany(
            """INSERT INTO stg_reports VALUES
               (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            batch,
        )
        batch = []

    for feat in client.iter_features(LAYER_REPORTS, REPORT_FIELDS, bbox):
        rows_in += 1
        p = feat.get("properties") or {}
        g = feat.get("geometry")
        anumber = p.get("anumber")

        if anumber is None:
            _reject(cur, "22", p.get("objectid"), "missing_anumber", p)
            rejected += 1
            continue
        if not g or g.get("type") not in ("Polygon", "MultiPolygon"):
            _reject(cur, "22", anumber, "missing_or_non_polygon_geometry", p)
            rejected += 1
            continue

        # report_year uses 1753 as a sentinel -- that is SQL Server's datetime
        # floor, i.e. how NULLs were stored upstream. It is not corruption, and
        # date_from recovers the true year (verified: 27/27 recoverable).
        raw_year = p.get("report_year")
        year = clean_year(raw_year)
        date_from = epoch_ms_to_date(p.get("date_from"))
        if year is None and raw_year is not None:
            if date_from and YEAR_MIN <= date_from.year <= YEAR_MAX:
                year = date_from.year
                _reject(cur, "22", anumber, "report_year_recovered_from_date_from", p)
            else:
                _reject(cur, "22", anumber, "report_year_unrecoverable", p)
            rejected += 1
            # NOT skipped -- the report is real, only the year field was bad.

        kws = split_multi(p.get("keywords"))
        cms = [norm_commodity(c) for c in split_multi(p.get("target_commodity"))]
        all_keywords.update(kws)
        all_commodities.update(cms)

        batch.append((
            anumber,
            clean_text(p.get("title")),
            year,
            raw_year,
            clean_text(p.get("author_name")),
            clean_text(p.get("author_company")),
            clean_text(p.get("operator")),
            clean_text(p.get("report_type")),
            clean_text(p.get("project")),
            date_from,
            epoch_ms_to_date(p.get("date_to")),
            epoch_ms_to_date(p.get("date_released")),
            clean_text(p.get("abstract")),
            clean_text(p.get("dpxe_abs")),
            clean_text(p.get("dpxe_rep")),
            bool(p.get("digital_file")),
            epoch_ms_to_date(p.get("extract_date")),
            kws,
            cms,
            json.dumps(g),
        ))
        if len(batch) >= 2000:
            flush()
    flush()

    # ONE row per A-number. Measured 5.3x polygon duplication -- collapsing here
    # is what makes every downstream COUNT(*) correct by construction.
    cur.execute("""
        INSERT INTO reports (anumber, title, report_year, report_year_raw,
            author_name, author_company, operator, report_type, project,
            date_from, date_to, date_released, abstract_short, url_abstract,
            url_report, has_digital_file, extract_date)
        SELECT DISTINCT ON (anumber)
               anumber, title, report_year, report_year_raw, author_name,
               author_company, operator, report_type, project, date_from,
               date_to, date_released, abstract_short, url_abstract, url_report,
               has_digital_file, extract_date
          FROM stg_reports
         ORDER BY anumber, title NULLS LAST
        ON CONFLICT (anumber) DO NOTHING
    """)
    loaded = cur.rowcount

    # MANY geometries per A-number.
    cur.execute("""
        INSERT INTO report_geometries (anumber, geom)
        SELECT s.anumber,
               ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(s.geom_json), 4326)))
          FROM stg_reports s
          JOIN reports r ON r.anumber = s.anumber
    """)
    geoms = cur.rowcount

    kmap = _upsert_lookup(cur, "keywords", "term", all_keywords)
    if kmap:
        cur.execute("""
            INSERT INTO report_keywords (anumber, keyword_id)
            SELECT DISTINCT s.anumber, k.id
              FROM stg_reports s
              CROSS JOIN LATERAL unnest(s.keywords) AS t(term)
              JOIN keywords k ON k.term = t.term
              JOIN reports r ON r.anumber = s.anumber
            ON CONFLICT DO NOTHING
        """)

    cmap = _upsert_lookup(cur, "commodities", "name", all_commodities)
    if cmap:
        cur.execute("""
            INSERT INTO report_commodities (anumber, commodity_id)
            SELECT DISTINCT s.anumber, c.id
              FROM stg_reports s
              CROSS JOIN LATERAL unnest(s.commodities) AS t(name)
              JOIN commodities c ON c.name = t.name
              JOIN reports r ON r.anumber = s.anumber
            ON CONFLICT DO NOTHING
        """)

    cur.execute(
        "UPDATE ingest_runs SET max_extract_date = (SELECT max(extract_date) FROM reports) WHERE id = %s",
        (run_id,),
    )
    _finish_run(cur, run_id, rows_in, loaded, rejected)
    conn.commit()
    return {"rows_in": rows_in, "loaded": loaded, "geometries": geoms, "rejected": rejected}

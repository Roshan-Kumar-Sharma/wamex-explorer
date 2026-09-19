#!/usr/bin/env python
"""Phase 1: all of WA, from the DASC bulk files.

    python run_phase1.py                 # everything: download, load, transform, tiles
    python run_phase1.py --step download
    python run_phase1.py --step load     # ogr2ogr GDB -> raw_* staging tables
    python run_phase1.py --step transform
    python run_phase1.py --step tiles    # PostGIS -> GeoJSONSeq -> tippecanoe -> .pmtiles

Data flow (docs/02-architecture/01-tech-stack.md):
    DASC GDB zip --> raw_wamex / raw_drillholes --> sql/01x_transform_*.sql --> real schema
                                                                             --> PMTiles
"""
from __future__ import annotations

import argparse
import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path

from wamex.dasc import download, extract_gdb
from wamex.db import connect
from wamex.gdal import gdb_to_postgis, postgis_to_geojsonseq
from wamex.transform import EXPLORATION_HOLETYPES, HOLETYPE_MAP

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("phase1")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "dasc"
SQL = ROOT / "sql"
TILES = ROOT / "data" / "tiles"
PUBLIC_TILES = ROOT / "web" / "public" / "tiles"

GDB_LAYERS = {
    # dataset -> (layer name inside the GDB, staging table, fid column name)
    "wamex": ("Exploration_Reports", "raw_wamex", "ogc_fid"),
    "drillholes": ("MINERAL_Expl_Drillholes_Openfile", "raw_drillholes", "objectid"),
}


def step_download() -> None:
    for name in ("wamex", "drillholes"):
        download(name, DATA)


def step_load() -> None:
    from wamex.gdal import layers as gdb_layers
    for name, (layer, table, fid) in GDB_LAYERS.items():
        gdb = extract_gdb(DATA / f"{name}.zip")
        layer = layer or gdb_layers(gdb)[0]
        t0 = time.time()
        gdb_to_postgis(gdb, layer, table, fid_name=fid)
        log.info("%s -> %s in %.0fs", name, table, time.time() - t0)


def _seed_holetype_map(conn) -> None:
    """Python is the single source of truth for the map; SQL joins the table."""
    with conn.cursor() as cur:
        cur.execute("TRUNCATE holetype_map")
        cur.executemany(
            "INSERT INTO holetype_map (raw, std, is_exploration) VALUES (%s, %s, %s)",
            [(raw, std, std in EXPLORATION_HOLETYPES) for raw, std in HOLETYPE_MAP.items()],
        )
    conn.commit()
    log.info("holetype_map seeded with %d entries", len(HOLETYPE_MAP))


def _psql(sql_file: Path) -> None:
    t0 = time.time()
    r = subprocess.run(
        ["docker", "exec", "-i", "wamex-db", "psql", "-U", "wamex", "-d", "wamex",
         "-v", "ON_ERROR_STOP=1", "-q"],
        stdin=open(sql_file), capture_output=True, text=True, check=True,
    )
    for ln in r.stdout.strip().splitlines():
        log.info("  %s", ln)
    log.info("%s in %.0fs", sql_file.name, time.time() - t0)


def step_transform() -> None:
    with connect() as conn:
        _seed_holetype_map(conn)
    _psql(SQL / "010_transform_wamex.sql")
    _psql(SQL / "011_transform_drillholes.sql")


def step_tiles() -> None:
    """3.47M points -> one static file. See docs/03-concepts/03-vector-tiles-and-pmtiles.md."""
    if not shutil.which("tippecanoe"):
        sys.exit("tippecanoe not found: brew install tippecanoe")
    TILES.mkdir(parents=True, exist_ok=True)
    geojsonl = TILES / "drillholes.geojsonl"
    pmtiles = TILES / "drillholes.pmtiles"

    t0 = time.time()
    postgis_to_geojsonseq(
        "SELECT objectid, holeid, anumber, holetype_std AS holetype, "
        "       round(maxdepth)::int AS maxdepth, operator, geom "
        "FROM drillholes",
        geojsonl,
    )
    log.info("export in %.0fs (%.0f MB)", time.time() - t0, geojsonl.stat().st_size / 1e6)

    t0 = time.time()
    subprocess.run([
        "tippecanoe", "-o", str(pmtiles), "--force",
        "--layer=drillholes",
        "--minimum-zoom=3", "--maximum-zoom=14",
        # -r1: do NOT thin points by a fixed ratio at every zoom level (the
        # default drops to 1/2.5 per level, which left 876 of ~84k Kalgoorlie
        # holes visible at z10 and hid the drill patterns). Instead, drop only
        # where a tile actually exceeds the size limit, which is only at the
        # low zooms where the whole state is in a handful of tiles.
        "--drop-rate=1",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "--quiet",
        str(geojsonl),
    ], check=True)
    log.info("tippecanoe in %.0fs (%.0f MB)", time.time() - t0, pmtiles.stat().st_size / 1e6)

    # Serve from Next's public/ for local dev. Prod: Cloudflare R2 (ADR-004).
    PUBLIC_TILES.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pmtiles, PUBLIC_TILES / "drillholes.pmtiles")
    geojsonl.unlink()   # 1+ GB intermediate; the pmtiles is the artefact
    log.info("copied to web/public/tiles/  ->  NEXT_PUBLIC_PMTILES_URL=/tiles/drillholes.pmtiles")


STEPS = {"download": step_download, "load": step_load, "transform": step_transform, "tiles": step_tiles}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", choices=STEPS, help="run one step only")
    args = ap.parse_args()
    t0 = time.time()
    for name, fn in STEPS.items():
        if args.step and args.step != name:
            continue
        log.info("══ %s ══", name)
        fn()
    log.info("done in %.0fs", time.time() - t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())

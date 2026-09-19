"""GDAL via Docker.

Homebrew's gdal formula pulls 130 dependencies (~8 GB, including gcc and the
entire AWS C++ SDK) to give us one binary that reads a GDB. The official OSGeo
image is ~150 MB and has every driver we need: OpenFileGDB, PostgreSQL,
GeoJSONSeq. Anyone cloning the repo gets an identical GDAL without touching
their system.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)

IMAGE = "ghcr.io/osgeo/gdal:alpine-small-latest"
NETWORK = "wamex-explorer_default"       # the docker-compose network
PG_IN_DOCKER = "host=db port=5432 dbname=wamex user=wamex password=wamex"


def _run(args: list[str], mounts: dict[Path, str], **kw) -> subprocess.CompletedProcess:
    cmd = ["docker", "run", "--rm", "--network", NETWORK]
    for host, cont in mounts.items():
        cmd += ["-v", f"{host.resolve()}:{cont}"]
    cmd += [IMAGE, *args]
    log.debug("$ %s", " ".join(cmd))
    return subprocess.run(cmd, check=True, text=True, capture_output=True, **kw)


def ogrinfo(gdb: Path, layer: str | None = None, summary: bool = True) -> str:
    args = ["ogrinfo", "-ro"]
    if summary:
        args.append("-so")
    args.append("/data/" + gdb.name)
    if layer:
        args.append(layer)
    return _run(args, {gdb.parent: "/data"}).stdout


def layers(gdb: Path) -> list[str]:
    out = ogrinfo(gdb)
    return [ln.split(":", 1)[1].split("(")[0].strip()
            for ln in out.splitlines() if ln.strip() and ln.strip()[0].isdigit() and ":" in ln]


def gdb_to_postgis(gdb: Path, layer: str, table: str, *, srs: str = "EPSG:4326",
                   geom_name: str = "geom", extra: list[str] | None = None) -> None:
    """Load one GDB layer into a PostGIS table, replacing it if present."""
    args = [
        "ogr2ogr", "-f", "PostgreSQL", f"PG:{PG_IN_DOCKER}",
        "/data/" + gdb.name, layer,
        "-nln", table, "-overwrite",
        "-t_srs", srs,
        "-lco", f"GEOMETRY_NAME={geom_name}",
        "-lco", "FID=ogc_fid",
        "-lco", "SPATIAL_INDEX=NONE",     # we index after the transform, not the staging table
        "--config", "PG_USE_COPY", "YES",  # COPY is ~10x faster than INSERT
        "-progress",
        *(extra or []),
    ]
    log.info("ogr2ogr %s:%s -> %s", gdb.name, layer, table)
    r = _run(args, {gdb.parent: "/data"})
    if r.stderr.strip():
        for ln in r.stderr.strip().splitlines()[-5:]:
            log.info("  %s", ln)


def postgis_to_geojsonseq(sql: str, out: Path) -> None:
    """Stream a query to GeoJSON Lines for tippecanoe."""
    out.parent.mkdir(parents=True, exist_ok=True)
    args = [
        "ogr2ogr", "-f", "GeoJSONSeq", "/out/" + out.name,
        f"PG:{PG_IN_DOCKER}", "-sql", sql,
        "-lco", "RS=NO",       # newline-delimited, no record separator byte
        "-progress",
    ]
    log.info("export -> %s", out.name)
    _run(args, {out.parent: "/out"})

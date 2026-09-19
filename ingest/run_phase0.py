#!/usr/bin/env python
"""Phase 0: pull one 1x1 degree box around Kalgoorlie into local PostGIS.

    python run_phase0.py                # Kalgoorlie box
    python run_phase0.py --bbox 121.4,-30.8,121.55,-30.7
    python run_phase0.py --reset        # truncate first

Success criterion (BUILD.md Phase 0): you can draw a box and count holes inside it.
"""
from __future__ import annotations

import argparse
import logging
import sys
import time

from wamex.config import KALGOORLIE_BBOX
from wamex.db import connect
from wamex.load import load_drillholes, load_reports
from wamex.slip import SlipClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("phase0")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="xmin,ymin,xmax,ymax in WGS84")
    ap.add_argument("--reset", action="store_true", help="truncate tables first")
    ap.add_argument("--skip-holes", action="store_true")
    ap.add_argument("--skip-reports", action="store_true")
    args = ap.parse_args()

    bbox = tuple(float(x) for x in args.bbox.split(",")) if args.bbox else KALGOORLIE_BBOX
    log.info("bbox: %s", bbox)

    t0 = time.time()
    with connect() as conn, SlipClient() as client:
        if args.reset:
            log.info("truncating")
            with conn.cursor() as cur:
                cur.execute("""
                    TRUNCATE drillhole_commodities, report_commodities,
                             report_keywords, report_geometries, drillholes,
                             reports, keywords, commodities, rejected_rows,
                             ingest_runs RESTART IDENTITY CASCADE
                """)
            conn.commit()

        if not args.skip_reports:
            log.info("── layer 22: WAMEX reports ──")
            n = client.count(22, bbox)
            log.info("server reports %s polygons in bbox", f"{n:,}")
            r = load_reports(conn, client, bbox)
            log.info("reports: %s", r)

        if not args.skip_holes:
            log.info("── layer 28: drillholes ──")
            n = client.count(28, bbox)
            log.info("server reports %s holes in bbox", f"{n:,}")
            r = load_drillholes(conn, client, bbox)
            log.info("drillholes: %s", r)

        log.info("ANALYZE")
        with conn.cursor() as cur:
            cur.execute("ANALYZE drillholes; ANALYZE report_geometries; ANALYZE reports;")
        conn.commit()

    log.info("done in %.1fs", time.time() - t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())

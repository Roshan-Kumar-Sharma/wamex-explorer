"""Bulk download from the DASC (Data and Software Centre).

DASC publishes an official "URL document" for automated downloading
(https://dasc.dmirs.wa.gov.au/Download/File/3599). The IDs below come from it.
Files are regenerated nightly (~3am AWST) and served from Azure Blob Storage in
Sydney, which honours HTTP Range -- so downloads are resumable.

Observed transfer rate: ~20-30 KB/s from this network. A 120 MB file is ~1.5 h.
Resume support is not optional.
"""
from __future__ import annotations

import logging
import time
import zipfile
from pathlib import Path

import httpx

from .config import USER_AGENT

log = logging.getLogger(__name__)

DASC_DOWNLOAD = "https://dasc.dmirs.wa.gov.au/download/file/{id}"

# From the DASC URL document (GDA2020, ESRI File Geodatabase).
DATASETS = {
    "drillholes": {
        "id": 1969,
        "title": "Mineral exploration drillholes (open file) - [GDA2020]",
        "slip_layer": 28,
    },
    "wamex": {
        "id": 4847,
        "title": "Mineral exploration reports (WAMEX) - [GDA2020]",
        "slip_layer": 22,
    },
    "tenements_current": {
        "id": 2054,
        "title": "Tenements - Current (live and pending) - [GDA2020]",
        "slip_layer": 3,
    },
    "minedex": {
        "id": 398,
        "title": "Mines and mineral deposits (MINEDEX) - [GDA2020]",
        "slip_layer": 0,
    },
}


def _resolve(client: httpx.Client, dataset_id: int) -> tuple[str, int]:
    """Follow the 302 to the blob URL and return (url, content_length)."""
    r = client.head(DASC_DOWNLOAD.format(id=dataset_id), follow_redirects=True)
    r.raise_for_status()
    return str(r.url), int(r.headers.get("content-length", 0))


def download(name: str, dest_dir: Path, max_retries: int = 50) -> Path:
    """Download a dataset zip with resume. Returns the zip path."""
    ds = DATASETS[name]
    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / f"{name}.zip"

    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=httpx.Timeout(60, read=300)) as c:
        url, total = _resolve(c, ds["id"])
        log.info("%s: %s (%.1f MB)", name, ds["title"], total / 1e6)

        if zip_path.exists() and zip_path.stat().st_size == total:
            log.info("%s: already complete", name)
            return zip_path

        attempt = 0
        while attempt < max_retries:
            have = zip_path.stat().st_size if zip_path.exists() else 0
            if have >= total:
                break
            headers = {"Range": f"bytes={have}-"} if have else {}
            t0 = time.time()
            got = 0
            try:
                with c.stream("GET", url, headers=headers) as r:
                    if have and r.status_code != 206:
                        raise RuntimeError(f"server ignored Range (HTTP {r.status_code})")
                    r.raise_for_status()
                    with open(zip_path, "ab" if have else "wb") as f:
                        for chunk in r.iter_bytes(1 << 16):
                            f.write(chunk)
                            got += len(chunk)
                            if got % (8 << 20) < (1 << 16):  # every ~8 MB
                                pct = 100 * (have + got) / total
                                rate = got / max(time.time() - t0, 1e-6) / 1024
                                log.info("%s: %5.1f%%  %.0f KB/s", name, pct, rate)
                break
            except (httpx.HTTPError, RuntimeError, OSError) as e:
                attempt += 1
                wait = min(60, 2 ** min(attempt, 6))
                log.warning("%s: %s after %d bytes; retry %d in %ss", name, e, got, attempt, wait)
                time.sleep(wait)

    size = zip_path.stat().st_size
    if size != total:
        raise RuntimeError(f"{name}: incomplete ({size}/{total} bytes)")
    log.info("%s: done, %.1f MB", name, size / 1e6)
    return zip_path


def extract_gdb(zip_path: Path) -> Path:
    """Unzip and return the .gdb directory."""
    out = zip_path.with_suffix("")
    if not out.exists():
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(out)
    gdbs = list(out.rglob("*.gdb"))
    if not gdbs:
        raise FileNotFoundError(f"no .gdb inside {zip_path}")
    return gdbs[0]

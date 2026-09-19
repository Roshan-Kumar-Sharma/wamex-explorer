"""Paginated client for the SLIP ArcGIS REST API.

Two things this has to get right:
  1. maxRecordCount is 10000 on every layer -- large pulls need resultOffset
     pagination, and you must watch for exceededTransferLimit.
  2. f=geojson gives properly-structured geometry (including polygon holes),
     which saves hand-rolling Esri ring orientation rules.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Iterator

import httpx

from .config import (
    MAX_RECORD_COUNT,
    REQUEST_DELAY_S,
    SLIP_BASE,
    SLIP_MIRROR,
    USER_AGENT,
)

log = logging.getLogger(__name__)

BBox = tuple[float, float, float, float]


class SlipError(RuntimeError):
    pass


class SlipClient:
    def __init__(self, base: str = SLIP_BASE, timeout: float = 120.0) -> None:
        self.base = base
        self._client = httpx.Client(
            timeout=timeout,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SlipClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ── low level ────────────────────────────────────────────────────────
    def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        last: Exception | None = None
        for attempt in range(4):
            try:
                r = self._client.get(url, params=params)
                r.raise_for_status()
                data = r.json()
                # ArcGIS returns HTTP 200 with an error object in the body.
                if isinstance(data, dict) and "error" in data:
                    raise SlipError(f"ArcGIS error: {data['error']}")
                return data
            except (httpx.HTTPError, SlipError) as e:
                last = e
                wait = 2**attempt
                log.warning("request failed (%s), retry in %ss", e, wait)
                time.sleep(wait)
        raise SlipError(f"giving up after 4 attempts: {last}")

    def count(self, layer: int, bbox: BBox | None = None, where: str = "1=1") -> int:
        params: dict[str, Any] = {"where": where, "returnCountOnly": "true", "f": "json"}
        if bbox:
            params |= self._bbox_params(bbox)
        return int(self._get(f"{self.base}/{layer}/query", params)["count"])

    def fields(self, layer: int) -> list[dict[str, Any]]:
        return self._get(f"{self.base}/{layer}", {"f": "json"})["fields"]

    @staticmethod
    def _bbox_params(bbox: BBox) -> dict[str, Any]:
        xmin, ymin, xmax, ymax = bbox
        return {
            "geometry": f"{xmin},{ymin},{xmax},{ymax}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
        }

    # ── pagination ───────────────────────────────────────────────────────
    def iter_features(
        self,
        layer: int,
        out_fields: str = "*",
        bbox: BBox | None = None,
        where: str = "1=1",
        page_size: int = MAX_RECORD_COUNT,
        return_geometry: bool = True,
    ) -> Iterator[dict[str, Any]]:
        """Yield GeoJSON features, paginating past the 10k cap.

        Ordered by objectid so that resultOffset paging is stable -- without an
        explicit order the server makes no ordering guarantee and pages can
        overlap or skip.
        """
        url = f"{self.base}/{layer}/query"
        offset = 0
        seen = 0

        while True:
            params: dict[str, Any] = {
                "where": where,
                "outFields": out_fields,
                "outSR": 4326,
                "returnGeometry": str(return_geometry).lower(),
                "resultOffset": offset,
                "resultRecordCount": page_size,
                "orderByFields": "objectid ASC",
                "f": "geojson",
            }
            if bbox:
                params |= self._bbox_params(bbox)

            data = self._get(url, params)
            feats = data.get("features") or []
            log.info("layer %s: offset %s -> %s features", layer, offset, len(feats))

            for f in feats:
                yield f
            seen += len(feats)

            exceeded = data.get("exceededTransferLimit") or data.get(
                "properties", {}
            ).get("exceededTransferLimit")

            if not feats or not exceeded:
                break

            offset += len(feats)
            time.sleep(REQUEST_DELAY_S)

        log.info("layer %s: %s features total", layer, seen)

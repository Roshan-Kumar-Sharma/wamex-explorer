"""Value-level cleaning.

Everything here exists because of something measured in the live data --
see docs/01-research/02-data-findings.md.
"""
from __future__ import annotations

import datetime as dt
from typing import Any

# report_year 1753 is present in the live feed. WA's gold rush began in the
# 1890s and WAMEX starts in 1970, so anything before 1880 is a data entry error.
YEAR_MIN = 1880
YEAR_MAX = dt.date.today().year + 1

# Raw holetype values are inconsistent across 50+ years of submissions.
HOLETYPE_MAP = {
    # Verified against live data 19 Sep 2026: the source uses 4-char codes.
    "RAB": "RAB", "ROTARY AIR BLAST": "RAB",
    "AC": "AC", "AIRC": "AC", "AIRCORE": "AC", "AIR CORE": "AC",
    "RC": "RC", "REVERSE CIRCULATION": "RC",
    "DD": "DD", "DDH": "DD", "DIAM": "DD", "DIAMOND": "DD", "DIAMOND DRILLING": "DD",
    "RCD": "RCD", "RC/DD": "RCD",
    "AUG": "AUGER", "AUGER": "AUGER",
    "PERC": "PERCUSSION", "PERCUSSION": "PERCUSSION",
    "ROT": "ROTARY", "ROTARY": "ROTARY",
    "VAC": "VACUUM", "VACUUM": "VACUUM",
    "SON": "SONIC", "SONIC": "SONIC",
    # NOT exploration drillholes -- excluded from exploration-intensity counts.
    "WAT": "WATER_BORE",     # water bore
    "COST": "COSTEAN",       # a surface trench, not a hole at all
    "UNKN": "UNKNOWN",
}

# Methods that represent an attempt to test the subsurface for minerals.
# Water bores and costeans are drilled/dug for other reasons and would
# inflate any "how much exploration happened here" statistic.
EXPLORATION_HOLETYPES = {
    "RAB", "AC", "RC", "DD", "RCD", "AUGER",
    "PERCUSSION", "ROTARY", "VACUUM", "SONIC",
}


def epoch_ms_to_date(v: Any) -> dt.date | None:
    """ArcGIS returns dates as epoch milliseconds. Can be negative (pre-1970)."""
    if v is None or v == "":
        return None
    try:
        return dt.datetime.fromtimestamp(int(v) / 1000, tz=dt.timezone.utc).date()
    except (ValueError, OverflowError, OSError, TypeError):
        return None


def clean_year(v: Any) -> int | None:
    """Return the year only if plausible. Caller keeps the raw value regardless."""
    try:
        y = int(v)
    except (TypeError, ValueError):
        return None
    return y if YEAR_MIN <= y <= YEAR_MAX else None


def norm_holetype(v: Any) -> str:
    if not v:
        return "UNKNOWN"
    return HOLETYPE_MAP.get(str(v).strip().upper(), "OTHER")


def split_multi(v: Any) -> list[str]:
    """target_commodity and keywords are ';'-delimited multi-value strings."""
    if not v:
        return []
    return [p.strip() for p in str(v).split(";") if p.strip()]


def norm_commodity(v: str) -> str:
    return v.strip().upper()


def clean_text(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None

"""Postgres connection helper."""
from __future__ import annotations

import os

import psycopg

DSN = os.environ.get(
    "WAMEX_DSN",
    "postgresql://wamex:wamex@localhost:54329/wamex",
)


def connect() -> psycopg.Connection:
    return psycopg.connect(DSN, autocommit=False)

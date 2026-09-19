-- wamex-explorer schema, Phase 2: permalinked briefs + full-abstract cache.
-- Idempotent: safe to re-run against an existing Phase 1 database.

-- ─────────────────────────────────────────────────────────────────────────
-- briefs: ONE row per (polygon, filters). The id is a hash of both, so the
-- same ground drawn twice yields the same permalink (CLAUDE.md: "cached by
-- polygon hash"). The result is stored as generated, with the data version it
-- was generated against, so a shared link says exactly what it was built from.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS briefs (
    id              text PRIMARY KEY,                   -- 12-char base32 of sha256(canonical geometry + filters)
    geom            geometry(Polygon, 4326) NOT NULL,
    filters         jsonb NOT NULL DEFAULT '{}'::jsonb,
    result          jsonb NOT NULL,                     -- the brief exactly as served
    data_version    date,                               -- max(extract_date) at generation time
    title           text,                               -- optional, for seeded/famous ground
    slug            text UNIQUE,                        -- optional human alias, e.g. "super-pit"
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_viewed_at  timestamptz,
    views           integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS briefs_geom_idx ON briefs USING GIST (geom);

-- Full-abstract fetch bookkeeping (ADR-007). abstract_full / abstract_fetched_at
-- already exist from 001. A failed fetch records why, so we neither retry in a
-- loop nor pretend the text was empty.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS abstract_fetch_error text;

-- Lookup tables seeded by the ingest (from ingest/wamex/transform.py), so the
-- Python map and the SQL transform cannot drift apart.
CREATE TABLE IF NOT EXISTS holetype_map (
    raw            text PRIMARY KEY,   -- upper-cased source value, e.g. 'AUG'
    std            text NOT NULL,      -- normalised, e.g. 'AUGER'
    is_exploration boolean NOT NULL    -- false for WATER_BORE, COSTEAN, UNKNOWN, OTHER
);

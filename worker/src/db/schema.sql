-- Reference copy of the current D1 schema.
-- Not executed directly — see migrations/0001_initial.sql for the applied version.
--
-- D1 constraints:
--   - No DROP COLUMN or ALTER COLUMN (use table recreation for destructive changes)
--   - JSON stored as TEXT; use json_extract() for queries
--   - Foreign keys require PRAGMA foreign_keys = ON per-connection
--   - UNIQUE on partner_a/partner_b ensures each partner belongs to one couple only

-- ID columns use UUIDv4 format (36 chars, e.g. "550e8400-e29b-41d4-a716-446655440000")
-- generated client-side. No CHECK constraint enforced — validated in application layer.

CREATE TABLE IF NOT EXISTS partners (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    cuisines             TEXT NOT NULL DEFAULT '[]',
    movie_genres         TEXT NOT NULL DEFAULT '[]',
    activities           TEXT NOT NULL DEFAULT '[]',
    dietary_restrictions TEXT DEFAULT '[]',
    dislikes             TEXT DEFAULT '[]',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS couples (
    id          TEXT PRIMARY KEY,
    partner_a   TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT UNIQUE,
    partner_b   TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT UNIQUE,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS date_history (
    id                TEXT PRIMARY KEY,
    couple_id         TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    date_planned      TEXT NOT NULL,
    date_type         TEXT NOT NULL,
    venue_name        TEXT,
    venue_type        TEXT,
    restaurant_name   TEXT,
    movie_title       TEXT,
    activity_name     TEXT,
    full_plan         TEXT NOT NULL DEFAULT '{}',
    llm_quality_score REAL,
    rating            INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes             TEXT,
    created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_couple ON date_history(couple_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON date_history(date_planned);
CREATE INDEX IF NOT EXISTS idx_history_type ON date_history(date_type);

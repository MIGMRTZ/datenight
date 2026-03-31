-- 0001_initial.sql
-- Initial schema for Date Night Autopilot
-- Applied via: wrangler d1 migrations apply datenight

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

CREATE INDEX idx_history_couple ON date_history(couple_id);
CREATE INDEX idx_history_date ON date_history(date_planned);
CREATE INDEX idx_history_type ON date_history(date_type);

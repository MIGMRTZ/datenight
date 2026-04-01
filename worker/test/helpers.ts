import { SELF, env } from "cloudflare:test";

export async function applyMigrations(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      cuisines TEXT NOT NULL DEFAULT '[]', movie_genres TEXT NOT NULL DEFAULT '[]',
      activities TEXT NOT NULL DEFAULT '[]', dietary_restrictions TEXT DEFAULT '[]',
      dislikes TEXT DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS couples (
      id TEXT PRIMARY KEY,
      partner_a TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT UNIQUE,
      partner_b TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT UNIQUE,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS date_history (
      id TEXT PRIMARY KEY, couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
      date_planned TEXT NOT NULL, date_type TEXT NOT NULL, venue_name TEXT, venue_type TEXT,
      restaurant_name TEXT, movie_title TEXT, activity_name TEXT,
      full_plan TEXT NOT NULL DEFAULT '{}', llm_quality_score REAL,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5), notes TEXT, created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_history_couple ON date_history(couple_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_history_date ON date_history(date_planned)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_history_type ON date_history(date_type)`),
  ]);
}

export const AUTH_HEADER = { Authorization: "Bearer test-auth-token" };

export function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return SELF.fetch(`http://localhost${path}`, {
    ...options,
    headers: { ...AUTH_HEADER, ...((options.headers as Record<string, string>) || {}) },
  });
}

export function authPost(path: string, body: unknown): Promise<Response> {
  return authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function authPut(path: string, body: unknown): Promise<Response> {
  return authFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function authDelete(path: string): Promise<Response> {
  return authFetch(path, { method: "DELETE" });
}

import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";

beforeAll(async () => {
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
});

describe("D1 Migration", () => {
  it("creates all required tables", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();

    const tableNames = result.results.map((r) => r.name);
    expect(tableNames).toContain("partners");
    expect(tableNames).toContain("couples");
    expect(tableNames).toContain("date_history");
  });

  it("creates all required indexes", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    ).all<{ name: string }>();

    const indexNames = result.results.map((r) => r.name);
    expect(indexNames).toContain("idx_history_couple");
    expect(indexNames).toContain("idx_history_date");
    expect(indexNames).toContain("idx_history_type");
  });

  it("supports insert and read round-trip on partners", async () => {
    const id = "test-partner-001";
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, "Alex", '["Italian","Thai"]', '["Comedy"]', '["Bowling"]', now, now)
      .run();

    const row = await env.DB.prepare("SELECT * FROM partners WHERE id = ?")
      .bind(id)
      .first<{ id: string; name: string; cuisines: string }>();

    expect(row).not.toBeNull();
    expect(row!.name).toBe("Alex");
    expect(JSON.parse(row!.cuisines)).toEqual(["Italian", "Thai"]);
  });
});

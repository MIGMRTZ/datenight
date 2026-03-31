import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

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

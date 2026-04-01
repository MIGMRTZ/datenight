import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, authPost, authFetch, authDelete } from "./helpers";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  // Clean slate for each test
  await env.DB.exec("DELETE FROM couples");
  await env.DB.exec("DELETE FROM partners");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("partner-a", "Alex", '["Italian"]', '["Comedy"]', '["Bowling"]', now, now),
    env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("partner-b", "Jordan", '["Thai"]', '["Thriller"]', '["Hiking"]', now, now),
    env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("partner-c", "Riley", '["Mexican"]', '["Sci-Fi"]', '["Swimming"]', now, now),
  ]);
});

describe("POST /api/couples", () => {
  it("creates a couple and returns 201", async () => {
    const res = await authPost("/api/couples", {
      id: "couple-001",
      partner_a: "partner-a",
      partner_b: "partner-b",
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; partner_a: string; partner_b: string }>();
    expect(body.id).toBe("couple-001");
  });

  it("returns 404 for non-existent partner", async () => {
    const res = await authPost("/api/couples", {
      id: "couple-bad",
      partner_a: "nonexistent",
      partner_b: "partner-c",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for self-couple (partner_a === partner_b)", async () => {
    const res = await authPost("/api/couples", {
      id: "couple-self",
      partner_a: "partner-a",
      partner_b: "partner-a",
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("themselves");
  });

  it("returns 409 for already-linked partner", async () => {
    // First create a couple
    await authPost("/api/couples", {
      id: "couple-first",
      partner_a: "partner-a",
      partner_b: "partner-b",
    });
    // Now try to link partner-a again
    const res = await authPost("/api/couples", {
      id: "couple-dup",
      partner_a: "partner-a",
      partner_b: "partner-c",
    });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("already");
  });
});

describe("GET /api/couples", () => {
  it("returns all couples", async () => {
    await authPost("/api/couples", {
      id: "couple-list",
      partner_a: "partner-a",
      partner_b: "partner-b",
    });
    const res = await authFetch("/api/couples");
    expect(res.status).toBe(200);
    const body = await res.json<{ couples: Array<{ id: string }> }>();
    expect(body.couples.length).toBe(1);
  });
});

describe("GET /api/couples/:id", () => {
  it("returns couple with both partner profiles", async () => {
    await authPost("/api/couples", {
      id: "couple-detail",
      partner_a: "partner-a",
      partner_b: "partner-b",
    });
    const res = await authFetch("/api/couples/couple-detail");
    expect(res.status).toBe(200);
    const body = await res.json<{
      id: string;
      partner_a: { id: string; name: string };
      partner_b: { id: string; name: string };
    }>();
    expect(body.id).toBe("couple-detail");
    expect(body.partner_a.name).toBe("Alex");
    expect(body.partner_b.name).toBe("Jordan");
  });

  it("returns 404 for unknown id", async () => {
    const res = await authFetch("/api/couples/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/couples/:id", () => {
  it("removes couple and returns 204, preserves profiles", async () => {
    await authPost("/api/couples", {
      id: "couple-to-delete",
      partner_a: "partner-a",
      partner_b: "partner-b",
    });
    const res = await authDelete("/api/couples/couple-to-delete");
    expect(res.status).toBe(204);

    // Verify profiles still exist
    const profileRes = await authFetch("/api/profiles/partner-a");
    expect(profileRes.status).toBe(200);
  });

  it("returns 404 for unknown id", async () => {
    const res = await authDelete("/api/couples/nonexistent");
    expect(res.status).toBe(404);
  });
});

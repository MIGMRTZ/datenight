import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, authPost, authFetch, authDelete } from "./helpers";

beforeAll(async () => {
  await applyMigrations();
  // Create two partner profiles for couple tests
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("partner-a", "Alex", "[]", "[]", "[]", now, now),
    env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("partner-b", "Jordan", "[]", "[]", "[]", now, now),
    env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("partner-c", "Riley", "[]", "[]", "[]", now, now),
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
    expect(body.partner_a).toBe("partner-a");
    expect(body.partner_b).toBe("partner-b");
  });

  it("returns 404 for non-existent partner", async () => {
    const res = await authPost("/api/couples", {
      id: "couple-bad",
      partner_a: "nonexistent",
      partner_b: "partner-c",
    });
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBeDefined();
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
    const res = await authFetch("/api/couples");
    expect(res.status).toBe(200);
    const body = await res.json<{ couples: Array<{ id: string }> }>();
    expect(body.couples.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/couples/:id", () => {
  it("returns couple with both partner profiles", async () => {
    const res = await authFetch("/api/couples/couple-001");
    expect(res.status).toBe(200);
    const body = await res.json<{
      id: string;
      partner_a: { id: string; name: string };
      partner_b: { id: string; name: string };
    }>();
    expect(body.id).toBe("couple-001");
    expect(body.partner_a.name).toBe("Alex");
    expect(body.partner_b.name).toBe("Jordan");
  });

  it("returns 404 for unknown id", async () => {
    const res = await authFetch("/api/couples/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/couples/:id", () => {
  it("removes couple and returns 204", async () => {
    // Create a couple to delete
    await authPost("/api/couples", {
      id: "couple-del",
      partner_a: "partner-c",
      partner_b: "partner-b",
    });
    // First unlink partner-a and partner-b from couple-001 so partner-b is free
    // Actually partner-b is already in couple-001, so use partner-c
    // Wait — partner-b is in couple-001 already. Let me fix: delete couple-001 first
    await authDelete("/api/couples/couple-001");

    await authPost("/api/couples", {
      id: "couple-del-2",
      partner_a: "partner-a",
      partner_b: "partner-b",
    });
    const res = await authDelete("/api/couples/couple-del-2");
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

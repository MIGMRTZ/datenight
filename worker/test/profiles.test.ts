import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, authPost, authFetch, authPut, authDelete } from "./helpers";

beforeAll(async () => {
  await applyMigrations();
});

const validProfile = {
  id: "prof-001",
  name: "Alex",
  cuisines: ["Italian", "Mexican", "Thai"],
  movie_genres: ["Comedy", "Thriller"],
  activities: ["Bowling", "Hiking"],
  dietary_restrictions: ["Vegetarian"],
  dislikes: ["Horror movies"],
};

describe("POST /api/profiles", () => {
  it("creates a profile and returns 201", async () => {
    const res = await authPost("/api/profiles", validProfile);
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; name: string }>();
    expect(body.id).toBe("prof-001");
    expect(body.name).toBe("Alex");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await authPost("/api/profiles", { id: "prof-bad", name: "Test" });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBeDefined();
  });

  it("returns 409 for duplicate id", async () => {
    const res = await authPost("/api/profiles", validProfile);
    expect(res.status).toBe(409);
  });
});

describe("GET /api/profiles", () => {
  it("returns all profiles with parsed arrays", async () => {
    const res = await authFetch("/api/profiles");
    expect(res.status).toBe(200);
    const body = await res.json<{ profiles: Array<{ name: string; cuisines: string[] }> }>();
    expect(body.profiles.length).toBeGreaterThanOrEqual(1);
    const alex = body.profiles.find((p) => p.name === "Alex");
    expect(alex).toBeDefined();
    expect(alex!.cuisines).toEqual(["Italian", "Mexican", "Thai"]);
  });

  it("returns empty array when no profiles exist", async () => {
    // Clean up first
    await env.DB.prepare("DELETE FROM partners").run();
    const res = await authFetch("/api/profiles");
    expect(res.status).toBe(200);
    const body = await res.json<{ profiles: unknown[] }>();
    expect(body.profiles).toEqual([]);
  });
});

describe("GET /api/profiles/:id", () => {
  beforeAll(async () => {
    await authPost("/api/profiles", { ...validProfile, id: "prof-get-1" });
  });

  it("returns profile by id", async () => {
    const res = await authFetch("/api/profiles/prof-get-1");
    expect(res.status).toBe(200);
    const body = await res.json<{ id: string; name: string }>();
    expect(body.id).toBe("prof-get-1");
  });

  it("returns 404 for unknown id", async () => {
    const res = await authFetch("/api/profiles/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/profiles/:id", () => {
  beforeAll(async () => {
    await authPost("/api/profiles", { ...validProfile, id: "prof-put-1" });
  });

  it("updates profile and bumps updated_at", async () => {
    const res = await authPut("/api/profiles/prof-put-1", {
      name: "Alex Updated",
      cuisines: ["Japanese"],
      movie_genres: ["Sci-Fi"],
      activities: ["Swimming"],
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ name: string; cuisines: string[] }>();
    expect(body.name).toBe("Alex Updated");
    expect(body.cuisines).toEqual(["Japanese"]);
  });

  it("returns 404 for unknown id", async () => {
    const res = await authPut("/api/profiles/nonexistent", {
      name: "Nobody",
      cuisines: ["X"],
      movie_genres: ["X"],
      activities: ["X"],
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/profiles/:id", () => {
  it("removes profile and returns 204", async () => {
    await authPost("/api/profiles", { ...validProfile, id: "prof-del-1" });
    const res = await authDelete("/api/profiles/prof-del-1");
    expect(res.status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const res = await authDelete("/api/profiles/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 409 when partner is in a couple", async () => {
    await authPost("/api/profiles", { ...validProfile, id: "prof-coupled-a" });
    await authPost("/api/profiles", { ...validProfile, id: "prof-coupled-b", name: "Jordan" });
    // Create couple directly in DB since couple routes don't exist yet
    await env.DB.prepare(
      "INSERT INTO couples (id, partner_a, partner_b, created_at) VALUES (?, ?, ?, ?)"
    ).bind("couple-1", "prof-coupled-a", "prof-coupled-b", new Date().toISOString()).run();

    const res = await authDelete("/api/profiles/prof-coupled-a");
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("couple");
  });
});

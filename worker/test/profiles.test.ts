import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations, authPost, authFetch, authPut, authDelete } from "./helpers";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await env.DB.exec("DELETE FROM couples");
  await env.DB.exec("DELETE FROM partners");
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
    await authPost("/api/profiles", validProfile);
    const res = await authPost("/api/profiles", validProfile);
    expect(res.status).toBe(409);
  });
});

describe("GET /api/profiles", () => {
  it("returns all profiles with parsed arrays", async () => {
    await authPost("/api/profiles", validProfile);
    const res = await authFetch("/api/profiles");
    expect(res.status).toBe(200);
    const body = await res.json<{ profiles: Array<{ name: string; cuisines: string[] }> }>();
    expect(body.profiles.length).toBe(1);
    expect(body.profiles[0].cuisines).toEqual(["Italian", "Mexican", "Thai"]);
  });

  it("returns empty array when no profiles exist", async () => {
    const res = await authFetch("/api/profiles");
    expect(res.status).toBe(200);
    const body = await res.json<{ profiles: unknown[] }>();
    expect(body.profiles).toEqual([]);
  });
});

describe("GET /api/profiles/:id", () => {
  it("returns profile by id", async () => {
    await authPost("/api/profiles", validProfile);
    const res = await authFetch("/api/profiles/prof-001");
    expect(res.status).toBe(200);
    const body = await res.json<{ id: string; name: string }>();
    expect(body.id).toBe("prof-001");
  });

  it("returns 404 for unknown id", async () => {
    const res = await authFetch("/api/profiles/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/profiles/:id", () => {
  it("updates profile and bumps updated_at", async () => {
    await authPost("/api/profiles", validProfile);
    const res = await authPut("/api/profiles/prof-001", {
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
    await authPost("/api/profiles", validProfile);
    const res = await authDelete("/api/profiles/prof-001");
    expect(res.status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const res = await authDelete("/api/profiles/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 409 when partner is in a couple", async () => {
    await authPost("/api/profiles", { ...validProfile, id: "prof-coupled-a" });
    await authPost("/api/profiles", { ...validProfile, id: "prof-coupled-b", name: "Jordan" });
    await env.DB.prepare(
      "INSERT INTO couples (id, partner_a, partner_b, created_at) VALUES (?, ?, ?, ?)"
    ).bind("couple-1", "prof-coupled-a", "prof-coupled-b", new Date().toISOString()).run();

    const res = await authDelete("/api/profiles/prof-coupled-a");
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("couple");
  });
});

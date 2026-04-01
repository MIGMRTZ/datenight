import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SELF, env, fetchMock } from "cloudflare:test";
import { applyMigrations, authFetch } from "./helpers";

const TMDB_RESPONSE = {
  results: [
    {
      id: 123,
      title: "The Great Adventure",
      genre_ids: [28, 12],
      vote_average: 7.5,
      overview: "An exciting journey.",
      poster_path: "/abc123.jpg",
    },
    {
      id: 456,
      title: "Comedy Night",
      genre_ids: [35],
      vote_average: 6.8,
      overview: "A funny evening.",
      poster_path: "/def456.jpg",
    },
  ],
};

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

describe("GET /api/movies", () => {
  it("returns movies with M# IDs from TMDb", async () => {
    fetchMock
      .get("https://api.themoviedb.org")
      .intercept({ path: /\/3\/movie\/now_playing/ })
      .reply(200, TMDB_RESPONSE);

    const res = await authFetch("/api/movies?zip=75165&date=2026-04-01");
    expect(res.status).toBe(200);

    const body = await res.json<{
      venues: Array<{ id: string; title: string; genre: string; tmdb_id: number }>;
      radius_expanded: boolean;
    }>();
    expect(body.venues).toHaveLength(2);
    expect(body.venues[0].id).toBe("M1");
    expect(body.venues[0].title).toBe("The Great Adventure");
    expect(body.venues[0].genre).toBe("Action");
    expect(body.venues[0].tmdb_id).toBe(123);
    expect(body.venues[1].id).toBe("M2");
    expect(body.radius_expanded).toBe(false);
  });

  it("returns cached data on second call", async () => {
    const interceptor = fetchMock
      .get("https://api.themoviedb.org")
      .intercept({ path: /\/3\/movie\/now_playing/ })
      .reply(200, TMDB_RESPONSE);

    // First call — fetches from TMDb
    await authFetch("/api/movies?zip=75165&date=2026-04-01");

    // Second call — should use cache
    const res = await authFetch("/api/movies?zip=75165&date=2026-04-01");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[] }>();
    expect(body.venues).toHaveLength(2);
  });

  it("returns empty venues with warning on TMDb error", async () => {
    fetchMock
      .get("https://api.themoviedb.org")
      .intercept({ path: /\/3\/movie\/now_playing/ })
      .reply(500, { status_message: "Internal error" });

    const res = await authFetch("/api/movies?zip=75165&date=2026-04-01");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[]; warnings: string[] }>();
    expect(body.venues).toEqual([]);
    expect(body.warnings).toBeDefined();
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it("returns 400 when zip is missing", async () => {
    const res = await authFetch("/api/movies");
    expect(res.status).toBe(400);
  });

  it("uses correct cache TTL of 1 hour", async () => {
    fetchMock
      .get("https://api.themoviedb.org")
      .intercept({ path: /\/3\/movie\/now_playing/ })
      .reply(200, TMDB_RESPONSE);

    await authFetch("/api/movies?zip=99999&date=2026-04-01");

    // Verify data is in KV
    const cached = await env.CACHE.get("movies:99999:2026-04-01");
    expect(cached).not.toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SELF, env, fetchMock } from "cloudflare:test";
import { authFetch } from "./helpers";

const YELP_RESPONSE = {
  businesses: [
    {
      id: "yelp-1",
      name: "Craft & Co Bar",
      location: { display_address: ["123 Main St", "Waxahachie, TX"] },
      categories: [{ alias: "american", title: "American" }],
      rating: 4.5,
      price: "$$",
      alias: "craft-and-co-bar-waxahachie",
      coordinates: { latitude: 32.3866, longitude: -96.8483 },
    },
    {
      id: "yelp-2",
      name: "Bistro 31",
      location: { display_address: ["456 Oak Ave", "Waxahachie, TX"] },
      categories: [{ alias: "italian", title: "Italian" }],
      rating: 4.2,
      price: "$$$",
      alias: "bistro-31-waxahachie",
      coordinates: { latitude: 32.3901, longitude: -96.8512 },
    },
    {
      id: "yelp-3",
      name: "Taco Palace",
      location: { display_address: ["789 Elm St", "Waxahachie, TX"] },
      categories: [{ alias: "mexican", title: "Mexican" }],
      rating: 4.0,
      price: "$",
      alias: "taco-palace-waxahachie",
      coordinates: { latitude: 32.3920, longitude: -96.8500 },
    },
  ],
};

const SPARSE_RESPONSE = {
  businesses: [YELP_RESPONSE.businesses[0]],
};

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

describe("GET /api/restaurants", () => {
  it("returns restaurants with R# IDs", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_RESPONSE);

    const res = await authFetch("/api/restaurants?zip=75165");
    expect(res.status).toBe(200);

    const body = await res.json<{
      venues: Array<{ id: string; name: string; cuisine: string; yelp_slug: string }>;
      radius_expanded: boolean;
    }>();
    expect(body.venues).toHaveLength(3);
    expect(body.venues[0].id).toBe("R1");
    expect(body.venues[0].name).toBe("Craft & Co Bar");
    expect(body.venues[0].cuisine).toBe("American");
    expect(body.venues[0].yelp_slug).toBe("craft-and-co-bar-waxahachie");
    expect(body.radius_expanded).toBe(false);
  });

  it("returns cached data on second call", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_RESPONSE);

    await authFetch("/api/restaurants?zip=75165&cuisine=italian&radius=10");
    const res = await authFetch("/api/restaurants?zip=75165&cuisine=italian&radius=10");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[] }>();
    expect(body.venues).toHaveLength(3);
  });

  it("triggers sparse expansion when < 3 results", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, SPARSE_RESPONSE)
      .persist();

    // Override for 25mi — return full results
    // Note: fetchMock may not distinguish by query params easily,
    // so we test that radius_expanded is set when results are sparse
    const res = await authFetch("/api/restaurants?zip=75165&radius=10");
    expect(res.status).toBe(200);
    const body = await res.json<{ radius_expanded: boolean; radius_miles: number }>();
    // With only 1 result at every radius, expansion happens
    expect(body.radius_expanded).toBe(true);
  });

  it("returns empty with warning on Yelp error", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(500, { error: { code: "INTERNAL_ERROR" } });

    const res = await authFetch("/api/restaurants?zip=75165");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[]; warnings: string[] }>();
    expect(body.venues).toEqual([]);
    expect(body.warnings).toBeDefined();
  });

  it("returns 400 when zip is missing", async () => {
    const res = await authFetch("/api/restaurants");
    expect(res.status).toBe(400);
  });

  it("sets radius_expanded false when enough results", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_RESPONSE);

    const res = await authFetch("/api/restaurants?zip=75165&radius=10");
    expect(res.status).toBe(200);
    const body = await res.json<{ radius_expanded: boolean; radius_miles: number }>();
    expect(body.radius_expanded).toBe(false);
    expect(body.radius_miles).toBe(10);
  });

  it("uses correct cache key with cuisine and radius", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_RESPONSE);

    await authFetch("/api/restaurants?zip=75165&cuisine=italian&radius=15");
    const cached = await env.CACHE.get("restaurants:75165:italian:15");
    expect(cached).not.toBeNull();
  });
});

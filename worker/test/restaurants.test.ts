import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { authFetch } from "./helpers";

const YELP_RESPONSE = {
  businesses: [
    {
      id: "yelp-1", name: "Craft & Co Bar", alias: "craft-and-co-bar-waxahachie",
      rating: 4.5, price: "$$",
      categories: [{ alias: "american", title: "American" }],
      coordinates: { latitude: 32.3866, longitude: -96.8483 },
      location: { display_address: ["123 Main St", "Waxahachie, TX"] },
    },
    {
      id: "yelp-2", name: "Bistro 31", alias: "bistro-31-waxahachie",
      rating: 4.2, price: "$$$",
      categories: [{ alias: "italian", title: "Italian" }],
      coordinates: { latitude: 32.3901, longitude: -96.8512 },
      location: { display_address: ["456 Oak Ave", "Waxahachie, TX"] },
    },
    {
      id: "yelp-3", name: "Taco Palace", alias: "taco-palace-waxahachie",
      rating: 4.0, price: "$",
      categories: [{ alias: "mexican", title: "Mexican" }],
      coordinates: { latitude: 32.3920, longitude: -96.8500 },
      location: { display_address: ["789 Elm St", "Waxahachie, TX"] },
    },
  ],
};

beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => { fetchMock.deactivate(); });

describe("GET /api/restaurants", () => {
  it("returns restaurants with R# IDs", async () => {
    fetchMock.get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ }).reply(200, YELP_RESPONSE);

    const res = await authFetch("/api/restaurants?zip=10001");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: Array<{ id: string; name: string }>; radius_expanded: boolean }>();
    expect(body.venues).toHaveLength(3);
    expect(body.venues[0].id).toBe("R1");
    expect(body.venues[0].name).toBe("Craft & Co Bar");
    expect(body.radius_expanded).toBe(false);
  });

  it("returns cached data on second call", async () => {
    fetchMock.get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ }).reply(200, YELP_RESPONSE);

    await authFetch("/api/restaurants?zip=20002&radius=10");
    const res = await authFetch("/api/restaurants?zip=20002&radius=10");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[] }>();
    expect(body.venues).toHaveLength(3);
  });

  it("triggers sparse expansion when < 3 results", async () => {
    fetchMock.get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, { businesses: [YELP_RESPONSE.businesses[0]] }).persist();

    const res = await authFetch("/api/restaurants?zip=30003&radius=10");
    expect(res.status).toBe(200);
    const body = await res.json<{ radius_expanded: boolean }>();
    expect(body.radius_expanded).toBe(true);
  });

  it("returns empty with warning on Yelp error", async () => {
    fetchMock.get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ }).reply(500, {});

    const res = await authFetch("/api/restaurants?zip=40004");
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
    fetchMock.get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ }).reply(200, YELP_RESPONSE);

    const res = await authFetch("/api/restaurants?zip=50005&radius=10");
    expect(res.status).toBe(200);
    const body = await res.json<{ radius_expanded: boolean; radius_miles: number }>();
    expect(body.radius_expanded).toBe(false);
    expect(body.radius_miles).toBe(10);
  });

  it("caches results under the correct key", async () => {
    fetchMock.get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ }).reply(200, YELP_RESPONSE);

    await authFetch("/api/restaurants?zip=60006&cuisine=italian&radius=15");
    const cached = await env.CACHE.get("restaurants:60006:italian:15");
    expect(cached).not.toBeNull();
  });
});

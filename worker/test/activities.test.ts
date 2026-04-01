import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { authFetch } from "./helpers";

const YELP_ACTIVITIES = {
  businesses: [
    {
      id: "yelp-a1",
      name: "The Improv House",
      alias: "improv-house-waxahachie",
      rating: 4.3,
      categories: [{ alias: "comedyclubs", title: "Comedy Clubs" }],
      coordinates: { latitude: 32.39, longitude: -96.85 },
      location: { display_address: ["100 Comedy Ln", "Waxahachie, TX"] },
    },
    {
      id: "yelp-a2",
      name: "Strike Zone Bowling",
      alias: "strike-zone-bowling-waxahachie",
      rating: 4.0,
      categories: [{ alias: "bowling", title: "Bowling" }],
      coordinates: { latitude: 32.38, longitude: -96.84 },
      location: { display_address: ["200 Bowl Dr", "Waxahachie, TX"] },
    },
    {
      id: "yelp-a3",
      name: "City Art Gallery",
      alias: "city-art-gallery-waxahachie",
      rating: 4.6,
      categories: [{ alias: "galleries", title: "Art Galleries" }],
      coordinates: { latitude: 32.40, longitude: -96.85 },
      location: { display_address: ["300 Art St", "Waxahachie, TX"] },
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

describe("GET /api/activities", () => {
  it("returns activities with A# IDs", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_ACTIVITIES);

    const res = await authFetch("/api/activities?zip=75165");
    expect(res.status).toBe(200);

    const body = await res.json<{
      venues: Array<{ id: string; name: string; category: string; yelp_slug: string }>;
    }>();
    expect(body.venues).toHaveLength(3);
    expect(body.venues[0].id).toBe("A1");
    expect(body.venues[0].name).toBe("The Improv House");
    expect(body.venues[0].category).toBe("Comedy Clubs");
    expect(body.venues[0].yelp_slug).toBe("improv-house-waxahachie");
  });

  it("returns cached data on second call", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_ACTIVITIES);

    await authFetch("/api/activities?zip=75165&category=active");
    const res = await authFetch("/api/activities?zip=75165&category=active");
    expect(res.status).toBe(200);
  });

  it("triggers sparse expansion when < 3 results", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, { businesses: [YELP_ACTIVITIES.businesses[0]] })
      .persist();

    const res = await authFetch("/api/activities?zip=75165");
    expect(res.status).toBe(200);
    const body = await res.json<{ radius_expanded: boolean }>();
    expect(body.radius_expanded).toBe(true);
  });

  it("returns empty with warning on Yelp error", async () => {
    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(500, {});

    const res = await authFetch("/api/activities?zip=75165");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[]; warnings: string[] }>();
    expect(body.venues).toEqual([]);
    expect(body.warnings).toBeDefined();
  });

  it("returns 400 when zip is missing", async () => {
    const res = await authFetch("/api/activities");
    expect(res.status).toBe(400);
  });
});

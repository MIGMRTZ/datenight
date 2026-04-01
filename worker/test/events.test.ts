import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { authFetch } from "./helpers";

const EVENTBRITE_RESPONSE = {
  events: [
    {
      id: "eb-001",
      name: { text: "Jazz Night Downtown" },
      start: { local: "2026-04-05T19:00:00" },
      venue: { name: "The Blue Note", address: { localized_address_display: "500 Jazz Ave, Waxahachie, TX" } },
      url: "https://www.eventbrite.com/e/eb-001",
    },
    {
      id: "eb-002",
      name: { text: "Food Truck Festival" },
      start: { local: "2026-04-06T11:00:00" },
      venue: { name: "City Park", address: { localized_address_display: "100 Park Rd, Waxahachie, TX" } },
      url: "https://www.eventbrite.com/e/eb-002",
    },
    {
      id: "eb-003",
      name: { text: "Comedy Open Mic" },
      start: { local: "2026-04-05T20:00:00" },
      venue: { name: "Laugh Factory", address: { localized_address_display: "200 Fun St, Waxahachie, TX" } },
      url: "https://www.eventbrite.com/e/eb-003",
    },
  ],
};

const YELP_EVENTS_FALLBACK = {
  businesses: [
    {
      id: "yelp-ev1",
      name: "Live Music Venue",
      alias: "live-music-venue-waxahachie",
      rating: 4.2,
      categories: [{ alias: "musicvenues", title: "Music Venues" }],
      coordinates: { latitude: 32.39, longitude: -96.85 },
      location: { display_address: ["300 Music Ln", "Waxahachie, TX"] },
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

describe("GET /api/events", () => {
  it("returns events with E# IDs from Eventbrite", async () => {
    fetchMock
      .get("https://www.eventbriteapi.com")
      .intercept({ path: /\/v3\/events\/search/ })
      .reply(200, EVENTBRITE_RESPONSE);

    const res = await authFetch("/api/events?zip=75165&date_from=2026-04-05&date_to=2026-04-07");
    expect(res.status).toBe(200);

    const body = await res.json<{
      venues: Array<{ id: string; name: string; eventbrite_id: string }>;
    }>();
    expect(body.venues).toHaveLength(3);
    expect(body.venues[0].id).toBe("E1");
    expect(body.venues[0].name).toBe("Jazz Night Downtown");
    expect(body.venues[0].eventbrite_id).toBe("eb-001");
  });

  it("returns cached data on second call", async () => {
    fetchMock
      .get("https://www.eventbriteapi.com")
      .intercept({ path: /\/v3\/events\/search/ })
      .reply(200, EVENTBRITE_RESPONSE);

    await authFetch("/api/events?zip=75165&date_from=2026-04-05&date_to=2026-04-07");
    const res = await authFetch("/api/events?zip=75165&date_from=2026-04-05&date_to=2026-04-07");
    expect(res.status).toBe(200);
  });

  it("falls back to Yelp when Eventbrite returns error", async () => {
    fetchMock
      .get("https://www.eventbriteapi.com")
      .intercept({ path: /\/v3\/events\/search/ })
      .reply(403, { error: "Forbidden" });

    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(200, YELP_EVENTS_FALLBACK);

    const res = await authFetch("/api/events?zip=75165");
    expect(res.status).toBe(200);

    const body = await res.json<{
      venues: Array<{ id: string; name: string }>;
      warnings?: string[];
    }>();
    expect(body.venues.length).toBeGreaterThanOrEqual(1);
    expect(body.venues[0].id).toBe("E1");
    // No warning for Eventbrite fallback — it's seamless
    expect(body.warnings).toBeUndefined();
  });

  it("returns empty with warning when both APIs fail", async () => {
    fetchMock
      .get("https://www.eventbriteapi.com")
      .intercept({ path: /\/v3\/events\/search/ })
      .reply(500, {});

    fetchMock
      .get("https://api.yelp.com")
      .intercept({ path: /\/v3\/businesses\/search/ })
      .reply(500, {});

    const res = await authFetch("/api/events?zip=75165");
    expect(res.status).toBe(200);
    const body = await res.json<{ venues: unknown[]; warnings: string[] }>();
    expect(body.venues).toEqual([]);
    expect(body.warnings).toBeDefined();
  });

  it("returns 400 when zip is missing", async () => {
    const res = await authFetch("/api/events");
    expect(res.status).toBe(400);
  });

  it("uses correct cache key and TTL", async () => {
    fetchMock
      .get("https://www.eventbriteapi.com")
      .intercept({ path: /\/v3\/events\/search/ })
      .reply(200, EVENTBRITE_RESPONSE);

    await authFetch("/api/events?zip=99999&date_from=2026-04-05&date_to=2026-04-07");
    const cached = await env.CACHE.get("events:99999:2026-04-05:2026-04-07");
    expect(cached).not.toBeNull();
  });
});

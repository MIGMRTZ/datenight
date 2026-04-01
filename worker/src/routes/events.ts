import { Hono } from "hono";
import type { Env } from "../types";
import { assignVenueIds } from "../venues/ids";
import { withCache } from "../venues/cache";
import { fetchYelpBusinesses } from "../venues/yelp";
import type { EventVenue, VenueResponse } from "../venues/types";

interface EventbriteEvent {
  id: string;
  name: { text: string };
  start: { local: string };
  venue?: {
    name: string;
    address: { localized_address_display: string };
  };
  url: string;
}

interface EventbriteResponse {
  events: EventbriteEvent[];
}

function transformEventbriteEvent(ev: EventbriteEvent): Omit<EventVenue, "id"> {
  const startDate = ev.start.local.split("T")[0];
  const startTime = ev.start.local.split("T")[1]?.slice(0, 5) || "";

  return {
    name: ev.name.text,
    date: startDate,
    time: startTime,
    venue: ev.venue?.name || "",
    address: ev.venue?.address.localized_address_display || "",
    eventbrite_id: ev.id,
    url: ev.url,
  };
}

async function fetchFromEventbrite(
  apiKey: string,
  zip: string,
  dateFrom: string,
  dateTo: string
): Promise<Omit<EventVenue, "id">[]> {
  const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
  url.searchParams.set("location.address", zip);
  url.searchParams.set("start_date.range_start", `${dateFrom}T00:00:00`);
  url.searchParams.set("start_date.range_end", `${dateTo}T23:59:59`);
  url.searchParams.set("token", apiKey);

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Eventbrite API error: ${resp.status}`);

  const data = (await resp.json()) as EventbriteResponse;
  return data.events.map(transformEventbriteEvent);
}

async function fetchFromYelpFallback(
  apiKey: string,
  zip: string
): Promise<Omit<EventVenue, "id">[]> {
  const businesses = await fetchYelpBusinesses(apiKey, {
    location: zip,
    categories: "festivals,musicvenues,comedyclubs,nightlife",
    radiusMiles: 25,
  });

  return businesses.map((biz) => ({
    name: biz.name,
    date: "",
    time: "",
    venue: biz.name,
    address: biz.location.display_address.join(", "),
    yelp_slug: biz.alias,
  }));
}

export const eventRoutes = new Hono<{ Bindings: Env }>();

eventRoutes.get("/", async (c) => {
  const zip = c.req.query("zip");
  if (!zip) {
    return c.json({ error: "Missing required parameter: zip" }, 400);
  }

  const today = new Date().toISOString().split("T")[0];
  const dateFrom = c.req.query("date_from") || today;
  const dateTo = c.req.query("date_to") || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  })();

  const cacheKey = `events:${zip}:${dateFrom}:${dateTo}`;

  try {
    const { data: events } = await withCache<Omit<EventVenue, "id">[]>(
      c.env.CACHE,
      cacheKey,
      21600, // 6 hours
      async () => {
        // Try Eventbrite first, seamless Yelp fallback
        try {
          return await fetchFromEventbrite(c.env.EVENTBRITE_API_KEY, zip, dateFrom, dateTo);
        } catch {
          // Seamless fallback — no warning for Eventbrite failure
          return await fetchFromYelpFallback(c.env.YELP_API_KEY, zip);
        }
      }
    );

    const venues = assignVenueIds("E", events);
    const response: VenueResponse<EventVenue> = {
      venues,
      radius_miles: 0,
      radius_expanded: false,
    };
    return c.json(response);
  } catch {
    return c.json({
      venues: [],
      radius_miles: 0,
      radius_expanded: false,
      warnings: ["Event data temporarily unavailable"],
    });
  }
});

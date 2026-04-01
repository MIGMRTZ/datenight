import { Hono } from "hono";
import type { Env } from "../types";
import { assignVenueIds } from "../venues/ids";
import { withCache } from "../venues/cache";
import { withSparseExpansion } from "../venues/sparse";
import { fetchYelpBusinesses, type YelpBusiness } from "../venues/yelp";
import type { ActivityVenue, VenueResponse } from "../venues/types";

function transformYelpActivity(biz: YelpBusiness): Omit<ActivityVenue, "id"> {
  return {
    name: biz.name,
    category: biz.categories[0]?.title || "Other",
    address: biz.location.display_address.join(", "),
    rating: biz.rating,
    yelp_slug: biz.alias,
    lat: biz.coordinates.latitude,
    lng: biz.coordinates.longitude,
  };
}

export const activityRoutes = new Hono<{ Bindings: Env }>();

activityRoutes.get("/", async (c) => {
  const zip = c.req.query("zip");
  if (!zip) {
    return c.json({ error: "Missing required parameter: zip" }, 400);
  }

  const category = c.req.query("category") || "";
  const initialRadius = parseInt(c.req.query("radius") || "10", 10);

  try {
    const result = await withSparseExpansion(
      async (radiusMiles) => {
        const cacheKey = `activities:${zip}:${category || "all"}:${radiusMiles}`;
        const { data } = await withCache<Omit<ActivityVenue, "id">[]>(
          c.env.CACHE,
          cacheKey,
          86400, // 24 hours
          async () => {
            const businesses = await fetchYelpBusinesses(c.env.YELP_API_KEY, {
              location: zip,
              categories: category || undefined,
              radiusMiles,
            });
            return businesses.map(transformYelpActivity);
          }
        );
        return data;
      },
      initialRadius
    );

    const venues = assignVenueIds("A", result.venues);
    const response: VenueResponse<ActivityVenue> = {
      venues,
      radius_miles: result.radius_miles,
      radius_expanded: result.radius_expanded,
    };
    return c.json(response);
  } catch {
    return c.json({
      venues: [],
      radius_miles: initialRadius,
      radius_expanded: false,
      warnings: ["Activity data temporarily unavailable"],
    });
  }
});

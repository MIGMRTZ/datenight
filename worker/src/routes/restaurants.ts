import { Hono } from "hono";
import type { Env } from "../types";
import { assignVenueIds } from "../venues/ids";
import { withCache } from "../venues/cache";
import { withSparseExpansion } from "../venues/sparse";
import { fetchYelpBusinesses, type YelpBusiness } from "../venues/yelp";
import type { RestaurantVenue, VenueResponse } from "../venues/types";

function transformYelpRestaurant(biz: YelpBusiness): Omit<RestaurantVenue, "id"> {
  return {
    name: biz.name,
    address: biz.location.display_address.join(", "),
    cuisine: biz.categories[0]?.title || "Other",
    rating: biz.rating,
    price: biz.price || "$",
    yelp_slug: biz.alias,
    lat: biz.coordinates.latitude,
    lng: biz.coordinates.longitude,
  };
}

export const restaurantRoutes = new Hono<{ Bindings: Env }>();

restaurantRoutes.get("/", async (c) => {
  const zip = c.req.query("zip");
  if (!zip) {
    return c.json({ error: "Missing required parameter: zip" }, 400);
  }

  const cuisine = c.req.query("cuisine") || "";
  const initialRadius = parseInt(c.req.query("radius") || "10", 10);

  try {
    const result = await withSparseExpansion(
      async (radiusMiles) => {
        const cacheKey = `restaurants:${zip}:${cuisine || "all"}:${radiusMiles}`;
        const { data } = await withCache<Omit<RestaurantVenue, "id">[]>(
          c.env.CACHE,
          cacheKey,
          86400, // 24 hours
          async () => {
            const businesses = await fetchYelpBusinesses(c.env.YELP_API_KEY, {
              location: zip,
              categories: cuisine || undefined,
              radiusMiles,
            });
            return businesses.map(transformYelpRestaurant);
          }
        );
        return data;
      },
      initialRadius
    );

    const venues = assignVenueIds("R", result.venues);
    const response: VenueResponse<RestaurantVenue> = {
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
      warnings: ["Restaurant data temporarily unavailable"],
    });
  }
});

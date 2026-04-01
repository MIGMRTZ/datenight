import { Hono } from "hono";
import type { Env } from "../types";
import { assignVenueIds } from "./ids";
import { withCache } from "./cache";
import { withSparseExpansion } from "./sparse";
import { fetchYelpBusinesses, type YelpBusiness } from "./yelp";
import { emptyVenueResponse, parseRadius } from "./response";
import type { VenueResponse } from "./types";

interface YelpRouteConfig<T> {
  cachePrefix: string;
  idPrefix: string;
  filterParam: string;
  cacheTtl: number;
  warningMessage: string;
  transform: (biz: YelpBusiness) => Omit<T, "id">;
}

/**
 * Factory for creating Yelp-backed venue discovery routes.
 * Handles zip validation, sparse expansion, KV caching, and error fallback.
 */
export function createYelpRoute<T>(config: YelpRouteConfig<T>) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/", async (c) => {
    const zip = c.req.query("zip");
    if (!zip) {
      return c.json({ error: "Missing required parameter: zip" }, 400);
    }

    const filter = c.req.query(config.filterParam) || "";
    const initialRadius = parseRadius(c.req.query("radius"));

    try {
      const result = await withSparseExpansion(
        async (radiusMiles) => {
          const cacheKey = `${config.cachePrefix}:${zip}:${filter || "all"}:${radiusMiles}`;
          const { data } = await withCache<Omit<T, "id">[]>(
            c.env.CACHE,
            cacheKey,
            config.cacheTtl,
            async () => {
              const businesses = await fetchYelpBusinesses(c.env.YELP_API_KEY, {
                location: zip,
                categories: filter || undefined,
                radiusMiles,
              });
              return businesses.map(config.transform);
            }
          );
          return data;
        },
        initialRadius
      );

      const venues = assignVenueIds(config.idPrefix, result.venues);
      const response: VenueResponse<T & { id: string }> = {
        venues,
        radius_miles: result.radius_miles,
        radius_expanded: result.radius_expanded,
      };
      return c.json(response);
    } catch (err) {
      console.error(`${config.cachePrefix} route error:`, err);
      return c.json(emptyVenueResponse(initialRadius, config.warningMessage));
    }
  });

  return routes;
}

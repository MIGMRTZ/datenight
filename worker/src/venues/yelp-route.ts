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
 *
 * Cache strategy: only the final expanded result is cached, keyed by
 * the actual radius used. Intermediate sparse results are not cached
 * to avoid serving known-sparse data on repeat requests.
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
      // Check cache for the initial radius first
      const cacheKey = `${config.cachePrefix}:${zip}:${filter || "all"}:${initialRadius}`;
      const cached = await c.env.CACHE.get(cacheKey);
      if (cached !== null) {
        const data = JSON.parse(cached) as Omit<T, "id">[];
        const venues = assignVenueIds(config.idPrefix, data);
        const response: VenueResponse<T & { id: string }> = {
          venues,
          radius_miles: initialRadius,
          radius_expanded: false,
        };
        return c.json(response);
      }

      // Cache miss — fetch with sparse expansion
      const result = await withSparseExpansion(
        async (radiusMiles) => {
          const businesses = await fetchYelpBusinesses(c.env.YELP_API_KEY, {
            location: zip,
            categories: filter || undefined,
            radiusMiles,
          });
          return businesses.map(config.transform);
        },
        initialRadius
      );

      // Cache only the final result under the actual radius used
      const finalKey = `${config.cachePrefix}:${zip}:${filter || "all"}:${result.radius_miles}`;
      const serialized = JSON.stringify(result.venues);
      await Promise.all([
        c.env.CACHE.put(finalKey, serialized, { expirationTtl: config.cacheTtl }),
        c.env.CACHE.put(`stale:${finalKey}`, serialized, { expirationTtl: 604800 }),
      ]);

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

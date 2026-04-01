/**
 * Shared Yelp Fusion API helper used by restaurants and activities routes.
 */

export interface YelpBusiness {
  id: string;
  name: string;
  alias: string;
  rating: number;
  price?: string;
  categories: Array<{ alias: string; title: string }>;
  coordinates: { latitude: number; longitude: number };
  location: { display_address: string[] };
}

interface YelpResponse {
  businesses: YelpBusiness[];
}

const MILES_TO_METERS = 1609;
const YELP_MAX_RADIUS = 40000;

export async function fetchYelpBusinesses(
  apiKey: string,
  params: {
    location: string;
    categories?: string;
    radiusMiles?: number;
    limit?: number;
  }
): Promise<YelpBusiness[]> {
  const radiusMeters = Math.min(
    (params.radiusMiles || 10) * MILES_TO_METERS,
    YELP_MAX_RADIUS
  );

  const url = new URL("https://api.yelp.com/v3/businesses/search");
  url.searchParams.set("location", params.location);
  url.searchParams.set("radius", String(Math.round(radiusMeters)));
  url.searchParams.set("sort_by", "best_match");
  url.searchParams.set("limit", String(params.limit || 20));
  if (params.categories) {
    url.searchParams.set("categories", params.categories);
  }

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    throw new Error(`Yelp API error: ${resp.status}`);
  }

  const data = (await resp.json()) as YelpResponse;
  return data.businesses;
}

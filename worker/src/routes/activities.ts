import type { YelpBusiness } from "../venues/yelp";
import { createYelpRoute } from "../venues/yelp-route";
import type { ActivityVenue } from "../venues/types";

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

export const activityRoutes = createYelpRoute<ActivityVenue>({
  cachePrefix: "activities",
  idPrefix: "A",
  filterParam: "category",
  cacheTtl: 86400,
  warningMessage: "Activity data temporarily unavailable",
  transform: transformYelpActivity,
});

import type { YelpBusiness } from "../venues/yelp";
import { createYelpRoute } from "../venues/yelp-route";
import type { RestaurantVenue } from "../venues/types";

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

export const restaurantRoutes = createYelpRoute<RestaurantVenue>({
  cachePrefix: "restaurants",
  idPrefix: "R",
  filterParam: "cuisine",
  cacheTtl: 86400,
  warningMessage: "Restaurant data temporarily unavailable",
  transform: transformYelpRestaurant,
});

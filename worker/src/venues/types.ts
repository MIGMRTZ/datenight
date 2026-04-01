export interface BaseVenue {
  id: string;
  name: string;
}

export interface MovieVenue extends BaseVenue {
  genre: string;
  rating: number;
  synopsis: string;
  poster_url: string;
  tmdb_id: number;
}

export interface RestaurantVenue extends BaseVenue {
  address: string;
  cuisine: string;
  rating: number;
  price: string;
  yelp_slug: string;
  lat: number;
  lng: number;
}

export interface ActivityVenue extends BaseVenue {
  category: string;
  address: string;
  rating: number;
  yelp_slug: string;
  lat: number;
  lng: number;
}

export interface EventVenue extends BaseVenue {
  date: string;
  time: string;
  venue: string;
  address: string;
  eventbrite_id?: string;
  yelp_slug?: string;
  url?: string;
}

export interface VenueResponse<T> {
  venues: T[];
  radius_miles: number;
  radius_expanded: boolean;
  warnings?: string[];
}

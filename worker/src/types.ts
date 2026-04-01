export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AUTH_TOKEN: string;
  ENVIRONMENT: "production" | "staging" | "development";
  YELP_API_KEY: string;
  TMDB_API_KEY: string;
  EVENTBRITE_API_KEY: string;
}

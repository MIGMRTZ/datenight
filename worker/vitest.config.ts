import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            AUTH_TOKEN: "test-auth-token",
            YELP_API_KEY: "test-yelp-key",
            TMDB_API_KEY: "test-tmdb-key",
            EVENTBRITE_API_KEY: "test-eventbrite-key",
          },
        },
      },
    },
  },
});

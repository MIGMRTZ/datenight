import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { foreignKeysMiddleware } from "./middleware/db";
import { activityRoutes } from "./routes/activities";
import { coupleRoutes } from "./routes/couples";
import { movieRoutes } from "./routes/movies";
import { profileRoutes } from "./routes/profiles";
import { restaurantRoutes } from "./routes/restaurants";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Public routes (no auth required)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Protected API routes (auth required)
const api = new Hono<{ Bindings: Env }>();
api.use("*", authMiddleware);
api.use("*", foreignKeysMiddleware);

api.get("/ping", (c) => {
  return c.json({ message: "authenticated" });
});

api.route("/profiles", profileRoutes);
api.route("/couples", coupleRoutes);
api.route("/movies", movieRoutes);
api.route("/restaurants", restaurantRoutes);
api.route("/activities", activityRoutes);

app.route("/api", api);

export default app;

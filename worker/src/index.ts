import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { foreignKeysMiddleware } from "./middleware/db";
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

app.route("/api", api);

export default app;

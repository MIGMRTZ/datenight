import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        { error: "Missing or invalid Authorization header" },
        401
      );
    }

    const token = authHeader.slice(7);
    if (token !== c.env.AUTH_TOKEN) {
      return c.json({ error: "Invalid token" }, 401);
    }

    await next();
  }
);

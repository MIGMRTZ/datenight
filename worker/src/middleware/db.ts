import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

/**
 * Enable foreign key enforcement on every D1 connection.
 * D1/SQLite requires this per-connection — it's not a global setting.
 */
export const foreignKeysMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    await c.env.DB.exec("PRAGMA foreign_keys = ON");
    await next();
  }
);

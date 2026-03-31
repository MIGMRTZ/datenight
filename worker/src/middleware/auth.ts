import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

const encoder = new TextEncoder();

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) {
    // Consume constant time even on length mismatch
    await crypto.subtle.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

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
    if (!(await timingSafeEqual(token, c.env.AUTH_TOKEN))) {
      return c.json({ error: "Invalid token" }, 401);
    }

    await next();
  }
);

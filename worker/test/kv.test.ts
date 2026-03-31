import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("Workers KV (CACHE)", () => {
  it("supports write and read round-trip", async () => {
    await env.CACHE.put("test-key", JSON.stringify({ data: "hello" }));

    const value = await env.CACHE.get("test-key");
    expect(value).not.toBeNull();
    expect(JSON.parse(value!)).toEqual({ data: "hello" });
  });
});

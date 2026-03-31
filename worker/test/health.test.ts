import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("GET /health", () => {
  it("returns 200 status", async () => {
    const response = await SELF.fetch("http://localhost/health");
    expect(response.status).toBe(200);
  });

  it("returns JSON with status ok", async () => {
    const response = await SELF.fetch("http://localhost/health");
    const body = await response.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  it("includes ISO 8601 timestamp", async () => {
    const response = await SELF.fetch("http://localhost/health");
    const body = await response.json<{ timestamp: string }>();
    expect(body.timestamp).toBeDefined();
    // Verify it's a valid ISO date
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await SELF.fetch("http://localhost/nonexistent");
    expect(response.status).toBe(404);
  });
});

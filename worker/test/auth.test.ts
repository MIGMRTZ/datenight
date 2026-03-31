import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Auth Middleware", () => {
  it("GET /health without auth returns 200", async () => {
    const response = await SELF.fetch("http://localhost/health");
    expect(response.status).toBe(200);
  });

  it("GET /api/ping without header returns 401", async () => {
    const response = await SELF.fetch("http://localhost/api/ping");
    expect(response.status).toBe(401);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBeDefined();
  });

  it("GET /api/ping with invalid token returns 401", async () => {
    const response = await SELF.fetch("http://localhost/api/ping", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(response.status).toBe(401);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBeDefined();
  });

  it("GET /api/ping with valid token returns 200", async () => {
    const response = await SELF.fetch("http://localhost/api/ping", {
      headers: { Authorization: "Bearer test-auth-token" },
    });
    expect(response.status).toBe(200);
    const body = await response.json<{ message: string }>();
    expect(body.message).toBe("authenticated");
  });

  it("GET /api/ping with malformed header returns 401", async () => {
    const response = await SELF.fetch("http://localhost/api/ping", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(response.status).toBe(401);
  });

  it("Authorization header is case-sensitive for Bearer prefix", async () => {
    const response = await SELF.fetch("http://localhost/api/ping", {
      headers: { Authorization: "bearer test-auth-token" },
    });
    expect(response.status).toBe(401);
  });
});

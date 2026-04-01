import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { assignVenueIds } from "../src/venues/ids";
import { withCache } from "../src/venues/cache";
import { withSparseExpansion } from "../src/venues/sparse";

describe("assignVenueIds", () => {
  it("assigns prefixed sequential IDs", () => {
    const venues = [{ name: "Place A" }, { name: "Place B" }, { name: "Place C" }];
    const result = assignVenueIds("R", venues);
    expect(result).toEqual([
      { name: "Place A", id: "R1" },
      { name: "Place B", id: "R2" },
      { name: "Place C", id: "R3" },
    ]);
  });

  it("returns empty array for empty input", () => {
    const result = assignVenueIds("M", []);
    expect(result).toEqual([]);
  });
});

describe("withCache", () => {
  beforeEach(async () => {
    // Clear any test keys
    await env.CACHE.delete("test-key");
  });

  it("calls fetchFn and stores on cache miss", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "fresh" });
    const result = await withCache(env.CACHE, "test-key", 3600, fetchFn);
    expect(result.data).toEqual({ data: "fresh" });
    expect(result.cached).toBe(false);
    expect(fetchFn).toHaveBeenCalledOnce();

    // Verify stored in KV
    const stored = await env.CACHE.get("test-key");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ data: "fresh" });
  });

  it("returns cached data without calling fetchFn on hit", async () => {
    await env.CACHE.put("test-key", JSON.stringify({ data: "cached" }));
    const fetchFn = vi.fn();
    const result = await withCache(env.CACHE, "test-key", 3600, fetchFn);
    expect(result.data).toEqual({ data: "cached" });
    expect(result.cached).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("serves stale backup when fetchFn throws and primary cache is empty", async () => {
    // Seed stale:{key} but NOT the primary key — simulates expired primary
    await env.CACHE.put("stale:test-key", JSON.stringify({ data: "stale-backup" }));
    const fetchFn = vi.fn().mockRejectedValue(new Error("API down"));

    const result = await withCache(env.CACHE, "test-key", 3600, fetchFn);
    expect(result.data).toEqual({ data: "stale-backup" });
    expect(result.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("rethrows when fetchFn fails and no cache exists", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("API down"));
    // Neither primary nor stale:{key} exists
    await expect(
      withCache(env.CACHE, "no-cache-key", 3600, fetchFn)
    ).rejects.toThrow("API down");
  });
});

describe("withSparseExpansion", () => {
  it("returns immediately when >= 3 results at initial radius", async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const result = await withSparseExpansion(fetchFn, 10);
    expect(result.venues).toHaveLength(3);
    expect(result.radius_miles).toBe(10);
    expect(result.radius_expanded).toBe(false);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith(10);
  });

  it("expands to 25mi when initial yields < 3", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce([{ a: 1 }]) // 10mi: 1 result
      .mockResolvedValueOnce([{ a: 1 }, { b: 2 }, { c: 3 }]); // 25mi: 3 results
    const result = await withSparseExpansion(fetchFn, 10);
    expect(result.venues).toHaveLength(3);
    expect(result.radius_miles).toBe(25);
    expect(result.radius_expanded).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("expands to 40mi when 25mi still < 3", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce([]) // 10mi: 0
      .mockResolvedValueOnce([{ a: 1 }]) // 25mi: 1
      .mockResolvedValueOnce([{ a: 1 }, { b: 2 }]); // 40mi: 2 (still < 3 but max)
    const result = await withSparseExpansion(fetchFn, 10);
    expect(result.venues).toHaveLength(2);
    expect(result.radius_miles).toBe(40);
    expect(result.radius_expanded).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

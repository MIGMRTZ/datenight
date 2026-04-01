/**
 * KV cache helper with stale-on-error fallback.
 *
 * On cache hit: returns cached data without calling fetchFn.
 * On cache miss: calls fetchFn, stores result in KV, returns fresh data.
 * On fetchFn error: attempts to serve stale cached data if available.
 */
export async function withCache<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<{ data: T; cached: boolean }> {
  // Try cache first
  const cached = await kv.get(key);
  if (cached !== null) {
    return { data: JSON.parse(cached) as T, cached: true };
  }

  // Cache miss — fetch fresh data
  try {
    const data = await fetchFn();
    await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
    return { data, cached: false };
  } catch (error) {
    // Stale-on-error: try cache again (may exist if TTL expired but not evicted)
    const stale = await kv.get(key);
    if (stale !== null) {
      return { data: JSON.parse(stale) as T, cached: true };
    }
    throw error;
  }
}

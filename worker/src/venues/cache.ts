/**
 * KV cache helper with two-key stale-on-error fallback.
 *
 * Stores data under two keys: the primary key with the requested TTL,
 * and a `stale:{key}` backup with a 7-day TTL. On fetch failure,
 * the stale backup is served as a fallback.
 */

const STALE_TTL = 604800; // 7 days

export async function withCache<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<{ data: T; cached: boolean }> {
  const cached = await kv.get(key);
  if (cached !== null) {
    return { data: JSON.parse(cached) as T, cached: true };
  }

  try {
    const data = await fetchFn();
    // Store fresh + long-lived stale backup
    await Promise.all([
      kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds }),
      kv.put(`stale:${key}`, JSON.stringify(data), { expirationTtl: STALE_TTL }),
    ]);
    return { data, cached: false };
  } catch (error) {
    // Serve stale backup if available
    const stale = await kv.get(`stale:${key}`);
    if (stale !== null) {
      return { data: JSON.parse(stale) as T, cached: true };
    }
    throw error;
  }
}

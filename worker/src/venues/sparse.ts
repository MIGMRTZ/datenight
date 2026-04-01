/**
 * Auto-expand search radius when results are sparse.
 * Tries initialRadius → 25mi → 40mi until >= minResults or max reached.
 */
export async function withSparseExpansion<T>(
  fetchFn: (radiusMiles: number) => Promise<T[]>,
  initialRadius: number,
  minResults: number = 3
): Promise<{ venues: T[]; radius_miles: number; radius_expanded: boolean }> {
  const steps = [initialRadius, 25, 40].filter(
    (r, i) => i === 0 || r > initialRadius
  );

  for (let i = 0; i < steps.length; i++) {
    const radius = steps[i];
    const venues = await fetchFn(radius);
    if (venues.length >= minResults || i === steps.length - 1) {
      return {
        venues,
        radius_miles: radius,
        radius_expanded: i > 0,
      };
    }
  }

  // Unreachable, but satisfies TypeScript
  return { venues: [], radius_miles: initialRadius, radius_expanded: false };
}

/**
 * Assign sequential venue IDs with a category prefix.
 * E.g., prefix "R" produces R1, R2, R3...
 */
export function assignVenueIds<T>(prefix: string, venues: T[]): (T & { id: string })[] {
  return venues.map((v, i) => ({ ...v, id: `${prefix}${i + 1}` }));
}

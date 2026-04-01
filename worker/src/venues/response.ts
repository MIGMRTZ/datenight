import type { VenueResponse } from "./types";

/**
 * Build an empty venue response with a warning message.
 * Used as graceful degradation when external APIs fail.
 */
export function emptyVenueResponse(
  radiusMiles: number,
  warning: string
): VenueResponse<never> {
  return {
    venues: [],
    radius_miles: radiusMiles,
    radius_expanded: false,
    warnings: [warning],
  };
}

/**
 * Parse a radius query parameter with NaN/bounds validation.
 * Returns a safe integer between 1 and 40, defaulting to 10.
 */
export function parseRadius(raw: string | undefined): number {
  const parsed = parseInt(raw || "10", 10);
  if (Number.isNaN(parsed)) return 10;
  return Math.max(1, Math.min(parsed, 40));
}

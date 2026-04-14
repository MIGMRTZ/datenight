"""Resolve venue IDs from LLM output to full venue records.

Maps short IDs (R1, M2, A3, E1) back to the complete venue data
returned by the Cloudflare Worker's venue discovery endpoints.
"""

from typing import Any

from pydantic import BaseModel

from datenight.schemas import Phase1Plan

VenueMap = dict[str, dict[str, Any]]


class VenueResolverError(Exception):
    """Raised when a venue ID in the plan cannot be found in the venue map."""


class ResolvedStop(BaseModel):
    """A stop with full venue data attached."""

    order: int
    venue_id: str
    time: str
    duration_min: int
    why: str
    venue: dict[str, Any]


class ResolvedPlan(BaseModel):
    """A Phase1Plan with all stops resolved to full venue records."""

    date_type: str
    theme: str
    reasoning: str
    stops: list[ResolvedStop]


def build_venue_map(
    restaurants: list[dict[str, Any]],
    movies: list[dict[str, Any]],
    activities: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> VenueMap:
    """Build a flat lookup dict from all venue categories.

    Each venue must have an "id" key (e.g., "R1", "M2").
    """
    venue_map: VenueMap = {}
    for venue_list in [restaurants, movies, activities, events]:
        for venue in venue_list:
            venue_map[venue["id"]] = venue
    return venue_map


def resolve_plan(plan: Phase1Plan, venue_map: VenueMap) -> ResolvedPlan:
    """Map all venue IDs in the plan to full venue records.

    Raises:
        VenueResolverError: If any venue ID is not in the map.
    """
    resolved_stops: list[ResolvedStop] = []
    for stop in plan.stops:
        if stop.venue_id not in venue_map:
            raise VenueResolverError(f"Venue ID {stop.venue_id!r} not found in venue data.")
        resolved_stops.append(
            ResolvedStop(
                order=stop.order,
                venue_id=stop.venue_id,
                time=stop.time,
                duration_min=stop.duration_min,
                why=stop.why,
                venue=venue_map[stop.venue_id],
            )
        )

    return ResolvedPlan(
        date_type=plan.date_type,
        theme=plan.theme,
        reasoning=plan.reasoning,
        stops=resolved_stops,
    )

"""Tests for venue ID resolution."""

import json
from pathlib import Path

import pytest

from datenight.schemas import Phase1Plan, Stop
from datenight.venue_resolver import (
    VenueResolverError,
    build_venue_map,
    resolve_plan,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_venues() -> dict:
    return json.loads((FIXTURES / "sample_venues.json").read_text())


@pytest.fixture
def venue_map(sample_venues: dict) -> dict:
    return build_venue_map(
        restaurants=sample_venues["restaurants"],
        movies=sample_venues["movies"],
        activities=sample_venues["activities"],
        events=sample_venues["events"],
    )


def test_build_venue_map(venue_map: dict):
    """All venue IDs from all categories are present."""
    assert "R1" in venue_map
    assert "R2" in venue_map
    assert "M1" in venue_map
    assert "A1" in venue_map
    assert "A2" in venue_map
    assert "E1" in venue_map
    assert venue_map["R1"]["name"] == "Craft & Co Bar"
    assert venue_map["M1"]["tmdb_id"] == 999


def test_build_venue_map_empty_lists():
    """Empty input lists produce empty map."""
    vm = build_venue_map(restaurants=[], movies=[], activities=[], events=[])
    assert vm == {}


def test_resolve_plan_success(venue_map: dict):
    """All stops resolve to full venue data."""
    plan = Phase1Plan(
        date_type="entertainment",
        theme="Comedy Night",
        reasoning="Both love comedy",
        stops=[
            Stop(order=1, venue_id="A2", time="7:00 PM", duration_min=90, why="Comedy"),
            Stop(order=2, venue_id="R1", time="9:00 PM", duration_min=60, why="Drinks"),
        ],
    )
    resolved = resolve_plan(plan, venue_map)
    assert resolved.stops[0].venue["name"] == "The Improv House"
    assert resolved.stops[1].venue["name"] == "Craft & Co Bar"
    assert resolved.date_type == "entertainment"


def test_resolve_plan_missing_id(venue_map: dict):
    """Raises VenueResolverError for unknown venue ID."""
    plan = Phase1Plan(
        date_type="casual",
        theme="Test",
        reasoning="Test",
        stops=[
            Stop(order=1, venue_id="R99", time="7:00 PM", duration_min=60, why="Missing"),
        ],
    )
    with pytest.raises(VenueResolverError, match="R99"):
        resolve_plan(plan, venue_map)


def test_resolve_plan_mixed_types(venue_map: dict):
    """Plan with stops from different venue categories resolves correctly."""
    plan = Phase1Plan(
        date_type="dinner_and_movie",
        theme="Classic Date",
        reasoning="Movie then dinner",
        stops=[
            Stop(order=1, venue_id="M1", time="6:00 PM", duration_min=120, why="Movie"),
            Stop(order=2, venue_id="R2", time="8:30 PM", duration_min=90, why="Dinner"),
        ],
    )
    resolved = resolve_plan(plan, venue_map)
    assert resolved.stops[0].venue["genre"] == "Sci-Fi, Action"
    assert resolved.stops[1].venue["cuisine"] == "Italian"


def test_resolve_plan_single_stop(venue_map: dict):
    """Plan with one stop resolves correctly."""
    plan = Phase1Plan(
        date_type="casual",
        theme="Quick Bite",
        reasoning="Simple evening",
        stops=[
            Stop(order=1, venue_id="E1", time="8:00 PM", duration_min=120, why="Jazz"),
        ],
    )
    resolved = resolve_plan(plan, venue_map)
    assert len(resolved.stops) == 1
    assert resolved.stops[0].venue["eventbrite_id"] == "eb-001"

"""Tests for three-phase LLM pipeline planner."""

import json
from typing import Any
from unittest.mock import MagicMock

import pytest

from datenight.ollama_client import OllamaClient, ParseError
from datenight.planner import PlanningError, run_pipeline
from datenight.venue_resolver import build_venue_map

SAMPLE_VENUES = {
    "restaurants": [
        {"id": "R1", "name": "Craft & Co", "cuisine": "American", "rating": 4.5},
        {"id": "R2", "name": "Bistro 31", "cuisine": "Italian", "rating": 4.2},
    ],
    "movies": [{"id": "M1", "name": "Matrix 5", "genre": "Sci-Fi", "rating": 7.8}],
    "activities": [
        {"id": "A1", "name": "Top Golf", "category": "Entertainment", "rating": 4.3},
    ],
    "events": [],
}

VALID_PHASE1 = json.dumps(
    {
        "date_type": "entertainment",
        "theme": "Comedy & Cocktails",
        "reasoning": "Both enjoy comedy and craft drinks",
        "stops": [
            {"order": 1, "venue_id": "A1", "time": "7:00 PM", "duration_min": 90, "why": "Fun"},
            {"order": 2, "venue_id": "R1", "time": "9:00 PM", "duration_min": 60, "why": "Drinks"},
        ],
    }
)

VALID_PHASE2_HIGH = json.dumps(
    {
        "quality_score": 8.5,
        "issues": [{"severity": "minor", "issue": "No backup", "suggestion": "Add alt"}],
        "strengths": ["Good overlap", "Venues walkable"],
        "critical_failures": [],
    }
)

VALID_PHASE2_LOW = json.dumps(
    {
        "quality_score": 5.0,
        "issues": [{"severity": "critical", "issue": "Wrong type", "suggestion": "Change"}],
        "strengths": [],
        "critical_failures": ["Date type repeated"],
    }
)

VALID_PHASE3_APPROVED = json.dumps(
    {
        "status": "approved",
        "plan": json.loads(VALID_PHASE1),
        "changes_made": [],
    }
)

VALID_PHASE3_REVISED = json.dumps(
    {
        "status": "revised",
        "plan": {
            "date_type": "casual",
            "theme": "Chill Evening",
            "reasoning": "Revised to casual",
            "stops": [
                {
                    "order": 1,
                    "venue_id": "R2",
                    "time": "7:30 PM",
                    "duration_min": 90,
                    "why": "Relaxed",
                },
            ],
        },
        "changes_made": ["Changed type to casual", "Swapped venue"],
    }
)

PROFILE_A = {
    "name": "Alex",
    "cuisines": ["Italian"],
    "movie_genres": ["Comedy"],
    "activities": ["Bowling"],
    "dietary_restrictions": [],
    "dislikes": [],
}
PROFILE_B = {
    "name": "Jordan",
    "cuisines": ["Thai"],
    "movie_genres": ["Thriller"],
    "activities": ["Hiking"],
    "dietary_restrictions": ["Vegan"],
    "dislikes": [],
}


@pytest.fixture
def venue_map() -> dict[str, Any]:
    return build_venue_map(**SAMPLE_VENUES)


@pytest.fixture
def mock_client() -> MagicMock:
    client = MagicMock(spec=OllamaClient)
    return client


def test_full_pipeline_success(venue_map: dict, mock_client: MagicMock):
    """Three phases succeed → returns resolved plan."""
    mock_client.parse_with_retry.side_effect = [
        _parse_json(VALID_PHASE1, "Phase1Plan"),
        _parse_json(VALID_PHASE2_HIGH, "Phase2Critique"),
        _parse_json(VALID_PHASE3_APPROVED, "Phase3Decision"),
    ]
    result = run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=[],
        last_date_type=None,
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    assert result.date_type == "entertainment"
    assert len(result.stops) == 2
    assert result.stops[0].venue["name"] == "Top Golf"
    assert mock_client.parse_with_retry.call_count == 3


def test_pipeline_with_revision(venue_map: dict, mock_client: MagicMock):
    """Low score triggers Phase 3 revision."""
    mock_client.parse_with_retry.side_effect = [
        _parse_json(VALID_PHASE1, "Phase1Plan"),
        _parse_json(VALID_PHASE2_LOW, "Phase2Critique"),
        _parse_json(VALID_PHASE3_REVISED, "Phase3Decision"),
    ]
    result = run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=[],
        last_date_type=None,
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    assert result.date_type == "casual"
    assert result.stops[0].venue["name"] == "Bistro 31"


def test_reroll_on_parse_failure(venue_map: dict, mock_client: MagicMock):
    """Phase 1 parse fails → pipeline re-rolls and succeeds on second attempt."""
    mock_client.parse_with_retry.side_effect = [
        ParseError("bad json"),  # first attempt Phase 1 fails
        _parse_json(VALID_PHASE1, "Phase1Plan"),  # re-roll Phase 1
        _parse_json(VALID_PHASE2_HIGH, "Phase2Critique"),
        _parse_json(VALID_PHASE3_APPROVED, "Phase3Decision"),
    ]
    result = run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=[],
        last_date_type=None,
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    assert result.date_type == "entertainment"
    assert mock_client.parse_with_retry.call_count == 4


def test_max_retries_exceeded(venue_map: dict, mock_client: MagicMock):
    """All re-rolls fail → raises PlanningError."""
    mock_client.parse_with_retry.side_effect = ParseError("always fails")
    with pytest.raises(PlanningError, match="after 2 attempts"):
        run_pipeline(
            client=mock_client,
            profile_a=PROFILE_A,
            profile_b=PROFILE_B,
            venue_map=venue_map,
            history=[],
            last_date_type=None,
            max_retries=2,
            max_parse_retries=3,
            min_quality_score=7.0,
        )


def test_venue_id_validation(venue_map: dict, mock_client: MagicMock):
    """Plan with invalid venue ID triggers re-roll."""
    bad_plan = json.dumps(
        {
            "date_type": "casual",
            "theme": "Bad",
            "reasoning": "Test",
            "stops": [
                {
                    "order": 1,
                    "venue_id": "R99",
                    "time": "7 PM",
                    "duration_min": 60,
                    "why": "Missing",
                },
            ],
        }
    )
    mock_client.parse_with_retry.side_effect = [
        _parse_json(bad_plan, "Phase1Plan"),  # bad venue ID → re-roll
        _parse_json(VALID_PHASE1, "Phase1Plan"),  # good plan
        _parse_json(VALID_PHASE2_HIGH, "Phase2Critique"),
        _parse_json(VALID_PHASE3_APPROVED, "Phase3Decision"),
    ]
    result = run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=[],
        last_date_type=None,
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    assert result.date_type == "entertainment"


def test_constraint_passed_to_prompt(venue_map: dict, mock_client: MagicMock):
    """Last date type constraint is included in Phase 1 prompt."""
    mock_client.parse_with_retry.side_effect = [
        _parse_json(VALID_PHASE1, "Phase1Plan"),
        _parse_json(VALID_PHASE2_HIGH, "Phase2Critique"),
        _parse_json(VALID_PHASE3_APPROVED, "Phase3Decision"),
    ]
    run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=[],
        last_date_type="dinner_and_movie",
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    # Phase 1 prompt should contain the constraint
    phase1_call = mock_client.parse_with_retry.call_args_list[0]
    prompt = phase1_call[1].get("prompt", phase1_call[0][0] if phase1_call[0] else "")
    assert "dinner_and_movie" in prompt


def test_history_in_prompt(venue_map: dict, mock_client: MagicMock):
    """Date history is included in Phase 1 prompt."""
    mock_client.parse_with_retry.side_effect = [
        _parse_json(VALID_PHASE1, "Phase1Plan"),
        _parse_json(VALID_PHASE2_HIGH, "Phase2Critique"),
        _parse_json(VALID_PHASE3_APPROVED, "Phase3Decision"),
    ]
    history = [
        {
            "date_type": "casual",
            "date_planned": "2026-03-22",
            "rating": 4,
            "venue_name": "Taco Palace",
        },
    ]
    run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=history,
        last_date_type=None,
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    phase1_call = mock_client.parse_with_retry.call_args_list[0]
    prompt = phase1_call[1].get("prompt", phase1_call[0][0] if phase1_call[0] else "")
    assert "Taco Palace" in prompt


def test_phase2_in_separate_call(venue_map: dict, mock_client: MagicMock):
    """Phase 2 receives Phase 1 plan in its prompt."""
    mock_client.parse_with_retry.side_effect = [
        _parse_json(VALID_PHASE1, "Phase1Plan"),
        _parse_json(VALID_PHASE2_HIGH, "Phase2Critique"),
        _parse_json(VALID_PHASE3_APPROVED, "Phase3Decision"),
    ]
    run_pipeline(
        client=mock_client,
        profile_a=PROFILE_A,
        profile_b=PROFILE_B,
        venue_map=venue_map,
        history=[],
        last_date_type=None,
        max_retries=3,
        max_parse_retries=3,
        min_quality_score=7.0,
    )
    phase2_call = mock_client.parse_with_retry.call_args_list[1]
    prompt = phase2_call[1].get("prompt", phase2_call[0][0] if phase2_call[0] else "")
    assert "Comedy & Cocktails" in prompt


# Helper to parse JSON into Pydantic models (simulates what OllamaClient.parse_with_retry does)
def _parse_json(raw: str, model_name: str) -> Any:
    from datenight.schemas import Phase1Plan, Phase2Critique, Phase3Decision

    models = {
        "Phase1Plan": Phase1Plan,
        "Phase2Critique": Phase2Critique,
        "Phase3Decision": Phase3Decision,
    }
    return models[model_name].model_validate_json(raw)

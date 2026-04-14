"""Tests for LLM pipeline Pydantic schemas."""

import json

import pytest
from pydantic import ValidationError

from datenight.schemas import (
    Issue,
    Phase1Plan,
    Phase2Critique,
    Phase3Decision,
    Stop,
)


class TestStop:
    def test_valid_stop(self):
        stop = Stop(order=1, venue_id="R1", time="7:00 PM", duration_min=90, why="Good vibes")
        assert stop.venue_id == "R1"

    def test_valid_venue_id_prefixes(self):
        for prefix in ["R1", "M2", "A3", "E10"]:
            stop = Stop(order=1, venue_id=prefix, time="7:00 PM", duration_min=60, why="Test")
            assert stop.venue_id == prefix

    def test_invalid_venue_id_prefix(self):
        with pytest.raises(ValidationError, match="venue_id"):
            Stop(order=1, venue_id="X1", time="7:00 PM", duration_min=60, why="Bad")

    def test_invalid_venue_id_no_number(self):
        with pytest.raises(ValidationError, match="venue_id"):
            Stop(order=1, venue_id="R", time="7:00 PM", duration_min=60, why="Bad")

    def test_invalid_venue_id_format(self):
        with pytest.raises(ValidationError, match="venue_id"):
            Stop(order=1, venue_id="R-1", time="7:00 PM", duration_min=60, why="Bad")

    def test_duration_below_min(self):
        with pytest.raises(ValidationError):
            Stop(order=1, venue_id="R1", time="7:00 PM", duration_min=10, why="Too short")

    def test_duration_above_max(self):
        with pytest.raises(ValidationError):
            Stop(order=1, venue_id="R1", time="7:00 PM", duration_min=400, why="Too long")


class TestPhase1Plan:
    def test_valid_plan(self):
        plan = Phase1Plan(
            date_type="entertainment",
            theme="Comedy Night",
            reasoning="Both love comedy",
            stops=[Stop(order=1, venue_id="A1", time="7:00 PM", duration_min=90, why="Fun")],
        )
        assert plan.date_type == "entertainment"
        assert len(plan.stops) == 1

    def test_invalid_date_type(self):
        with pytest.raises(ValidationError):
            Phase1Plan(
                date_type="invalid_type",
                theme="Bad",
                reasoning="Nope",
                stops=[Stop(order=1, venue_id="R1", time="7:00 PM", duration_min=60, why="X")],
            )

    def test_empty_stops_rejected(self):
        with pytest.raises(ValidationError):
            Phase1Plan(date_type="casual", theme="X", reasoning="X", stops=[])

    def test_too_many_stops_rejected(self):
        stops = [
            Stop(order=i, venue_id=f"R{i}", time="7:00 PM", duration_min=60, why="X")
            for i in range(1, 7)
        ]
        with pytest.raises(ValidationError):
            Phase1Plan(date_type="casual", theme="X", reasoning="X", stops=stops)


class TestIssue:
    def test_valid_issue(self):
        issue = Issue(severity="minor", issue="No backup", suggestion="Add fallback")
        assert issue.severity == "minor"

    def test_invalid_severity(self):
        with pytest.raises(ValidationError):
            Issue(severity="low", issue="Bad", suggestion="Fix")


class TestPhase2Critique:
    def test_valid_critique(self):
        critique = Phase2Critique(
            quality_score=8.5,
            issues=[],
            strengths=["Good overlap"],
            critical_failures=[],
        )
        assert critique.quality_score == 8.5

    def test_score_below_zero(self):
        with pytest.raises(ValidationError):
            Phase2Critique(quality_score=-1, issues=[], strengths=[], critical_failures=[])

    def test_score_above_ten(self):
        with pytest.raises(ValidationError):
            Phase2Critique(quality_score=11, issues=[], strengths=[], critical_failures=[])


class TestPhase3Decision:
    def test_approved(self):
        plan = Phase1Plan(
            date_type="casual",
            theme="Chill",
            reasoning="Relaxed",
            stops=[Stop(order=1, venue_id="R1", time="7:00 PM", duration_min=60, why="Nice")],
        )
        decision = Phase3Decision(status="approved", plan=plan)
        assert decision.status == "approved"
        assert decision.changes_made == []

    def test_revised_with_changes(self):
        plan = Phase1Plan(
            date_type="active",
            theme="Sporty",
            reasoning="Both active",
            stops=[Stop(order=1, venue_id="A2", time="6:00 PM", duration_min=120, why="Fun")],
        )
        decision = Phase3Decision(status="revised", plan=plan, changes_made=["Swapped venue"])
        assert decision.status == "revised"
        assert len(decision.changes_made) == 1

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            Phase3Decision(
                status="rejected",
                plan=Phase1Plan(
                    date_type="casual",
                    theme="X",
                    reasoning="X",
                    stops=[Stop(order=1, venue_id="R1", time="7 PM", duration_min=60, why="X")],
                ),
            )


class TestJsonRoundTrip:
    def test_phase1_from_json(self):
        raw = json.dumps(
            {
                "date_type": "entertainment",
                "theme": "Comedy & Cocktails",
                "reasoning": "Both enjoy comedy",
                "stops": [
                    {
                        "order": 1,
                        "venue_id": "A3",
                        "time": "7:00 PM",
                        "duration_min": 90,
                        "why": "Comedy",
                    },
                    {
                        "order": 2,
                        "venue_id": "R1",
                        "time": "9:00 PM",
                        "duration_min": 60,
                        "why": "Drinks",
                    },
                ],
            }
        )
        plan = Phase1Plan.model_validate_json(raw)
        assert plan.date_type == "entertainment"
        assert len(plan.stops) == 2
        assert plan.stops[0].venue_id == "A3"

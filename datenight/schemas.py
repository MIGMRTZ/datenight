"""Pydantic models for the three-phase LLM pipeline output validation.

These schemas enforce structure on LLM-generated JSON. Each phase of the
pipeline (Generate, Critique, Approve/Revise) has its own output model.
"""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

VENUE_ID_PATTERN = re.compile(r"^[RMAE]\d+$")

DATE_TYPES = Literal[
    "dinner_and_movie",
    "adventure",
    "entertainment",
    "casual",
    "active",
    "cultural",
    "food_crawl",
]


class Stop(BaseModel):
    """A single stop in a date plan."""

    order: int
    venue_id: str
    time: str
    duration_min: int = Field(ge=15, le=300)
    why: str

    @field_validator("venue_id")
    @classmethod
    def validate_venue_id(cls, v: str) -> str:
        if not VENUE_ID_PATTERN.match(v):
            raise ValueError(
                f"Invalid venue_id format: {v!r}. Expected R#, M#, A#, or E# (e.g., R1, M3)."
            )
        return v


class Phase1Plan(BaseModel):
    """Phase 1 output: a complete date plan with venue IDs."""

    date_type: DATE_TYPES
    theme: str
    reasoning: str
    stops: list[Stop] = Field(min_length=1, max_length=5)


class Issue(BaseModel):
    """A single issue identified by the Phase 2 critic."""

    severity: Literal["critical", "major", "minor"]
    issue: str
    suggestion: str


class Phase2Critique(BaseModel):
    """Phase 2 output: adversarial quality review of a date plan."""

    quality_score: float = Field(ge=0, le=10)
    issues: list[Issue]
    strengths: list[str]
    critical_failures: list[str]


class Phase3Decision(BaseModel):
    """Phase 3 output: final approval or revision of the plan."""

    status: Literal["approved", "revised"]
    plan: Phase1Plan
    changes_made: list[str] = []

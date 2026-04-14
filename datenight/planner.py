"""Three-phase adversarial LLM pipeline for date planning.

Phase 1: Generate — produces a complete date plan from profiles + venues + history
Phase 2: Critique — adversarially reviews the plan and scores it
Phase 3: Approve/Revise — approves or fixes the plan based on the critique
"""

from typing import Any

from datenight.logging import get_logger
from datenight.ollama_client import OllamaClient, ParseError
from datenight.schemas import Phase1Plan, Phase2Critique, Phase3Decision
from datenight.venue_resolver import ResolvedPlan, VenueMap, resolve_plan

logger = get_logger("planner")

PHASE1_SYSTEM = (
    "You are a date night planner. Create a cohesive, fun evening plan that "
    "satisfies both partners. Choose venues ONLY by their ID from the provided "
    "lists. Respond with ONLY a valid JSON object. No markdown, no backticks, "
    "no explanation before or after the JSON."
)

PHASE2_SYSTEM = (
    "You are a quality evaluator for date night plans. Be critical. Your job "
    "is to find flaws, missed preferences, and weak reasoning. Respond with "
    "ONLY a valid JSON object. No markdown, no backticks, no explanation."
)

PHASE3_SYSTEM = (
    "You are a final reviewer. Decide if the plan is ready to present to the "
    "couple, or apply the critique's suggestions and output a revised plan. "
    "If revising, use only venue IDs from the original provided list. Respond "
    "with ONLY a valid JSON object. No markdown, no backticks, no explanation."
)


class PlanningError(Exception):
    """Raised when the pipeline fails after all retry attempts."""


def _format_profile(profile: dict[str, Any]) -> str:
    lines = [f"Name: {profile['name']}"]
    for key in ["cuisines", "movie_genres", "activities", "dietary_restrictions", "dislikes"]:
        values = profile.get(key, [])
        if values:
            label = key.replace("_", " ").title()
            lines.append(f"{label}: {', '.join(values)}")
    return "\n".join(lines)


def _format_venues(venue_map: VenueMap) -> str:
    sections: list[str] = []
    categories = {"R": "Restaurants", "M": "Movies", "A": "Activities", "E": "Events"}
    grouped: dict[str, list[str]] = {k: [] for k in categories}

    for vid, venue in sorted(venue_map.items()):
        prefix = vid[0]
        name = venue.get("name", "Unknown")
        details: list[str] = []
        for field in ["cuisine", "category", "genre", "rating", "price"]:
            if field in venue:
                details.append(str(venue[field]))
        detail_str = f" — {', '.join(details)}" if details else ""
        grouped.setdefault(prefix, []).append(f"[{vid}] {name}{detail_str}")

    for prefix, label in categories.items():
        items = grouped.get(prefix, [])
        if items:
            sections.append(f"{label}:\n" + "\n".join(f"  {item}" for item in items))
    return "\n\n".join(sections)


def _format_history(history: list[dict[str, Any]]) -> str:
    if not history:
        return ""
    lines = ["Past dates:"]
    for date in history:
        rating = date.get("rating")
        venue = date.get("venue_name", "Unknown")
        dtype = date.get("date_type", "unknown")
        planned = date.get("date_planned", "")
        if rating and rating <= 2:
            lines.append(
                f"- {dtype} at {venue} on {planned}: rated {rating}/5 — AVOID similar plans"
            )
        elif rating:
            lines.append(f"- {dtype} at {venue} on {planned}: rated {rating}/5")
        else:
            lines.append(f"- {dtype} at {venue} on {planned} (not yet rated)")
    return "\n".join(lines)


def _build_phase1_prompt(
    profile_a: dict[str, Any],
    profile_b: dict[str, Any],
    venues_text: str,
    history_text: str,
    constraint: str | None,
) -> str:
    parts = [
        "Partner A:\n" + _format_profile(profile_a),
        "\nPartner B:\n" + _format_profile(profile_b),
        "\nAvailable venues:\n" + venues_text,
    ]
    if history_text:
        parts.append("\n" + history_text)
    if constraint:
        parts.append(f"\nConstraint: Do NOT plan a {constraint} type date. Vary the experience.")
    return "\n".join(parts)


def _build_phase2_prompt(plan_json: str, venues_text: str, constraint: str | None) -> str:
    parts = [f"Generated plan:\n{plan_json}", f"\nAvailable venues:\n{venues_text}"]
    if constraint:
        parts.append(f"\nConstraint: date type should NOT be {constraint}")
    parts.append(
        "\nEvaluate: Does it respect both profiles? Is the type varied? "
        "Are venue IDs valid? Is timing realistic?"
    )
    return "\n".join(parts)


def _build_phase3_prompt(plan_json: str, critique_json: str) -> str:
    return (
        f"Generated plan:\n{plan_json}\n\n"
        f"Critique:\n{critique_json}\n\n"
        "If quality_score >= 7 and no critical failures, approve as-is. "
        "Otherwise, apply fixes and output a revised plan."
    )


def _validate_venue_ids(plan: Phase1Plan, venue_map: VenueMap) -> list[str]:
    """Return list of venue IDs in the plan that are not in the venue map."""
    return [stop.venue_id for stop in plan.stops if stop.venue_id not in venue_map]


def run_pipeline(
    client: OllamaClient,
    profile_a: dict[str, Any],
    profile_b: dict[str, Any],
    venue_map: VenueMap,
    history: list[dict[str, Any]],
    last_date_type: str | None,
    max_retries: int,
    max_parse_retries: int,
    min_quality_score: float,
    phase1_temp: float = 0.8,
    phase2_temp: float = 0.3,
    phase3_temp: float = 0.2,
) -> ResolvedPlan:
    """Run the three-phase LLM pipeline with re-roll on failure."""
    venues_text = _format_venues(venue_map)
    history_text = _format_history(history)

    for attempt in range(max_retries):
        try:
            logger.info("pipeline_attempt", attempt=attempt + 1, max=max_retries)

            # Phase 1: Generate
            phase1_prompt = _build_phase1_prompt(
                profile_a, profile_b, venues_text, history_text, last_date_type
            )
            plan = client.parse_with_retry(
                prompt=phase1_prompt,
                system=PHASE1_SYSTEM,
                temperature=phase1_temp,
                schema=Phase1Plan,
                max_retries=max_parse_retries,
            )

            # Validate venue IDs exist
            invalid_ids = _validate_venue_ids(plan, venue_map)
            if invalid_ids:
                logger.warning("invalid_venue_ids", ids=invalid_ids)
                raise ParseError(f"Invalid venue IDs: {invalid_ids}")

            # Phase 2: Critique
            plan_json = plan.model_dump_json()
            phase2_prompt = _build_phase2_prompt(plan_json, venues_text, last_date_type)
            critique = client.parse_with_retry(
                prompt=phase2_prompt,
                system=PHASE2_SYSTEM,
                temperature=phase2_temp,
                schema=Phase2Critique,
                max_retries=max_parse_retries,
            )
            logger.info("phase2_complete", score=critique.quality_score)

            # Phase 3: Approve or Revise
            critique_json = critique.model_dump_json()
            phase3_prompt = _build_phase3_prompt(plan_json, critique_json)
            decision = client.parse_with_retry(
                prompt=phase3_prompt,
                system=PHASE3_SYSTEM,
                temperature=phase3_temp,
                schema=Phase3Decision,
                max_retries=max_parse_retries,
            )
            logger.info("phase3_complete", status=decision.status)

            final_plan = decision.plan
            return resolve_plan(final_plan, venue_map)

        except ParseError as e:
            logger.warning("pipeline_reroll", attempt=attempt + 1, error=str(e)[:100])
            continue

    raise PlanningError(f"Pipeline failed after {max_retries} attempts")

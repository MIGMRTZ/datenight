# Sprint 4: Three-Phase Adversarial LLM Pipeline

**Goal:** Implement the core planning engine — Ollama integration, all three LLM phases (Generate, Critique, Approve/Revise), Pydantic validation schemas, JSON retry logic, and venue resolver. By the end, the system can generate a validated date plan from venue data.

---

## 1. Deliverables

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 4.1 | Pydantic validation schemas (`schemas.py`) | `Stop`, `Phase1Plan`, `Issue`, `Phase2Critique`, `Phase3Decision` models with all validators |
| 4.2 | Ollama client integration | Connect to Ollama via `ollama-python`, configurable model/host/temperature/timeout |
| 4.3 | JSON cleanup & parse-retry loop | Strip markdown fences, extract JSON, retry up to 3x per phase with error feedback |
| 4.4 | Phase 1: Generate (`planner.py`) | Full plan creation from profiles + venues + history |
| 4.5 | Phase 2: Critique (`planner.py`) | Adversarial review of Phase 1 output, scoring 0-10 |
| 4.6 | Phase 3: Approve/Revise (`planner.py`) | Final decision — approve or revise based on critique |
| 4.7 | Venue resolver (`venue_resolver.py`) | Map venue IDs (R1, M2, etc.) back to full venue records |
| 4.8 | Pipeline orchestration | Three phases in sequence, full re-roll on catastrophic failure (up to 3x) |
| 4.9 | Unit tests for schemas | Valid/invalid LLM output, venue ID format validation |
| 4.10 | Unit tests for venue resolver | ID mapping, unknown ID errors, missing data |
| 4.11 | Integration tests for planner | Mock Ollama returning canned JSON; test retry loop with invalid-then-valid responses |

---

## 2. Technical Details

### 2.1 Pydantic Validation Schemas

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal

class Stop(BaseModel):
    order: int
    venue_id: str                # e.g., "R1", "M2", "A3"
    time: str                    # e.g., "7:00 PM"
    duration_min: int = Field(ge=15, le=300)
    why: str

    @field_validator("venue_id")
    @classmethod
    def validate_venue_id(cls, v):
        """Basic format check. Full existence check happens in venue_resolver."""
        if not v or not v[0] in ("R", "M", "A", "E"):
            raise ValueError(f"Invalid venue ID format: {v}. Expected R#, M#, A#, or E#.")
        return v

class Phase1Plan(BaseModel):
    date_type: Literal[
        "dinner_and_movie", "adventure", "entertainment",
        "casual", "active", "cultural", "food_crawl"
    ]
    theme: str
    reasoning: str
    stops: list[Stop] = Field(min_length=1, max_length=5)

class Issue(BaseModel):
    severity: Literal["critical", "major", "minor"]
    issue: str
    suggestion: str

class Phase2Critique(BaseModel):
    quality_score: float = Field(ge=0, le=10)
    issues: list[Issue]
    strengths: list[str]
    critical_failures: list[str]

class Phase3Decision(BaseModel):
    status: Literal["approved", "revised"]
    plan: Phase1Plan
    changes_made: list[str] = []
```

### 2.2 Date Types Enum

| Date Type | Description | Example |
|---|---|---|
| dinner_and_movie | Restaurant + film screening | Italian dinner then a thriller |
| adventure | Physical/outdoor activity | Hiking + picnic |
| entertainment | Shows, concerts, comedy | Comedy club + drinks |
| casual | Low-key, relaxed outing | Coffee shop + bookstore |
| active | Sports or physical fun | Bowling + pizza |
| cultural | Museums, galleries, theater | Art exhibit + wine bar |
| food_crawl | Multi-stop food experience | Taco crawl through downtown |

### 2.3 Model Selection

| Model | Size | Best For |
|---|---|---|
| llama3.1:8b | ~4.7 GB | Best balance of quality and speed |
| mistral:7b | ~4.1 GB | Fast, good at structured output |
| llama3.1:70b | ~40 GB | Highest quality (needs beefy hardware) |

Configurable via `config.yaml` → `ollama.model`.

### 2.4 JSON Validation & Retry Strategy

Small local models (7B-8B) are not reliably consistent at producing valid JSON. The system uses a strict parse-validate-retry loop:

1. **Pydantic schema enforcement:** Every LLM output validated against the appropriate Pydantic model. Invalid JSON or schema mismatch → rejected immediately.
2. **Venue ID validation:** Phase 1 validator checks every `venue_id` exists in the provided venue data. `R7` when only `R1`-`R5` provided → caught immediately.
3. **Error feedback retry:** On parse failure, send new prompt: "Your previous output was invalid JSON. The error was: [error]. Please fix and respond with valid JSON only."
4. **Max retries per phase:** 3 parse-retry attempts before full pipeline re-roll from Phase 1.
5. **JSON-only system prompt:** Every phase ends with: "Respond with ONLY a valid JSON object. No markdown, no backticks, no explanation before or after the JSON."
6. **Post-processing cleanup:** Before parsing, strip: leading/trailing whitespace, markdown code fences (` ```json...``` `), any text before first `{` or after last `}`.

### 2.5 Phase 1: Generate (Full Plan Creation)

**Input to the model:**

- **System prompt:** You are a date night planner. Create a cohesive, fun evening plan that satisfies both partners. Choose venues ONLY by their ID from the provided lists. Respond with ONLY a valid JSON object.
- **Partner A profile:** Cuisines, genres, activities, restrictions, dislikes
- **Partner B profile:** Same structure
- **Available options (with IDs):** Movies (`M1`-`Mn`), restaurants (`R1`-`Rn`), activities (`A1`-`An`), events (`E1`-`En`)
- **Date history with ratings:** Last 10 dates with types and ratings. Poorly rated dates (1-2 stars) include: "The couple rated their [type] date on [date] a [rating]/5. Avoid similar plans." Unrated dates carry no weight.
- **Constraint:** "Do NOT plan a [last date type] type date. Vary the experience."
- **Output format:** JSON matching Phase1Plan schema

**Temperature:** `ollama.temperature` (default 0.8)

### 2.6 Phase 2: Critique (Adversarial Quality Review)

Separate Ollama API call (inherently stateless — no memory of Phase 1 call).

**Input to the model:**

- **System prompt:** You are a quality evaluator for date night plans. Be critical. Your job is to find flaws, missed preferences, and weak reasoning. Respond with ONLY a valid JSON object.
- **Original parameters:** Both partner profiles, no-repeat constraint, available venues with IDs
- **Generated plan:** Validated Phase 1 JSON output
- **Evaluation criteria:** Respects both profiles? Type varied? Venue IDs valid? Timing realistic? Low-rated experiences avoided? Cohesive?

**Temperature:** `ollama.phase2_temperature` (default 0.3 — lower for precision)

**Output:** Phase2Critique schema — quality score (0-10), issues list, strengths, critical failures.

### 2.7 Phase 3: Approve or Revise (Final Decision)

Separate Ollama API call.

**Input to the model:**

- **System prompt:** You are a final reviewer. Decide if the plan is ready or apply the critique's suggestions and output a revised plan. If revising, use only venue IDs from the original provided list. Respond with ONLY a valid JSON object.
- **Generated plan:** Phase 1 output
- **Critique:** Phase 2 output
- **Decision criteria:** Score >= 7 and no critical issues → approve as-is. Score < 7 or critical issues → apply fixes and output revised plan.

**Temperature:** `ollama.phase3_temperature` (default 0.2 — lowest for consistency)

**Output:** Phase3Decision — either `{"status": "approved", "plan": <original>}` or `{"status": "revised", "plan": <fixed>, "changes_made": [...]}`.

**Context window note:** Phase 3 receives Phase 1 (~800 tokens) + Phase 2 (~400 tokens) + system prompt (~200 tokens) = ~1,400 input tokens. Fits 8K context easily.

### 2.8 Pipeline Summary

| Phase | Role | Context | What It Does |
|---|---|---|---|
| Phase 1: Generate | Creator | Full context (profiles + ID-tagged venues + history with ratings) | Produces complete date plan using venue IDs |
| Phase 2: Critique | Adversarial reviewer | Separate call (params + Phase 1 output) | Scores the plan, finds flaws |
| Phase 3: Approve | Final arbiter | Separate call (Phase 1 + Phase 2 output) | Approves or revises the plan |
| Post-pipeline | Python code | Venue data from Worker | Resolves IDs → full venue data → deep links |

Each phase is a separate Ollama API call — no shared state between calls. Since inference is local, the system can re-roll up to 3 times without cost concerns.

### 2.9 Expected Phase 1 Output

```json
{
  "date_type": "entertainment",
  "theme": "Comedy & Craft Cocktails",
  "reasoning": "Both enjoy comedy. Partner A loves cocktails, Partner B prefers craft venues. Last date was dinner_and_movie so switching to entertainment.",
  "stops": [
    {
      "order": 1,
      "venue_id": "A3",
      "time": "7:00 PM",
      "duration_min": 90,
      "why": "Both rated comedy high in activities"
    },
    {
      "order": 2,
      "venue_id": "R1",
      "time": "9:00 PM",
      "duration_min": 60,
      "why": "Cocktail menu, walkable from comedy club"
    }
  ]
}
```

**Note:** No `deep_link`, no `venue` name, no `type` field on stops. LLM outputs only venue IDs and timing. Everything else resolved post-pipeline.

### 2.10 Phase 2 Critique Output Example

```json
{
  "quality_score": 8.5,
  "issues": [
    {
      "severity": "minor",
      "issue": "No backup plan if comedy show is sold out",
      "suggestion": "Add a fallback venue"
    }
  ],
  "strengths": [
    "Good preference overlap",
    "Venues are walkable",
    "Date type varied from last time"
  ],
  "critical_failures": []
}
```

### 2.11 Venue Resolver

`venue_resolver.py` maps venue IDs back to full venue records:

- Input: Phase 3 approved plan (with venue IDs) + original venue data from Worker
- Output: Enriched plan with full venue details (name, address, slug, coordinates, etc.)
- Error cases: Unknown ID → raise error (should have been caught by Pydantic, but defense in depth)

### 2.12 Ollama Failure Handling

| Scenario | Behavior |
|---|---|
| Ollama not running | CLI detects on startup: "Ollama is not running. Start it with `ollama serve` and try again." |
| Model not pulled | "Model llama3.1:8b not found. Pull it with `ollama pull llama3.1:8b`." |
| Inference timeout | 120-second timeout per phase. On timeout: retry once, then abort. |
| Malformed JSON output | Parse-retry loop: up to 3 retries per phase with error feedback. |
| Invalid venue ID | Pydantic catches it; retry with: "Venue ID X not found in provided options." |

---

## 3. Test Fixtures

Create fixture files for testing:

- `tests/fixtures/sample_venues.json` — Canned venue data with assigned IDs
- `tests/fixtures/sample_plan.json` — Valid Phase 1 output
- `tests/fixtures/sample_critique.json` — Valid Phase 2 output

These are also used by dry-run mode (Sprint 6).

---

## 4. Definition of Done

- [ ] All Pydantic schemas validate correct input and reject invalid input
- [ ] Venue ID format validator catches invalid formats
- [ ] Ollama client connects and sends prompts with correct temperature settings
- [ ] JSON cleanup strips markdown fences and extracts JSON correctly
- [ ] Phase 1 produces validated plan from profiles + venues + history
- [ ] Phase 2 produces critique with score and issues
- [ ] Phase 3 approves or revises based on critique
- [ ] Parse-retry loop recovers from invalid JSON (tested with mock returning bad then good JSON)
- [ ] Full pipeline re-roll triggers after 3 consecutive phase failures
- [ ] Venue resolver maps all IDs to full venue records
- [ ] Venue resolver raises error for unknown IDs
- [ ] All unit tests pass (schemas, venue resolver)
- [ ] Integration tests pass (mock Ollama pipeline)

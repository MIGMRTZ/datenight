# Current State

> Last updated: 2026-03-31

## Active Plan

**Plan:** plan-2026-03-sprint2-profiles-couples
**Status:** Complete
**Current Sprint:** Sprint 2 — Profiles, Couples & API Client

## Current Focus

Sprint 2 complete — all 6 tasks done. Ready for review/merge.

## Task Status

### Sprint 2 — Profiles, Couples & API Client

| Task | Title | Priority | Complexity | Status | Depends On |
|------|-------|----------|------------|--------|------------|
| T2.1 | Profile Worker Routes | P0 | 40 | ✓ done | — |
| T2.2 | Couple Worker Routes | P0 | 35 | ✓ done | T2.1 |
| T2.3 | Python API Client | P0 | 35 | ✓ done | — |
| T2.4 | CLI Profile Commands | P0 | 45 | ✓ done | T2.3 |
| T2.5 | CLI Couple Commands | P0 | 30 | ✓ done | T2.3, T2.4 |
| T2.6 | Integration Tests | P1 | 25 | ✓ done | all |

### Execution Order

**Phase 1 (parallel):** T2.1, T2.3
**Phase 2 (parallel):** T2.2 (after T2.1), T2.4 (after T2.3)
**Phase 3:** T2.5 (after T2.2 + T2.4)
**Phase 4:** T2.6 (after all)

### Previous Sprints

Sprint 1 — Foundation & Infrastructure: **9/9 tasks done** (merged via PR #1)

## What Was Just Done

- **T2.6 done** (auto-updated by hook)

### Session: 2026-03-31 - T2.6 Integration Tests + Sprint 2 Complete

- Created `tests/test_integration.py` — full flow E2E test with respx
- **Sprint 2 complete: 6/6 tasks done, 55 Python tests, 90% coverage**

- **T2.5 done** (auto-updated by hook)

### Session: 2026-03-31 - T2.5 CLI Couple Commands

- Created `datenight/commands/couple.py` — create/show/unlink
- Created `tests/test_couple_commands.py` — 6 tests
- Registered via `app.add_typer(couple_app)` in cli.py
- 54/54 tests, 90% coverage

- **T2.4 done** (auto-updated by hook)

### Session: 2026-03-31 - T2.4 CLI Profile Commands

- Created `datenight/commands/profile.py` — 5 commands (create/list/show/edit/delete)
- Created `tests/test_profile_commands.py` — 8 tests
- Registered via `app.add_typer(profile_app)` in cli.py
- 48/48 tests, 92% coverage

- **T2.3 done** (auto-updated by hook)

### Session: 2026-03-31 - T2.3 Python API Client

- Created `datenight/api_client.py` — DateNightClient with 9 CRUD methods + error hierarchy
- Created `tests/test_api_client.py` — 16 tests with respx mocks
- 40/40 total Python tests, 91% coverage, ruff/mypy clean

- **T2.2 done** (auto-updated by hook)

### Session: 2026-03-31 - T2.2 Couple Worker Routes

- Created `worker/src/routes/couples.ts` — 4 CRUD endpoints with JOIN query
- Created `worker/test/couples.test.ts` — 9 tests
- Mounted on `/api/couples` in index.ts

- **T2.1 done** (auto-updated by hook)

### Session: 2026-03-31 - T2.1 Profile Worker Routes

- Created `worker/src/routes/profiles.ts` — 5 CRUD endpoints with validation
- Created `worker/test/profiles.test.ts` — 12 tests
- Created `worker/test/helpers.ts` — shared migration + auth fetch helpers
- Mounted on `/api/profiles` in index.ts

### Session: 2026-03-31 - Sprint 2 Planning

- Created Sprint 2 plan (plan-2026-03-sprint2-profiles-couples)
- Defined 6 tasks covering Worker routes, API client, CLI commands, and integration tests
- Branch: `feature/sprint2-profiles-couples`

## What's Next

1. Push branch, create PR, run /simplify + /reviewing-code
2. Merge, then begin Sprint 3 planning

## Blockers

- Node.js not installed locally — Worker tests only run in CI

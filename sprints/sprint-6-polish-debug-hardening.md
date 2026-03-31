# Sprint 6: Polish, Debug Tools, Dry-Run & Hardening

**Goal:** Add the `datenight init` wizard with Ollama warmup, `datenight debug` command, `datenight config` commands, dry-run mode, comprehensive error handling, end-to-end testing, and final polish. By the end, the MVP is shippable.

---

## 1. Deliverables

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 6.1 | `datenight init` wizard | Validates Worker URL, pings Ollama (with warmup), tests D1 connectivity, confirms location |
| 6.2 | Ollama warmup | Small test prompt to preload model into memory; progress indicator during warmup |
| 6.3 | `datenight debug <date-id>` | Human-readable summary of plan phases: inputs, outputs, validation, timing |
| 6.4 | `datenight debug --last` | Debug the most recent plan |
| 6.5 | `datenight config show` | Display current configuration |
| 6.6 | `datenight config set <key> <value>` | Update a config value |
| 6.7 | Dry-run mode (`--dry-run`) | Full pipeline with canned venue data, no Worker call |
| 6.8 | Mock LLM mode (`--dry-run --mock-llm`) | Fully offline — canned venues + canned LLM responses |
| 6.9 | `--verbose` flag | Show all three phases, JSON validation, venue ID mapping, and timing |
| 6.10 | Comprehensive error handling | All Ollama, Worker, D1, and external API failure scenarios handled gracefully |
| 6.11 | End-to-end testing | Full pipeline test with dry-run mode; verify complete flow from plan to .ics |
| 6.12 | Logging completeness | Every plan attempt logs: phases, validation, retries, Worker times, cache hits, final result |
| 6.13 | Final polish | README, setup docs, `.gitignore` (logs/, .env), clean up rough edges |

---

## 2. Technical Details

### 2.1 `datenight init` Wizard

First-time setup command that validates the entire stack:

1. **Worker connectivity:** Ping `GET /health` at configured `worker_url`
   - Success: "Worker reachable at [url]"
   - Failure: "Can't reach Worker at [url]. Check your config and deployment."

2. **Auth validation:** Test auth token against Worker
   - Success: "Authentication OK"
   - Failure: "Auth failed. Check DATENIGHT_AUTH_TOKEN."

3. **D1 connectivity:** Call a simple D1 endpoint (e.g., `GET /api/profiles`)
   - Success: "Database connected"
   - Failure: "Database error. Run migrations: `wrangler d1 migrations apply datenight`"

4. **Ollama check:** Verify Ollama is running at configured host
   - Not running: "Ollama is not running. Start it with `ollama serve`"
   - Running: Check if model is pulled

5. **Model check:** Verify configured model is available
   - Not pulled: "Model llama3.1:8b not found. Pull it with `ollama pull llama3.1:8b`"
   - Available: Proceed to warmup

6. **Ollama warmup:** Send small test prompt to load model into memory
   - Show progress: "Warming up Ollama (llama3.1:8b)... this may take a moment on first run."
   - This prevents 10-30 second cold-start delay on first `datenight plan`

7. **Location confirmation:** Display configured location (zip, city, state), ask to confirm or update

### 2.2 Debug Command

`datenight debug <date-id>` shows a human-readable summary of what happened during a plan:

- What the LLM received at each phase (truncated)
- What it produced
- What the critic flagged
- Validation results (pass/fail, retries)
- Timing for each phase
- Venue ID resolution results (which IDs → which venues)
- Worker response times and cache hit/miss status

Pulls from both D1 (stored `full_plan` JSON) and local logs (`logs/datenight.log`).

`datenight debug --last` is a shortcut for the most recent plan.

**Purpose:** Bridge between real-time `--verbose` (watching it happen) and raw log files (grep-able). Structured narrative readable without JSON parsing.

### 2.3 Dry-Run Mode

`datenight plan --dry-run` runs the full pipeline end-to-end using:

- **Canned venue data** from `tests/fixtures/sample_venues.json` (no Worker call)
- **Canned profiles and history** (no D1 call)
- **Live Ollama inference** (tests real LLM behavior with realistic data)

`datenight plan --dry-run --mock-llm` adds:

- **Canned LLM responses** from `tests/fixtures/sample_plan.json` and `sample_critique.json`
- **Fully offline** — no external services needed at all

### 2.4 Verbose Mode

`datenight plan --verbose` shows all three LLM phases in real-time:

- Phase 1: Input summary, raw output, validation result, timing
- Phase 2: Critique score, issues found, timing
- Phase 3: Decision (approved/revised), changes made, timing
- Venue ID mapping: which IDs resolved to which venues
- Deep link generation results
- Any retries with error messages

### 2.5 Comprehensive Error Handling

#### Ollama Failures

| Scenario | Behavior |
|---|---|
| Ollama not running | "Ollama is not running. Start it with `ollama serve` and try again." |
| Model not pulled | "Model llama3.1:8b not found. Pull it with `ollama pull llama3.1:8b`." |
| Cold-start delay | `datenight init` warmup. First `datenight plan` shows spinner: "Loading model into memory..." |
| Inference timeout | 120-second timeout per phase. Retry once, then abort with message. |
| Malformed JSON | Parse-retry loop: up to 3 retries per phase with error feedback. |
| Invalid venue ID | Pydantic catches it; retry with: "Venue ID X not found in provided options." |

#### Cloudflare Worker / D1 Failures

| Scenario | Behavior |
|---|---|
| Worker unreachable | "Can't reach the Cloudflare Worker at [url]. Check your internet connection and Worker deployment." |
| Auth token invalid | "Authentication failed. Check your DATENIGHT_AUTH_TOKEN environment variable." |
| D1 query error | "Database error: [message]. Try again or run `datenight init` to verify setup." |

#### External API Failures

| Scenario | Behavior |
|---|---|
| Yelp API down | Return cached results if available; if not, partial results with `warnings` |
| TMDb API down | "Movie data unavailable — you can still plan a non-movie date." |
| Eventbrite denied/down | Seamless fallback to Yelp activity search (no warning) |
| Sparse results (< 3) | Auto-expand radius. CLI: "Expanded search to 25 miles to find more options." |
| Zero results after expansion | "No [type] found within 40 miles. Try updating your location in config." Plan proceeds with available venue types. |

**Goal:** User always sees a clear, actionable message — never a stack trace.

### 2.6 Logging Completeness

Every plan attempt logs (via structlog to `logs/datenight.log`):

- Timestamp, couple ID, requested date
- Phase 1/2/3 inputs (truncated), outputs, validation results, and timing
- Venue ID resolution results (which IDs mapped to which venues)
- Any retries with error messages
- Worker response times and cache hit/miss status
- Final plan or failure reason

### 2.7 Test Fixtures (confirm/create)

```
tests/fixtures/
├── sample_venues.json     # Canned venue data for dry-run mode
├── sample_plan.json       # Canned Phase 1 output
└── sample_critique.json   # Canned Phase 2 output
```

### 2.8 CLI Command Summary (Full MVP)

| Command | Description |
|---|---|
| `datenight init` | First-time setup wizard |
| `datenight profile create` | Create partner profile |
| `datenight profile list` | List profiles |
| `datenight profile show <n>` | Show profile details |
| `datenight profile edit <n>` | Edit profile |
| `datenight profile delete <n>` | Delete profile |
| `datenight couple create` | Link two profiles |
| `datenight couple show` | Show couple |
| `datenight couple unlink` | Unlink couple |
| `datenight plan` | Plan a date (interactive) |
| `datenight plan --date YYYY-MM-DD` | Plan for specific date |
| `datenight plan --verbose` | Show pipeline details |
| `datenight plan --dry-run` | Use canned data |
| `datenight plan --dry-run --mock-llm` | Fully offline |
| `datenight history` | Show past dates |
| `datenight history --last N` | Show last N dates |
| `datenight rate <id> <1-5>` | Rate a past date |
| `datenight calendar <id>` | Export .ics for a date |
| `datenight debug <id>` | Debug a plan attempt |
| `datenight debug --last` | Debug most recent plan |
| `datenight config show` | Show config |
| `datenight config set <key> <value>` | Update config |

---

## 3. End-to-End Test Plan

1. **Dry-run + mock-llm:** Fully offline pipeline test
   - Verify canned data loads correctly
   - Verify all three phases produce expected output
   - Verify venue resolution works
   - Verify deep links are generated
   - Verify .ics file is created
   - Verify plan display format

2. **Dry-run + live Ollama:** Test real LLM with canned venue data
   - Verify LLM produces valid JSON
   - Verify retry loop works if LLM produces invalid JSON
   - Verify venue IDs from LLM exist in canned data

3. **Error scenario tests:**
   - Ollama not running → clear message
   - Worker unreachable → clear message
   - Auth failure → clear message
   - All venue categories empty → graceful handling

---

## 4. Definition of Done

- [ ] `datenight init` validates Worker, D1, Ollama, model, and location
- [ ] Ollama warmup preloads model with progress indicator
- [ ] `datenight debug <id>` shows structured plan narrative
- [ ] `datenight debug --last` works
- [ ] `datenight config show` displays all config
- [ ] `datenight config set` updates values
- [ ] `--dry-run` uses canned venue data with live Ollama
- [ ] `--dry-run --mock-llm` is fully offline
- [ ] `--verbose` shows all pipeline details in real-time
- [ ] All error scenarios produce clear, actionable messages (no stack traces)
- [ ] Every plan attempt is fully logged (phases, retries, timing, results)
- [ ] End-to-end test passes in dry-run + mock-llm mode
- [ ] README documents setup, prerequisites, and first run
- [ ] `.gitignore` excludes logs/, .env, config.yaml (but not config.example.yaml)
- [ ] `pytest` full suite passes
- [ ] MVP is shippable

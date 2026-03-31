# DATE NIGHT AUTOPILOT

**MVP Technical Specification & Architecture**
*CLI-Based Intelligent Date Planning System*

Python · Cloudflare D1 · Cloudflare Workers · Ollama · Typer

Version 0.5.0 — MVP | March 2026

---

## 1. Project Overview

Date Night Autopilot is a CLI tool that eliminates decision fatigue for couples planning date nights. Each partner maintains a separate preference profile, and the system uses a local LLM (via Ollama) with a three-phase adversarial review pipeline to intelligently plan cohesive, non-repeating dates by finding the overlap between both partners' interests.

The system discovers movies, restaurants, and activities near you, generates deep links for booking, and produces .ics calendar files — all from the terminal. The infrastructure runs on Cloudflare's edge platform: D1 for the database, Workers for API proxying and caching, and Workers KV for response caching.

### 1.1 Core Problem

Date planning creates friction in relationships. One partner often ends up making all the decisions, which can feel controlling, or both partners default to "I don't know, what do you want to do?" The system solves this by collecting preferences from each partner independently, then using AI to find the sweet spot where both are happy — without either partner having to compromise out loud.

### 1.2 MVP Scope

| In Scope (MVP) | Out of Scope (V1+) |
|---|---|
| Separate partner profiles with preferences | Budget tiers (casual / moderate / splurge) |
| Couples table linking exactly two partners (one couple per partner) | Multi-couple / group support |
| Three-phase adversarial LLM pipeline with JSON validation | Web/mobile UI |
| Venue ID anchoring (LLM references venues by ID, not name) | Programmatic reservation booking |
| Deterministic deep link generation in Python (not by the LLM) | Real-time availability checking |
| Movie discovery + Fandango deep links (titles, not exact showtimes) | Exact showtime data (requires paid API) |
| Restaurant discovery + OpenTable/Resy deep links | Push notifications / reminders |
| Activity discovery (bowling, concerts, etc.) | Partner matching / dating app features |
| Date history tracking in Cloudflare D1 | Location auto-detection / GPS |
| Past date ratings fed back into LLM planning prompts | ML-based feedback loop |
| Rating nudge prompt on unrated past dates | N/A |
| .ics calendar file generation (with unconfirmed-time disclaimers) | Google Calendar API integration |
| No-repeat logic (vary date type) | N/A |
| Sparse-results detection with auto-radius expansion | N/A |
| Error handling + graceful degradation for all dependencies | N/A |
| LLM cold-start warmup in init flow | N/A |
| Structured logging + `datenight debug` command | N/A |
| Test suite: unit, integration, and dry-run mode | N/A |
| Schema migration strategy for D1 | N/A |
| Hardcoded location (zip/city in config) | N/A |

---

## 2. Architecture

### 2.1 Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Language | Python 3.11+ | Core application logic |
| CLI Framework | Typer + Rich | Terminal UI with colors and tables |
| Database | Cloudflare D1 | Profiles, couples, date history, preferences |
| DB Access | Cloudflare Workers (REST API to D1) | CLI queries D1 via Worker endpoints |
| LLM | Ollama (llama3.1 or mistral) | Three-phase date plan generation |
| LLM Client | ollama-python | Python client for Ollama API |
| JSON Validation | Pydantic v2 | Schema enforcement on LLM outputs |
| Deep Links | deeplinks.py (deterministic) | URL construction from venue data (never LLM-generated) |
| Edge Platform | Cloudflare Workers | API proxy, caching, rate limiting, D1 access |
| DNS / CDN | Cloudflare | Domain management, SSL, edge caching |
| KV Store | Cloudflare Workers KV | Cache external API responses (showtimes, venues) |
| HTTP Client | httpx | CLI-to-Worker communication |
| Calendar | icalendar | Generate .ics files |
| Config | pydantic-settings | App configuration and validation |
| Logging | structlog | Structured JSON logging for debug and plan auditing |
| Testing | pytest + respx (mock HTTP) | Unit, integration, and dry-run testing |

### 2.2 Cloudflare Integration

Cloudflare is the entire backend infrastructure for this project. There is no local database to install or manage — everything lives on Cloudflare's edge.

#### 2.2.1 Cloudflare D1 (Database)

D1 is Cloudflare's serverless SQLite database that runs at the edge. It replaces a traditional PostgreSQL setup entirely, which means zero database installation, zero server management, and the database is accessible from anywhere.

- **Schema management:** D1 supports standard SQL migrations. Schema files live in the repo under `migrations/` and are applied via `wrangler d1 migrations apply`. See §3.6 for the migration strategy.
- **Access pattern:** The CLI never talks to D1 directly. Instead, the Cloudflare Worker exposes REST endpoints (e.g., `GET /api/profiles`, `POST /api/history`) that query D1 internally. This keeps the D1 binding secure and server-side.
- **JSON storage:** D1 supports SQLite's `json()` function for storing structured preference data (cuisines, genres, activities). Complex queries use `json_extract()` for filtering.
- **Free tier:** D1's free tier includes 5 million rows read and 100,000 rows written per day — far more than a couple will ever need.

#### 2.2.2 Cloudflare Workers (API Gateway + D1 Access)

A single Cloudflare Worker serves as the entire backend. It handles two responsibilities: proxying external API calls (Yelp, TMDb, Eventbrite) and providing a REST interface to the D1 database.

- **D1 endpoints:** `GET/POST/PUT/DELETE /api/profiles`, `GET/POST /api/couples`, `GET/POST /api/history`, `GET /api/history/latest-type` — these are thin wrappers around D1 SQL queries.
- **External API proxy:** `/api/movies`, `/api/restaurants`, `/api/activities`, `/api/events` — these fan out to third-party APIs with caching.
- **Venue ID assignment:** All venue discovery endpoints assign short IDs to each result (e.g., `R1`, `R2` for restaurants, `M1`, `M2` for movies, `A1`, `A2` for activities). These IDs are stable within a single planning session and are what the LLM references in its output. See §6.3 for details.
- **Sparse-results detection:** If a venue search returns fewer than 3 results, the Worker automatically retries with an expanded radius (10mi → 25mi → 40mi) before returning to the CLI.
- **API key security:** Third-party API keys (Yelp, TMDb, Eventbrite) are stored as Worker secrets via `wrangler secret put`, never in the CLI config or source code.
- **Rate limiting:** The Worker enforces per-endpoint rate limits to stay within free tiers (e.g., Yelp's 5000/day).
- **Authentication:** The CLI authenticates with the Worker using a Bearer token read from the `DATENIGHT_AUTH_TOKEN` environment variable (not stored in config.yaml). The Worker validates this against its `AUTH_TOKEN` secret.

#### 2.2.3 Cloudflare Workers KV (Cache Layer)

Workers KV caches external API responses to reduce third-party API usage:

| Cache Key Pattern | TTL | Content |
|---|---|---|
| `movies:{zip}:{date}` | 1 hour | Now-playing movies for a zip + date |
| `restaurants:{zip}:{cuisine}:{radius}` | 24 hours | Restaurant search results |
| `activities:{zip}:{category}` | 24 hours | Activity/venue search results |
| `events:{zip}:{date_range}` | 6 hours | Eventbrite event listings |

#### 2.2.4 Architecture Diagram

```
CLI (Python/Typer)                        Ollama (local LLM)
    │                                          ▲
    │  httpx                                   │ ollama-python
    │                                          │
    ▼                                          │
Cloudflare Worker ◄────────────────────────────┘
    │         (API Gateway + D1 Access)
    │
    ├── /api/profiles ──────► Cloudflare D1 (SQLite edge DB)
    ├── /api/couples  ──────► Cloudflare D1
    ├── /api/history  ──────► Cloudflare D1
    │
    ├── /api/movies ────────► TMDb API  ◄──── Workers KV (cache)
    ├── /api/restaurants ───► Yelp API  ◄──── Workers KV (cache)
    ├── /api/activities ────► Yelp API  ◄──── Workers KV (cache)
    └── /api/events ────────► Eventbrite ◄──── Workers KV (cache)
```

### 2.3 Data Flow: Venue IDs and Deep Link Generation

This is a critical architectural decision. The LLM never generates URLs. Here's the full data flow:

```
1. Worker fetches venues from Yelp/TMDb/Eventbrite
2. Worker assigns short IDs: R1, R2, M1, M2, A1, A2...
3. Worker returns venue list with IDs to CLI
4. CLI passes venue list (with IDs) to Ollama
5. LLM picks venues by ID: "R2", "M1", "A3"
6. CLI receives LLM output, validates venue IDs exist
7. deeplinks.py looks up each ID in the original venue data
8. deeplinks.py constructs URLs deterministically using venue metadata
9. Final plan is assembled with real, working deep links
```

This eliminates hallucinated URLs entirely. If the LLM outputs a venue ID that doesn't exist in the provided data, Pydantic validation catches it immediately and triggers a retry.

### 2.4 High-Level Flow

1. **Profile Setup:** Each partner runs a one-time setup command. The CLI sends profile data to the Worker, which stores it in D1.
2. **Couple Linking:** After both profiles exist, `datenight couple create` links exactly two profiles. Each partner can only belong to one couple.
3. **Plan Request:** Either partner runs the plan command, specifying the date (e.g., "this Saturday" — see §5.3 for date resolution rules).
4. **Rating Nudge:** If the last date hasn't been rated yet, the CLI prompts: "You haven't rated your last date yet. Rate it now? (1-5 or skip)"
5. **Data Gathering:** CLI calls the Cloudflare Worker's `/api/plan-data` endpoint, which returns both profiles, last 10 dates (with ratings), and venue data with assigned IDs in a single response. If venue results are sparse, the Worker auto-expands the search radius.
6. **Phase 1 — Generate:** Ollama receives both profiles, ID-tagged venue options, date history with ratings, and generates a plan referencing venues by ID. Output is validated against a Pydantic schema; invalid venue IDs or malformed JSON trigger a retry with error feedback.
7. **Phase 2 — Critique:** The same model in a separate Ollama API call (inherently stateless) adversarially reviews the plan against the original parameters and scores it.
8. **Phase 3 — Approve/Revise:** The model in a separate Ollama API call evaluates the critique, decides if the plan is ready, and either approves or triggers a revision.
9. **Deep Link Assembly:** After Phase 3 approval, `deeplinks.py` maps venue IDs back to the original venue data and constructs all URLs deterministically.
10. **No-Repeat Filter:** System verifies the proposed date type differs from the last date.
11. **Output:** Plan is displayed in the terminal with real deep links and an .ics file is generated.
12. **Confirmation:** Partners approve or request a re-roll, then the date is saved to D1 via the Worker.

### 2.5 Project Structure

```
date-night-autopilot/
├── datenight/
│   ├── __init__.py
│   ├── cli.py              # Typer commands
│   ├── config.py           # Pydantic settings (reads env vars)
│   ├── api_client.py       # HTTP client for CF Worker
│   ├── planner.py          # Three-phase LLM orchestration
│   ├── schemas.py          # Pydantic models for LLM output validation
│   ├── venue_resolver.py   # Maps venue IDs back to full venue data
│   ├── deeplinks.py        # Deterministic URL construction from venue data
│   ├── calendar_gen.py     # .ics file generation
│   └── logging.py          # structlog configuration
├── worker/
│   ├── src/
│   │   ├── index.ts        # Cloudflare Worker entry + router
│   │   ├── routes/
│   │   │   ├── profiles.ts # D1 CRUD for partner profiles
│   │   │   ├── couples.ts  # D1 CRUD for couple linking
│   │   │   ├── history.ts  # D1 CRUD for date history
│   │   │   ├── plan_data.ts # Aggregated planning data endpoint
│   │   │   ├── movies.ts   # TMDb proxy + KV cache + ID assignment
│   │   │   ├── restaurants.ts # Yelp proxy + KV cache + ID assignment
│   │   │   ├── activities.ts  # Yelp proxy + KV cache + ID assignment
│   │   │   └── events.ts   # Eventbrite proxy + KV cache + ID assignment
│   │   ├── middleware/
│   │   │   ├── auth.ts     # Bearer token validation
│   │   │   └── sparse.ts   # Auto-radius expansion for thin results
│   │   └── db/
│   │       └── schema.sql  # D1 table definitions
│   ├── migrations/         # D1 SQL migrations
│   │   └── 0001_initial.sql
│   ├── wrangler.toml       # Worker + D1 + KV config
│   └── package.json
├── logs/                   # Structured JSON logs (gitignored)
├── tests/
│   ├── unit/
│   │   ├── test_schemas.py     # Pydantic validation tests
│   │   ├── test_deeplinks.py   # URL construction tests
│   │   ├── test_venue_resolver.py
│   │   └── test_calendar.py
│   ├── integration/
│   │   ├── test_planner.py     # LLM pipeline with mock Ollama
│   │   ├── test_api_client.py  # Worker communication with mock HTTP
│   │   └── conftest.py         # Shared fixtures, mock Worker responses
│   ├── fixtures/
│   │   ├── sample_venues.json  # Canned venue data for dry-run mode
│   │   ├── sample_plan.json    # Canned Phase 1 output
│   │   └── sample_critique.json
│   └── conftest.py
├── config.yaml             # Location, Ollama settings, Worker URL
├── pyproject.toml
└── README.md
```

---

## 3. Database Schema (Cloudflare D1)

All tables live in a single D1 database. The schema is defined in `worker/src/db/schema.sql` and applied via D1 migrations.

### 3.1 Partners Table

```sql
CREATE TABLE partners (
    id          TEXT PRIMARY KEY,   -- UUID generated client-side
    name        TEXT NOT NULL,
    cuisines    TEXT NOT NULL,       -- JSON array, ranked
    movie_genres TEXT NOT NULL,      -- JSON array, ranked
    activities  TEXT NOT NULL,       -- JSON array, ranked
    dietary_restrictions TEXT,       -- JSON array
    dislikes    TEXT,                -- JSON array
    created_at  TEXT NOT NULL,       -- ISO 8601 timestamp
    updated_at  TEXT NOT NULL        -- ISO 8601 timestamp
);
```

### 3.2 Couples Table

```sql
CREATE TABLE couples (
    id          TEXT PRIMARY KEY,
    partner_a   TEXT NOT NULL REFERENCES partners(id) UNIQUE,
    partner_b   TEXT NOT NULL REFERENCES partners(id) UNIQUE,
    created_at  TEXT NOT NULL
);
```

The `UNIQUE` constraint on both `partner_a` and `partner_b` individually ensures each partner can only belong to one couple. Attempting to create a second couple with an already-linked partner will fail at the database level.

The `datenight plan` command resolves which couple to plan for (MVP assumes exactly one couple exists; if zero, it prompts to create one; if more than one, it lists them and asks which to use).

### 3.3 Date History Table

```sql
CREATE TABLE date_history (
    id              TEXT PRIMARY KEY,
    couple_id       TEXT NOT NULL REFERENCES couples(id),
    date_planned    TEXT NOT NULL,       -- YYYY-MM-DD
    date_type       TEXT NOT NULL,
    venue_name      TEXT,
    venue_type      TEXT,
    restaurant_name TEXT,
    movie_title     TEXT,
    activity_name   TEXT,
    full_plan       TEXT NOT NULL,       -- JSON of complete LLM plan
    llm_quality_score REAL,             -- Phase 2 adversarial score (0-10)
    rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes           TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_history_couple ON date_history(couple_id);
CREATE INDEX idx_history_date ON date_history(date_planned);
CREATE INDEX idx_history_type ON date_history(date_type);
```

### 3.4 Date Types Enum

The system categorizes dates into types to enforce the no-repeat rule. The last date's type is excluded from the next planning cycle:

| Date Type | Description | Example |
|---|---|---|
| dinner_and_movie | Restaurant + film screening | Italian dinner then a thriller |
| adventure | Physical/outdoor activity | Hiking + picnic |
| entertainment | Shows, concerts, comedy | Comedy club + drinks |
| casual | Low-key, relaxed outing | Coffee shop + bookstore |
| active | Sports or physical fun | Bowling + pizza |
| cultural | Museums, galleries, theater | Art exhibit + wine bar |
| food_crawl | Multi-stop food experience | Taco crawl through downtown |

### 3.5 D1 Migration (0001_initial.sql)

```sql
-- migrations/0001_initial.sql
CREATE TABLE IF NOT EXISTS partners (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    cuisines             TEXT NOT NULL DEFAULT '[]',
    movie_genres         TEXT NOT NULL DEFAULT '[]',
    activities           TEXT NOT NULL DEFAULT '[]',
    dietary_restrictions TEXT DEFAULT '[]',
    dislikes             TEXT DEFAULT '[]',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS couples (
    id          TEXT PRIMARY KEY,
    partner_a   TEXT NOT NULL REFERENCES partners(id) UNIQUE,
    partner_b   TEXT NOT NULL REFERENCES partners(id) UNIQUE,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS date_history (
    id                TEXT PRIMARY KEY,
    couple_id         TEXT NOT NULL REFERENCES couples(id),
    date_planned      TEXT NOT NULL,
    date_type         TEXT NOT NULL,
    venue_name        TEXT,
    venue_type        TEXT,
    restaurant_name   TEXT,
    movie_title       TEXT,
    activity_name     TEXT,
    full_plan         TEXT NOT NULL DEFAULT '{}',
    llm_quality_score REAL,
    rating            INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes             TEXT,
    created_at        TEXT NOT NULL
);

CREATE INDEX idx_history_couple ON date_history(couple_id);
CREATE INDEX idx_history_date ON date_history(date_planned);
CREATE INDEX idx_history_type ON date_history(date_type);
```

### 3.6 Migration Strategy

D1 supports sequential SQL migration files applied via `wrangler d1 migrations apply`. Future schema changes follow this process:

1. **Create a new migration file:** `migrations/0002_add_budget_tier.sql` (example)
2. **Write forward-only SQL:** Use `ALTER TABLE` for additive changes (new columns, new indexes). SQLite and D1 support `ALTER TABLE ... ADD COLUMN` but NOT `DROP COLUMN` or `ALTER COLUMN`. For destructive changes, create a new table, copy data, drop the old table, and rename.
3. **Test locally:** `wrangler d1 migrations apply datenight --local` runs migrations against a local D1 instance.
4. **Apply to production:** `wrangler d1 migrations apply datenight` applies to the remote D1 database.
5. **Version tracking:** D1 tracks which migrations have been applied. Running `migrations apply` only executes new, unapplied files.

**Key D1 limitations to plan around:**
- No `DROP COLUMN` — adding columns is easy, removing them requires table recreation
- No `ALTER COLUMN` — changing types requires table recreation
- Foreign key enforcement must be enabled per-connection via `PRAGMA foreign_keys = ON` (the Worker should run this on each request)
- JSON columns are stored as TEXT — there's no native JSON column type, but `json_extract()` works on TEXT columns

---

## 4. Worker API Endpoints

The Cloudflare Worker exposes these REST endpoints. The CLI communicates exclusively through these. All endpoints require a valid `Authorization: Bearer <token>` header.

### 4.1 Profile Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST /api/profiles` | Create a new partner profile |
| `GET /api/profiles` | List all partner profiles |
| `GET /api/profiles/:id` | Get a specific partner profile |
| `PUT /api/profiles/:id` | Update a partner profile |
| `DELETE /api/profiles/:id` | Delete a partner profile (fails if in a couple) |

### 4.2 Couple Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST /api/couples` | Link two partner profiles as a couple (fails if either is already linked) |
| `GET /api/couples` | List all couples |
| `GET /api/couples/:id` | Get a specific couple with both profiles |
| `DELETE /api/couples/:id` | Unlink a couple (profiles are preserved) |

### 4.3 History Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST /api/history` | Save a confirmed date to history |
| `GET /api/history?couple_id={id}&limit={n}` | List past dates for a couple |
| `GET /api/history/latest-type?couple_id={id}` | Get the most recent date's type (for no-repeat) |
| `GET /api/history/unrated?couple_id={id}` | Get the most recent unrated date (for rating nudge) |
| `PUT /api/history/:id/rate` | Add a post-date rating and optional notes |
| `GET /api/history/:id` | Get a specific date record |

### 4.4 Venue Discovery Endpoints (Cached via KV)

| Method | Endpoint | Description |
|---|---|---|
| `GET /api/movies?zip={zip}&date={date}` | Now-playing movies near zip. Each result has an ID: `M1`, `M2`, etc. |
| `GET /api/restaurants?zip={zip}&cuisine={cuisine}&radius={mi}` | Restaurants by cuisine and radius. IDs: `R1`, `R2`, etc. |
| `GET /api/activities?zip={zip}&category={cat}` | Activities by category. IDs: `A1`, `A2`, etc. |
| `GET /api/events?zip={zip}&date_from={date}&date_to={date}` | Events in date range. IDs: `E1`, `E2`, etc. |

All venue endpoints include sparse-results detection: if fewer than 3 results are returned, the Worker automatically retries with an expanded radius (10mi → 25mi → 40mi) and includes a `radius_expanded: true` flag in the response.

**Venue response shape (example for restaurants):**

```json
{
  "venues": [
    {
      "id": "R1",
      "name": "Craft & Co Bar",
      "address": "123 Main St, Waxahachie, TX",
      "cuisine": "American",
      "rating": 4.5,
      "price": "$$",
      "yelp_slug": "craft-and-co-bar-waxahachie",
      "lat": 32.3866,
      "lng": -96.8483
    },
    {
      "id": "R2",
      "name": "Bistro 31",
      "address": "456 Oak Ave, Waxahachie, TX",
      "cuisine": "Italian",
      "rating": 4.2,
      "price": "$$$",
      "yelp_slug": "bistro-31-waxahachie",
      "lat": 32.3901,
      "lng": -96.8512
    }
  ],
  "radius_miles": 10,
  "radius_expanded": false
}
```

### 4.5 Aggregated Planning Endpoint

| Method | Endpoint | Description |
|---|---|---|
| `GET /api/plan-data?couple_id={id}&date={date}` | Returns all data the LLM needs in one call: both profiles, last 10 dates with ratings, unrated date (for nudge), and all venue categories with assigned IDs. |

---

## 5. CLI Commands

All commands are accessed via the `datenight` CLI entry point.

### 5.1 Profile Management

| Command | Description |
|---|---|
| `datenight profile create` | Interactive wizard to create a new partner profile |
| `datenight profile list` | Show all registered partner profiles |
| `datenight profile edit <n>` | Update an existing partner's preferences |
| `datenight profile show <n>` | Display a partner's full preference profile |
| `datenight profile delete <n>` | Remove a partner profile (must unlink couple first) |

### 5.2 Couple Management

| Command | Description |
|---|---|
| `datenight couple create` | Interactive prompt to link two profiles as a couple |
| `datenight couple show` | Display the current couple and both profiles |
| `datenight couple unlink` | Remove the couple link (profiles are preserved) |

### 5.3 Date Planning

| Command | Description |
|---|---|
| `datenight plan` | Launch interactive planning for the next upcoming date night |
| `datenight plan --date 2026-04-15` | Plan for a specific date |
| `datenight plan --verbose` | Show all three LLM phases, JSON validation, venue ID mapping, and timing |
| `datenight plan --dry-run` | Run the full pipeline with canned venue data and mock LLM responses (for testing) |

**Date resolution rules for `datenight plan` (no `--date` flag):**

The default planning target is "the next Saturday." The exact rules:

- If today is Saturday and it's before 4:00 PM local time: plan for **today**
- If today is Saturday and it's 4:00 PM or later: plan for **next Saturday**
- Any other day of the week: plan for the **upcoming Saturday**

The 4 PM cutoff gives couples enough time to actually act on the plan for a same-day date. The cutoff time is configurable in `config.yaml` via `planning.same_day_cutoff: "16:00"`.

**Interactive flow:** Planning is always interactive. After a plan is generated, the user sees the plan and is prompted with `[C]onfirm [R]eroll [Q]uit`. Confirming saves to D1 and generates the .ics file. Rerolling runs the full three-phase pipeline again.

**Rating nudge:** Before planning begins, if the most recent past date hasn't been rated, the CLI prompts: "You haven't rated your last date (Comedy & Craft Cocktails on Mar 22). Quick rating? (1-5 or Enter to skip)." This keeps the rating data flowing without being annoying — it's a single keypress to skip.

### 5.4 History & Calendar

| Command | Description |
|---|---|
| `datenight history` | Show all past dates in a table |
| `datenight history --last 5` | Show last N dates |
| `datenight rate <date-id> <1-5>` | Rate a past date (optionally add notes with `--notes "..."`) |
| `datenight calendar <date-id>` | Export a date plan as .ics file |

### 5.5 Debugging

| Command | Description |
|---|---|
| `datenight debug <date-id>` | Show a human-readable summary of what happened during a plan: what the LLM received at each phase, what it produced, what the critic flagged, validation results, and timing. Pulls from both D1 (stored plan) and local logs. |
| `datenight debug --last` | Debug the most recent plan |

The debug command is the bridge between the real-time `--verbose` flag (for watching a plan happen) and the raw log files (for grepping). It presents a structured narrative of a specific plan attempt that's readable without any JSON parsing.

### 5.6 Configuration & Setup

| Command | Description |
|---|---|
| `datenight config show` | Display current configuration |
| `datenight config set <key> <value>` | Update a config value |
| `datenight init` | First-time setup wizard: validates Worker URL, pings Ollama (with warmup), tests D1 connectivity, confirms location |

The `datenight init` command includes an Ollama warmup step. It sends a small test prompt to load the model into memory, so the first real `datenight plan` call doesn't hit a 10-30 second cold-start delay. The CLI shows a progress indicator during warmup: "Warming up Ollama (llama3.1:8b)... this may take a moment on first run."

---

## 6. Three-Phase Adversarial LLM Pipeline

The system uses Ollama for local, free LLM inference. Instead of trusting a single generation pass, the planner runs three iterative phases through the same model, each as a separate Ollama API call (which is inherently stateless — each call has no memory of previous calls). Each successive phase does less work than the last, creating an efficient quality funnel. Since inference is entirely local, there are no cost or rate-limit concerns.

### 6.1 Model Selection

| Model | Size | Best For |
|---|---|---|
| llama3.1:8b | ~4.7 GB | Best balance of quality and speed |
| mistral:7b | ~4.1 GB | Fast, good at structured output |
| llama3.1:70b | ~40 GB | Highest quality (needs beefy hardware) |

### 6.2 JSON Validation & Retry Strategy

Small local models (7B-8B parameters) are not reliably consistent at producing valid JSON, especially with complex nested schemas. To handle this, the system uses a strict parse-validate-retry loop:

1. **Pydantic schema enforcement:** Every LLM output is validated against a Pydantic model (see §6.9). If the output isn't valid JSON or doesn't match the schema, it's rejected immediately.
2. **Venue ID validation:** For Phase 1, the validator checks that every `venue_id` in the plan exists in the venue data that was provided to the LLM. A reference to `R7` when only `R1`-`R5` were provided is caught immediately.
3. **Error feedback retry:** On parse failure, the system sends a new prompt to Ollama with the invalid output and the specific validation error: "Your previous output was invalid JSON. The error was: [error]. Please fix and respond with valid JSON only."
4. **Max retries per phase:** Each phase gets up to 3 parse-retry attempts before the entire pipeline re-rolls from Phase 1.
5. **JSON-only system prompt:** Every phase's system prompt ends with: "Respond with ONLY a valid JSON object. No markdown, no backticks, no explanation before or after the JSON."
6. **Post-processing cleanup:** Before parsing, the system strips common LLM artifacts: leading/trailing whitespace, markdown code fences (```json...```), and any text before the first `{` or after the last `}`.

### 6.3 Venue ID System

The LLM never generates URLs, venue names from memory, or any data not in its prompt. Instead:

1. The Cloudflare Worker assigns short IDs to every venue: `R1`, `R2` for restaurants, `M1`, `M2` for movies, `A1`, `A2` for activities, `E1`, `E2` for events.
2. The LLM prompt includes the full venue list with IDs:
   ```
   Available restaurants:
   [R1] Craft & Co Bar — American, $$, 4.5★, 123 Main St
   [R2] Bistro 31 — Italian, $$$, 4.2★, 456 Oak Ave
   ...
   ```
3. The LLM's Phase 1 output references venues by ID only:
   ```json
   { "venue_id": "R1", "time": "9:00 PM", "duration_min": 60, "why": "..." }
   ```
4. After the LLM pipeline completes, `venue_resolver.py` maps each venue ID back to the full venue record from the Worker response.
5. `deeplinks.py` then constructs all URLs deterministically using the venue metadata (Yelp slug, name, address, location, etc.).

This means the LLM's only job is to *choose* — not to fabricate data. Any venue ID not in the original dataset is caught by Pydantic validation. Any URL is built by Python code that is trivially testable.

### 6.4 Phase 1: Generate (Full Plan Creation)

The first phase receives the full context and produces a complete date plan.

**Input to the model:**

- **System prompt:** You are a date night planner. Create a cohesive, fun evening plan that satisfies both partners. Choose venues ONLY by their ID from the provided lists. Respond with ONLY a valid JSON object.
- **Partner A profile:** Cuisines, genres, activities, restrictions, dislikes
- **Partner B profile:** Same structure; the system presents both so the model finds overlap
- **Available options (with IDs):** Now-playing movies (`M1`-`Mn`), nearby restaurants (`R1`-`Rn`), activities (`A1`-`An`), events (`E1`-`En`). All from the Cloudflare Worker with real, verified data.
- **Date history with ratings:** Last 10 dates with types and ratings. Rated dates include the score. Unrated dates are presented neutrally: "Date on [date]: [type] at [venue] (not yet rated)." If a past date was rated poorly (1-2 stars), the prompt includes: "The couple rated their [date_type] date on [date] a [rating]/5. Avoid similar plans." Unrated dates carry no positive or negative weight.
- **Constraint:** Do NOT plan a [last date type] type date. Vary the experience.
- **Output format:** Structured JSON matching the Phase1Plan schema (see §6.9)

**Output:** A full JSON date plan with venue IDs. Validated against Pydantic schema before proceeding.

### 6.5 Phase 2: Critique (Adversarial Quality Review)

The second phase is an adversarial review. A separate Ollama API call (inherently fresh context). It receives the original parameters and the generated plan, and its job is to find problems.

**Input to the model:**

- **System prompt:** You are a quality evaluator for date night plans. Be critical. Your job is to find flaws, missed preferences, and weak reasoning. Respond with ONLY a valid JSON object.
- **Original parameters:** Both partner profiles, the no-repeat constraint, available venues with IDs
- **Generated plan:** The validated JSON output from Phase 1
- **Evaluation criteria:** Does the plan respect both profiles? Is the date type varied? Are all venue IDs valid (from the provided options)? Is the timing realistic? Are low-rated past experiences avoided? Is it actually cohesive?

**Output:** A structured critique with a quality score (0–10), list of issues, and suggested fixes. Validated against Pydantic schema.

### 6.6 Phase 3: Approve or Revise (Final Decision)

The third phase makes the final call. Again, a separate Ollama API call. It receives the plan and the critique and decides: ship it or fix it.

**Input to the model:**

- **System prompt:** You are a final reviewer. This plan has been through two stages. Decide if it is ready to present to the couple, or apply the critique's suggestions and output a revised plan. If revising, use only venue IDs from the original provided list. Respond with ONLY a valid JSON object.
- **Generated plan:** Phase 1 output
- **Critique:** Phase 2 output
- **Decision criteria:** If score >= 7 and no critical issues, approve as-is. If score < 7 or critical issues exist, apply fixes and output revised plan.

**Output:** Either `{"status": "approved", "plan": <original>}` or `{"status": "revised", "plan": <fixed>, "changes_made": [...]}`. Validated against Pydantic schema.

**Context window note:** Phase 3 receives both Phase 1 and Phase 2 outputs. For an 8B model with a typical 8K context window, this fits comfortably: Phase 1 plan (~800 tokens) + Phase 2 critique (~400 tokens) + system prompt (~200 tokens) = ~1,400 input tokens, well within limits. If using a model with a smaller context window, Phase 2's critique can be truncated to just the score, critical failures, and top 3 issues.

### 6.7 Pipeline Summary

| Phase | Role | Context | What It Does |
|---|---|---|---|
| Phase 1: Generate | Creator | Full context (profiles + ID-tagged venues + history with ratings) | Produces the complete date plan using venue IDs |
| Phase 2: Critique | Adversarial reviewer | Separate API call (params + Phase 1 output) | Scores the plan, finds flaws |
| Phase 3: Approve | Final arbiter | Separate API call (Phase 1 + Phase 2 output) | Approves or revises the plan |
| Post-pipeline | Python code | Venue data from Worker | Resolves IDs → full venue data → deep links |

Each phase is a separate Ollama API call, which means there is no shared state between calls — this is how Ollama works by default, not a custom mechanism. Since the model is running locally, the system can re-roll the entire pipeline up to 3 times without any concern about usage limits.

### 6.8 Expected LLM Output (Phase 1)

```json
{
  "date_type": "entertainment",
  "theme": "Comedy & Craft Cocktails",
  "reasoning": "Both enjoy comedy. Partner A loves cocktails, Partner B prefers craft venues. Last date was dinner_and_movie so switching to entertainment. Previous comedy night was rated 4/5 so this is a safe category.",
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

Note: no `deep_link`, no `venue` name, no `type` field on stops. The LLM outputs only venue IDs and timing. All other fields are resolved after the pipeline by `venue_resolver.py` and `deeplinks.py`. This keeps the LLM's output small, structured, and verifiable.

### 6.9 Pydantic Validation Schemas

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

### 6.10 Phase 2 Critique Output Example

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

---

## 7. External Data Sources

The MVP needs real venue data. All external API calls route through the Cloudflare Worker for caching, key management, and venue ID assignment.

### 7.1 Movie Discovery

**Important MVP scope clarification:** The MVP provides movie *discovery* (what's playing now, with metadata like genre, rating, poster, synopsis) but NOT exact showtimes. Exact showtime data requires either a paid API (Gracenote/TMS) or fragile scraping (SerpAPI). Rather than pretending to have data we don't, the system presents available movies and links to Fandango where the user can check actual times.

| Option | Approach | Deep Link |
|---|---|---|
| TMDb API (free) | Get now-playing titles + metadata | Fandango search link |
| SerpAPI (Google showtimes) | Search "movie showtimes near [zip]" — paid, fragile | Fandango / theater URL |
| Gracenote / TMS API | Official showtime data — requires application | Theater-specific URL |

**MVP recommendation:** TMDb for movie metadata (free API key). Construct Fandango deep links using movie title + zip code. The LLM prompt explicitly states: "Movie times are estimates. The user will confirm actual showtimes via the Fandango link."

**V1 upgrade path:** Apply for Gracenote/TMS API access. If approved, swap the TMDb scraper for real showtime data and set `time_confirmed: true` on movie stops.

### 7.2 Restaurants

| Option | Approach | Deep Link |
|---|---|---|
| Yelp Fusion API (free tier) | Search by cuisine, location, radius | Yelp page / OpenTable link |
| Google Places API | Nearby search with type=restaurant | Google Maps link |
| OpenTable Affiliate | No public API, construct search URLs | OpenTable search URL |
| Resy | No public API, construct search URLs | Resy venue page URL |

**MVP recommendation:** Yelp Fusion API (free: 5000 calls/day) for restaurant discovery. Construct deep links for both OpenTable and Resy using restaurant name + city. Resy is particularly strong for trendy and upscale restaurants that may not be on OpenTable, so including both gives better coverage.

### 7.3 Activities

| Option | Approach | Deep Link |
|---|---|---|
| Yelp Fusion API | Search category: active, arts, nightlife | Yelp page |
| Google Places API | Nearby search with type filters | Google Maps link |
| Eventbrite API | Local events by date and category | Eventbrite event page |

**MVP recommendation:** Yelp Fusion for static activities (bowling, museums, etc.) and Eventbrite for time-specific events (concerts, shows). Both have free tiers. Note: Eventbrite's API requires approval for production use and may be unreliable to obtain. Fallback plan: if Eventbrite access is denied, use Yelp's event search or skip time-specific events for MVP and rely on static venue discovery only. All calls cached via Cloudflare Workers KV.

---

## 8. Deep Link Generation

Deep links are constructed deterministically in Python by `deeplinks.py`, never by the LLM. The module receives resolved venue data (after venue ID mapping) and applies the following URL patterns:

| Service | URL Pattern | Source Data |
|---|---|---|
| Fandango | `fandango.com/search?q={title}&date={date}&location={zip}` | TMDb movie title + config zip |
| OpenTable | `opentable.com/s?term={name}&covers=2&dateTime={iso}` | Yelp venue name + planned date |
| Resy | `resy.com/cities/{city}?query={name}` | Yelp venue name + config city |
| Google Maps | `google.com/maps/search/{name+address}` | Yelp venue name + address |
| Yelp | `yelp.com/biz/{slug}` | Yelp slug from venue data |
| Eventbrite | `eventbrite.com/e/{event_id}` | Eventbrite event ID from venue data |

For restaurants, the system generates both an OpenTable and Resy link, letting the couple choose their preferred platform. Deep links are opened via Python's `webbrowser` module or printed to the terminal for the user to click.

**Testing:** `deeplinks.py` is a pure function: venue data in, URLs out. It has 100% unit test coverage with known inputs and expected outputs (see `tests/unit/test_deeplinks.py`).

---

## 9. Calendar Integration (.ics)

When a plan is confirmed, the system generates a standard .ics file that can be imported into Google Calendar, Apple Calendar, Outlook, or any calendar app.

Each stop in the date plan becomes a separate calendar event with:

- Event title (e.g., "Date Night: Comedy at The Improv House")
- Start time and duration
- Location / address
- Description with deep links and notes
- Reminder alarm (30 minutes before first event)

**Unconfirmed time handling:** Since movie showtimes and venue availability are not confirmed in the MVP, all calendar events include a disclaimer in the description: "⚠️ This time is an estimate. Please confirm the actual time using the booking link below before heading out." This prevents the user from treating an LLM-estimated time as a real reservation.

The .ics file is saved to a configurable output directory and the path is printed in the terminal.

---

## 10. No-Repeat Logic

The system enforces variety by preventing the same date type from occurring back-to-back:

1. CLI calls `GET /api/history/latest-type?couple_id={id}` on the Worker, which queries D1 for the most recent date's type
2. The type (e.g., "dinner_and_movie") is passed as a constraint to the LLM in Phase 1: "Do NOT plan a dinner_and_movie date"
3. Phase 2 (Critique) independently validates that the type was actually varied
4. If Phase 3 detects a violation, it automatically revises the plan
5. If all three phases fail, the system re-rolls from Phase 1 (up to 3 attempts)

This means couples can still do dinner-and-movie dates — just not twice in a row. The three-phase pipeline makes constraint violations extremely unlikely since the adversarial critic explicitly checks for it.

---

## 11. Error Handling & Degradation

The system handles failures gracefully at every dependency boundary. The goal: the user always sees a clear, actionable message — never a stack trace.

### 11.1 Ollama Failures

| Scenario | Behavior |
|---|---|
| Ollama not running | CLI detects on startup, prints: "Ollama is not running. Start it with `ollama serve` and try again." |
| Model not pulled | CLI detects on first plan call, prints: "Model llama3.1:8b not found. Pull it with `ollama pull llama3.1:8b`." |
| Cold-start delay | `datenight init` includes a warmup step. First `datenight plan` shows a spinner: "Loading model into memory..." |
| Inference timeout | 120-second timeout per phase. On timeout: retry once, then abort with message. |
| Malformed JSON output | Parse-retry loop (see §6.2): up to 3 retries per phase with error feedback. |
| Invalid venue ID in output | Pydantic validation catches it; retry with error: "Venue ID X not found in provided options." |

### 11.2 Cloudflare Worker / D1 Failures

| Scenario | Behavior |
|---|---|
| Worker unreachable | CLI prints: "Can't reach the Cloudflare Worker at [url]. Check your internet connection and Worker deployment." |
| Auth token invalid | CLI prints: "Authentication failed. Check your DATENIGHT_AUTH_TOKEN environment variable." |
| D1 query error | Worker returns 500 with error message; CLI prints: "Database error: [message]. Try again or run `datenight init` to verify setup." |

### 11.3 External API Failures

| Scenario | Behavior |
|---|---|
| Yelp API down / key invalid | Worker returns cached results if available; if not, returns partial results with a `warnings` array. CLI shows: "Restaurant data may be incomplete — Yelp API is temporarily unavailable." |
| TMDb API down / key invalid | Same pattern. CLI shows: "Movie data unavailable — you can still plan a non-movie date." |
| Eventbrite API denied/down | Fallback to Yelp activity search. CLI shows no warning (seamless fallback). |
| Sparse results (< 3 venues) | Worker auto-expands radius (10mi → 25mi → 40mi). CLI shows: "Expanded search to 25 miles to find more options." |
| Zero results even after expansion | CLI shows: "No [restaurants/activities] found within 40 miles. Try updating your location in config." Plan proceeds with whatever venue types did return results. |

### 11.4 Logging

The system uses `structlog` for structured JSON logging, written to `logs/datenight.log` (gitignored). Every plan attempt logs:

- Timestamp, couple ID, requested date
- Phase 1/2/3 inputs (truncated), outputs, validation results, and timing
- Venue ID resolution results (which IDs mapped to which venues)
- Any retries with error messages
- Worker response times and cache hit/miss status
- Final plan or failure reason

The `datenight debug <date-id>` command (see §5.5) provides a human-readable view of this data without needing to parse JSON logs manually.

---

## 12. Testing Strategy

### 12.1 Test Categories

| Category | What's Tested | Tools |
|---|---|---|
| Unit tests | Pydantic schemas, deep link construction, venue resolver, calendar generation, date resolution logic | pytest |
| Integration tests | Full LLM pipeline with mock Ollama, Worker communication with mock HTTP | pytest + respx |
| Dry-run mode | End-to-end pipeline with canned fixture data instead of live APIs | `--dry-run` flag |

### 12.2 Unit Tests (`tests/unit/`)

- **`test_schemas.py`** — Validates that Pydantic models accept valid LLM output and reject invalid output (wrong venue ID format, out-of-range scores, missing required fields, invalid date types).
- **`test_deeplinks.py`** — Every URL pattern from §8 has test cases with known venue data and expected URLs. This is a pure function with 100% coverage.
- **`test_venue_resolver.py`** — Tests mapping venue IDs to full venue records, including error cases (unknown ID, duplicate ID, missing venue data).
- **`test_calendar.py`** — Tests .ics generation with confirmed and unconfirmed times, verifying the disclaimer text appears correctly.
- **`test_date_resolution.py`** — Tests the "this Saturday" logic from §5.3 across edge cases: Saturday morning, Saturday evening, Friday night, Sunday, Monday, etc.

### 12.3 Integration Tests (`tests/integration/`)

- **`test_planner.py`** — Runs the three-phase pipeline with a mock Ollama server that returns canned JSON responses. Tests the parse-retry loop by having the mock return invalid JSON on the first attempt and valid JSON on the second. Tests Phase 2 rejection triggering Phase 3 revision.
- **`test_api_client.py`** — Tests Worker communication using `respx` to mock HTTP responses. Covers auth failures, D1 errors, sparse-results expansion, and partial API failures.

### 12.4 Dry-Run Mode

`datenight plan --dry-run` runs the full pipeline end-to-end using:

- Canned venue data from `tests/fixtures/sample_venues.json` (no Worker call)
- Canned profiles and history (no D1 call)
- Live Ollama inference (or mock if `--dry-run --mock-llm` is passed)

This lets you test the LLM's actual behavior with realistic data without needing any external services running. The `--mock-llm` variant uses `tests/fixtures/sample_plan.json` and `sample_critique.json` for fully offline testing.

---

## 13. Configuration (config.yaml)

```yaml
# config.yaml
location:
  zip: "75165"            # Hardcoded for MVP
  city: "Waxahachie"
  state: "TX"
  radius_miles: 10        # Default; Worker auto-expands if sparse

ollama:
  model: "llama3.1:8b"    # or mistral:7b
  host: "http://localhost:11434"
  temperature: 0.8
  phase2_temperature: 0.3  # Lower temp for critique (more precise)
  phase3_temperature: 0.2  # Lowest for final review
  timeout_seconds: 120     # Per-phase inference timeout

cloudflare:
  worker_url: "https://datenight-api.your-domain.workers.dev"
  # Auth token is NOT stored here — read from DATENIGHT_AUTH_TOKEN env var

calendar:
  output_dir: "~/.datenight/calendars"
  reminder_minutes: 30

planning:
  max_retries: 3           # Full pipeline re-rolls
  max_parse_retries: 3     # JSON parse retries per phase
  min_quality_score: 7.0   # Phase 2 threshold for auto-approve
  same_day_cutoff: "16:00" # Saturday cutoff for same-day planning

logging:
  level: "INFO"            # DEBUG for verbose plan logging
  file: "logs/datenight.log"
```

Note: The `auth_token` is intentionally NOT in this file. It is read from the `DATENIGHT_AUTH_TOKEN` environment variable to prevent accidental exposure if the repo is shared or open-sourced. Set it via `export DATENIGHT_AUTH_TOKEN=your-secret` in your shell profile.

---

## 14. Setup & Installation

### 14.1 Prerequisites

- Python 3.11+
- Ollama installed and running (ollama.ai)
- Node.js 18+ and Wrangler CLI (`npm install -g wrangler`)
- A Cloudflare account (free tier is sufficient)
- Free API keys: Yelp Fusion, TMDb

### 14.2 Cloudflare Setup (Do This First)

1. **Login:** `wrangler login`
2. **Create D1 database:** `wrangler d1 create datenight`
3. **Update wrangler.toml:** Add the D1 database binding from step 2
4. **Create KV namespace:** `wrangler kv:namespace create CACHE`
5. **Update wrangler.toml:** Add the KV namespace binding from step 4
6. **Run D1 migrations:** `wrangler d1 migrations apply datenight`
7. **Set API secrets:** `wrangler secret put YELP_API_KEY`, `wrangler secret put TMDB_API_KEY`, `wrangler secret put AUTH_TOKEN`
8. **Deploy Worker:** `cd worker && wrangler deploy`
9. **Note the Worker URL** — you'll need it for the CLI config

### 14.3 CLI Installation

1. Clone the repository
2. Create a virtual environment: `python -m venv .venv && source .venv/bin/activate`
3. Install dependencies: `pip install -e ".[dev]"` (includes test dependencies)
4. Copy `config.example.yaml` to `config.yaml`
5. Set `worker_url` to your deployed Worker URL
6. Set auth token: `export DATENIGHT_AUTH_TOKEN=your-secret` (match the AUTH_TOKEN Worker secret)
7. Pull your Ollama model: `ollama pull llama3.1:8b`

### 14.4 First Run

1. Run the init wizard: `datenight init` (validates Worker, warms up Ollama, tests D1)
2. Create profiles: `datenight profile create` (run for each partner)
3. Link the couple: `datenight couple create`
4. Run tests: `pytest` (verify everything works)
5. Test with dry run: `datenight plan --dry-run` (no live APIs needed)
6. Plan for real: `datenight plan --verbose`

---

## 15. Example User Flow

```
$ datenight plan

📝 You haven't rated your last date (Taco Crawl on Mar 22).
   Quick rating? (1-5 or Enter to skip): 4

✨ Planning date night for Saturday, April 4th...

👤 Loading profiles: Alex & Jordan
🍿 Discovering movies near 75165...
🍽  Finding restaurants within 10 miles...
   ↳ Expanded to 25 miles (sparse results in 10mi radius)
🎳 Finding activities...
   Found 12 venues across 3 categories

🧠 Phase 1: Generating plan with Ollama...
   ✓ Valid JSON, all venue IDs verified (A3, R1)
✅ Plan generated (1.2s)

🔍 Phase 2: Adversarial quality review...
   ✓ Valid JSON on first attempt
✅ Score: 8.5/10 — 1 minor issue found (0.8s)

⚖️  Phase 3: Final approval...
   ✓ Valid JSON on first attempt
✅ Plan approved as-is (0.4s)

🔗 Resolving venues and building links...

────────────────────────────────────────
🌟 DATE NIGHT: Laughs & Late-Night Bites
   Type: entertainment (last was: food_crawl ★4)
   Quality: 8.5/10
────────────────────────────────────────

  ~7:00 PM  🎭  The Improv House [A3]
                Comedy show - 90 min
                🔗 Yelp: https://yelp.com/biz/improv-house-waxahachie
                🔗 Maps: https://google.com/maps/search/...
                ⚠️  Time is estimated — confirm via venue

  ~9:00 PM  🍽   Craft & Co Bar [R1]
                Craft cocktails + small plates
                🔗 OpenTable: https://opentable.com/s?term=...
                🔗 Resy: https://resy.com/cities/dallas?query=...
                🔗 Yelp: https://yelp.com/biz/craft-and-co-bar-waxahachie
                ⚠️  Time is estimated — confirm via link

  Why this plan: "Both of you ranked comedy in your
  top 3 activities. Alex loves cocktail bars and Jordan
  prefers smaller venues. Craft & Co is a 5-min walk
  from the comedy club. Your last comedy night was
  rated 4/5, so keeping the genre."

────────────────────────────────────────
[C]onfirm  [R]eroll  [Q]uit

> C

✅ Date saved! Calendar file: ~/.datenight/calendars/2026-04-04.ics
```

---

## 16. V1 Roadmap (Post-MVP)

| Feature | Priority | Complexity |
|---|---|---|
| Budget tiers (casual / moderate / splurge) | High | Medium |
| Exact showtime data via Gracenote/TMS API | High | Medium |
| Post-date rating feedback loop (ML-weighted) | High | Medium |
| Web UI on Cloudflare Pages (D1 already in place) | High | High |
| Google Calendar API integration | Medium | Medium |
| Multi-couple support (remove UNIQUE partner constraints) | Medium | Low |
| Real-time availability checking via Workers | Medium | High |
| Surprise mode (one partner plans, other is surprised) | Low | Low |
| Integration with rideshare APIs (Uber/Lyft links) | Low | Medium |
| Weather-aware planning (indoor backup plans) | Low | Medium |

# Sprint 1: Foundation & Infrastructure

**Goal:** Set up the project skeleton, Cloudflare infrastructure (Worker, D1, KV), configuration management, and structured logging. By the end, the Worker is deployed with auth, D1 has tables, and the Python CLI shell exists.

---

## 1. Deliverables

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 1.1 | Python project scaffolding | `pyproject.toml`, `datenight/` package, `tests/` directory, dev dependencies (pytest, respx, structlog, etc.) |
| 1.2 | Config management (`config.py`) | Pydantic-settings based config reads `config.yaml` + env vars; `DATENIGHT_AUTH_TOKEN` from env only |
| 1.3 | Cloudflare Worker skeleton (`worker/`) | `wrangler.toml`, `src/index.ts` with Hono or itty-router, health endpoint at `GET /health` |
| 1.4 | Auth middleware | Bearer token validation against `AUTH_TOKEN` Worker secret; returns 401 on mismatch |
| 1.5 | D1 database creation + initial migration | `migrations/0001_initial.sql` applied; partners, couples, date_history tables + indexes created |
| 1.6 | Workers KV namespace | `CACHE` namespace created and bound in `wrangler.toml` |
| 1.7 | Structured logging setup (`logging.py`) | `structlog` configured, writes JSON to `logs/datenight.log` (gitignored) |
| 1.8 | CLI entry point (`cli.py`) | `datenight` command registered via `pyproject.toml` entry point; Typer app with `--version` flag |
| 1.9 | `.env.example` + `config.example.yaml` | Document all required env vars and config keys |

---

## 2. Technical Details

### 2.1 Tech Stack (from spec)

| Component | Technology | Purpose |
|---|---|---|
| Language | Python 3.11+ | Core application logic |
| CLI Framework | Typer + Rich | Terminal UI with colors and tables |
| Database | Cloudflare D1 | Profiles, couples, date history, preferences |
| DB Access | Cloudflare Workers (REST API to D1) | CLI queries D1 via Worker endpoints |
| Edge Platform | Cloudflare Workers | API proxy, caching, rate limiting, D1 access |
| KV Store | Cloudflare Workers KV | Cache external API responses |
| HTTP Client | httpx | CLI-to-Worker communication |
| Config | pydantic-settings | App configuration and validation |
| Logging | structlog | Structured JSON logging |
| Testing | pytest + respx | Unit, integration, and dry-run testing |

### 2.2 Project Structure (target for this sprint)

```
date-night-autopilot/
├── datenight/
│   ├── __init__.py
│   ├── cli.py              # Typer commands (shell only this sprint)
│   ├── config.py           # Pydantic settings (reads env vars)
│   └── logging.py          # structlog configuration
├── worker/
│   ├── src/
│   │   ├── index.ts        # Cloudflare Worker entry + router
│   │   ├── middleware/
│   │   │   └── auth.ts     # Bearer token validation
│   │   └── db/
│   │       └── schema.sql  # D1 table definitions
│   ├── migrations/
│   │   └── 0001_initial.sql
│   ├── wrangler.toml       # Worker + D1 + KV config
│   └── package.json
├── logs/                   # Structured JSON logs (gitignored)
├── tests/
│   └── conftest.py
├── config.yaml
├── config.example.yaml
├── .env.example
├── pyproject.toml
└── README.md
```

### 2.3 D1 Schema (0001_initial.sql)

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

**D1 constraints to remember:**
- No `DROP COLUMN` — adding columns is easy, removing them requires table recreation
- No `ALTER COLUMN` — changing types requires table recreation
- Foreign key enforcement must be enabled per-connection via `PRAGMA foreign_keys = ON` (Worker should run this on each request)
- JSON columns stored as TEXT — `json_extract()` works on TEXT columns
- UNIQUE on both `partner_a` and `partner_b` ensures each partner belongs to one couple only

### 2.4 Configuration (config.yaml)

```yaml
location:
  zip: "75165"
  city: "Waxahachie"
  state: "TX"
  radius_miles: 10

ollama:
  model: "llama3.1:8b"
  host: "http://localhost:11434"
  temperature: 0.8
  phase2_temperature: 0.3
  phase3_temperature: 0.2
  timeout_seconds: 120

cloudflare:
  worker_url: "https://datenight-api.your-domain.workers.dev"

calendar:
  output_dir: "~/.datenight/calendars"
  reminder_minutes: 30

planning:
  max_retries: 3
  max_parse_retries: 3
  min_quality_score: 7.0
  same_day_cutoff: "16:00"

logging:
  level: "INFO"
  file: "logs/datenight.log"
```

**Auth token is NOT in config.yaml** — read from `DATENIGHT_AUTH_TOKEN` env var.

### 2.5 Auth Middleware

The CLI authenticates with the Worker using a Bearer token read from the `DATENIGHT_AUTH_TOKEN` environment variable. The Worker validates this against its `AUTH_TOKEN` secret.

All endpoints require `Authorization: Bearer <token>` header. Return 401 on mismatch.

### 2.6 Migration Strategy

D1 supports sequential SQL migration files applied via `wrangler d1 migrations apply`. Future schema changes:

1. Create a new migration file: `migrations/0002_add_budget_tier.sql`
2. Write forward-only SQL
3. Test locally: `wrangler d1 migrations apply datenight --local`
4. Apply to production: `wrangler d1 migrations apply datenight`
5. D1 tracks which migrations have been applied

---

## 3. Setup Steps (Cloudflare)

1. `wrangler login`
2. `wrangler d1 create datenight`
3. Update `wrangler.toml` with D1 database binding
4. `wrangler kv:namespace create CACHE`
5. Update `wrangler.toml` with KV namespace binding
6. `wrangler d1 migrations apply datenight`
7. `wrangler secret put AUTH_TOKEN`
8. `cd worker && wrangler deploy`

---

## 4. Definition of Done

- [ ] `pip install -e ".[dev]"` succeeds
- [ ] `datenight --version` prints version
- [ ] Worker deployed and `GET /health` returns 200
- [ ] Auth middleware rejects requests without valid token (401)
- [ ] D1 tables exist (partners, couples, date_history)
- [ ] KV namespace bound
- [ ] `structlog` writes JSON to `logs/datenight.log`
- [ ] `pytest` passes (even if only config/setup tests)

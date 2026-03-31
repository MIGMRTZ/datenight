# Sprint 2: Profiles, Couples & API Client

**Goal:** Implement partner profile and couple CRUD — both the Worker REST endpoints (D1 access) and the CLI commands. Build the shared `api_client.py` HTTP layer. By the end, users can create/edit/delete profiles and link couples via the CLI.

---

## 1. Deliverables

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 2.1 | Profile Worker routes (`routes/profiles.ts`) | `POST/GET/GET:id/PUT:id/DELETE:id /api/profiles` — full CRUD against D1 |
| 2.2 | Couple Worker routes (`routes/couples.ts`) | `POST/GET/GET:id/DELETE /api/couples` — link/unlink with UNIQUE enforcement |
| 2.3 | API client (`api_client.py`) | httpx-based client; reads `worker_url` from config, `DATENIGHT_AUTH_TOKEN` from env; handles auth errors, timeouts, retries |
| 2.4 | CLI `datenight profile create` | Interactive wizard: name, cuisines (ranked), movie genres (ranked), activities (ranked), dietary restrictions, dislikes |
| 2.5 | CLI `datenight profile list` | Rich table showing all profiles |
| 2.6 | CLI `datenight profile show <n>` | Display a partner's full preference profile |
| 2.7 | CLI `datenight profile edit <n>` | Update preferences interactively |
| 2.8 | CLI `datenight profile delete <n>` | Remove profile (fails if in a couple — enforced at Worker/D1 level) |
| 2.9 | CLI `datenight couple create` | Interactive prompt to link two profiles |
| 2.10 | CLI `datenight couple show` | Display current couple and both profiles |
| 2.11 | CLI `datenight couple unlink` | Remove couple link (profiles preserved) |
| 2.12 | Unit tests for API client | Mock HTTP with respx; cover auth failures, timeouts, D1 errors |
| 2.13 | Integration tests for profile/couple flow | End-to-end via mock Worker responses |

---

## 2. Technical Details

### 2.1 Profile Endpoints (Worker)

| Method | Endpoint | Description |
|---|---|---|
| `POST /api/profiles` | Create a new partner profile |
| `GET /api/profiles` | List all partner profiles |
| `GET /api/profiles/:id` | Get a specific partner profile |
| `PUT /api/profiles/:id` | Update a partner profile |
| `DELETE /api/profiles/:id` | Delete a partner profile (fails if in a couple) |

**Request body for POST/PUT:**
```json
{
  "id": "uuid-generated-client-side",
  "name": "Alex",
  "cuisines": ["Italian", "Mexican", "Thai"],
  "movie_genres": ["Comedy", "Thriller", "Sci-Fi"],
  "activities": ["Comedy shows", "Bowling", "Hiking"],
  "dietary_restrictions": ["Vegetarian"],
  "dislikes": ["Horror movies", "Sushi"]
}
```

- `id` is a UUID generated client-side
- `cuisines`, `movie_genres`, `activities` are JSON arrays, **ranked** (first = most preferred)
- `dietary_restrictions` and `dislikes` are JSON arrays (unranked)
- All JSON arrays stored as TEXT in D1, queried with `json_extract()`
- `created_at` and `updated_at` are ISO 8601 timestamps set server-side

### 2.2 Couple Endpoints (Worker)

| Method | Endpoint | Description |
|---|---|---|
| `POST /api/couples` | Link two partner profiles as a couple (fails if either is already linked) |
| `GET /api/couples` | List all couples |
| `GET /api/couples/:id` | Get a specific couple with both profiles |
| `DELETE /api/couples/:id` | Unlink a couple (profiles are preserved) |

**Couple constraints:**
- The `UNIQUE` constraint on both `partner_a` and `partner_b` individually ensures each partner can only belong to one couple
- Attempting to create a second couple with an already-linked partner fails at the database level
- DELETE removes the couple link but preserves both partner profiles
- Profile DELETE must fail if the partner is in a couple (check couples table first)

### 2.3 Partners Table Schema

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

### 2.4 Couples Table Schema

```sql
CREATE TABLE couples (
    id          TEXT PRIMARY KEY,
    partner_a   TEXT NOT NULL REFERENCES partners(id) UNIQUE,
    partner_b   TEXT NOT NULL REFERENCES partners(id) UNIQUE,
    created_at  TEXT NOT NULL
);
```

### 2.5 API Client Design

`api_client.py` is the sole HTTP layer between the CLI and the Worker.

- Uses `httpx` (async not required for MVP — sync is fine)
- Reads `worker_url` from `config.yaml` via pydantic-settings
- Reads `DATENIGHT_AUTH_TOKEN` from environment variable
- Sets `Authorization: Bearer <token>` on all requests
- Handles:
  - **Worker unreachable:** "Can't reach the Cloudflare Worker at [url]. Check your internet connection and Worker deployment."
  - **Auth token invalid (401):** "Authentication failed. Check your DATENIGHT_AUTH_TOKEN environment variable."
  - **D1 query error (500):** "Database error: [message]. Try again or run `datenight init` to verify setup."
  - **Timeouts:** Configurable, clear message

### 2.6 CLI Profile Commands

| Command | Description |
|---|---|
| `datenight profile create` | Interactive wizard to create a new partner profile |
| `datenight profile list` | Show all registered partner profiles (Rich table) |
| `datenight profile edit <n>` | Update an existing partner's preferences |
| `datenight profile show <n>` | Display a partner's full preference profile |
| `datenight profile delete <n>` | Remove a partner profile (must unlink couple first) |

**Interactive wizard flow (profile create):**
1. Prompt for name
2. Prompt for cuisines (comma-separated, order = rank)
3. Prompt for movie genres (comma-separated, order = rank)
4. Prompt for activities (comma-separated, order = rank)
5. Prompt for dietary restrictions (optional)
6. Prompt for dislikes (optional)
7. Confirm and send to Worker

### 2.7 CLI Couple Commands

| Command | Description |
|---|---|
| `datenight couple create` | Interactive prompt to link two profiles as a couple |
| `datenight couple show` | Display the current couple and both profiles |
| `datenight couple unlink` | Remove the couple link (profiles preserved) |

**Couple resolution note (from spec):**
MVP assumes exactly one couple exists. If zero couples exist, prompt to create one. If more than one, list them and ask which to use. This resolution logic will be used by `datenight plan` in Sprint 4.

---

## 3. Error Handling

| Scenario | Behavior |
|---|---|
| Worker unreachable | "Can't reach the Cloudflare Worker at [url]. Check your internet connection and Worker deployment." |
| Auth token invalid | "Authentication failed. Check your DATENIGHT_AUTH_TOKEN environment variable." |
| D1 query error | "Database error: [message]. Try again or run `datenight init` to verify setup." |
| Delete profile in couple | "Cannot delete [name] — they are part of a couple. Run `datenight couple unlink` first." |
| Create couple with linked partner | "Partner [name] is already in a couple." |

---

## 4. Definition of Done

- [ ] All 5 profile endpoints return correct responses (tested via curl or httpie)
- [ ] All 4 couple endpoints return correct responses
- [ ] UNIQUE constraints enforced (duplicate couple link returns error)
- [ ] Profile delete blocked when partner is in a couple
- [ ] `datenight profile create` wizard works end-to-end
- [ ] `datenight profile list` displays Rich table
- [ ] `datenight couple create` links two profiles
- [ ] `datenight couple show` displays couple info
- [ ] API client handles all error scenarios gracefully
- [ ] Unit tests pass for API client (mock HTTP)
- [ ] Integration tests pass for profile/couple flow

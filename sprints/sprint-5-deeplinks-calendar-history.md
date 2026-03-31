# Sprint 5: Deep Links, Calendar, History & Interactive Plan Flow

**Goal:** Implement deep link generation, .ics calendar export, date history CRUD, rating system, no-repeat logic, the aggregated planning endpoint, and the interactive `datenight plan` command. By the end, the full plan-to-save flow works end-to-end.

---

## 1. Deliverables

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 5.1 | Deep link generation (`deeplinks.py`) | Deterministic URL construction for Fandango, OpenTable, Resy, Google Maps, Yelp, Eventbrite |
| 5.2 | Calendar generation (`calendar_gen.py`) | .ics file with separate events per stop, reminders, unconfirmed-time disclaimers |
| 5.3 | History Worker routes (`routes/history.ts`) | Full CRUD: save, list, latest-type, unrated, rate, get |
| 5.4 | Aggregated planning endpoint (`routes/plan_data.ts`) | `GET /api/plan-data` returns profiles + history + venues in one call |
| 5.5 | No-repeat logic | Fetch last date type, pass as constraint to LLM, validate in Phase 2, catch in Phase 3 |
| 5.6 | Date resolution logic | "This Saturday" rules: before 4PM → today, after 4PM → next Saturday, other days → upcoming Saturday |
| 5.7 | Rating nudge | Before planning, prompt to rate last unrated date (1-5 or skip) |
| 5.8 | Interactive plan flow | `datenight plan` with [C]onfirm / [R]eroll / [Q]uit prompt |
| 5.9 | CLI `datenight history` | Rich table of past dates |
| 5.10 | CLI `datenight rate <date-id> <1-5>` | Rate a past date with optional `--notes` |
| 5.11 | CLI `datenight calendar <date-id>` | Export a past date plan as .ics |
| 5.12 | Unit tests for deep links | 100% coverage — every URL pattern with known inputs/expected outputs |
| 5.13 | Unit tests for calendar | Confirmed/unconfirmed times, disclaimer text |
| 5.14 | Unit tests for date resolution | Saturday AM, Saturday PM, Friday, Sunday, Monday edge cases |
| 5.15 | Integration tests for plan flow | End-to-end with mock Worker + mock Ollama |

---

## 2. Technical Details

### 2.1 Deep Link Generation

`deeplinks.py` is a **pure function**: venue data in, URLs out. The LLM never generates URLs.

| Service | URL Pattern | Source Data |
|---|---|---|
| Fandango | `fandango.com/search?q={title}&date={date}&location={zip}` | TMDb movie title + config zip |
| OpenTable | `opentable.com/s?term={name}&covers=2&dateTime={iso}` | Yelp venue name + planned date |
| Resy | `resy.com/cities/{city}?query={name}` | Yelp venue name + config city |
| Google Maps | `google.com/maps/search/{name+address}` | Yelp venue name + address |
| Yelp | `yelp.com/biz/{slug}` | Yelp slug from venue data |
| Eventbrite | `eventbrite.com/e/{event_id}` | Eventbrite event ID from venue data |

**For restaurants:** Generate both OpenTable AND Resy links, letting the couple choose their preferred platform. Resy is strong for trendy/upscale restaurants not on OpenTable.

**Testing:** Pure function with 100% unit test coverage.

### 2.2 Calendar Integration (.ics)

When a plan is confirmed, generate a standard .ics file importable by Google Calendar, Apple Calendar, Outlook.

Each stop becomes a **separate calendar event** with:
- Event title: e.g., "Date Night: Comedy at The Improv House"
- Start time and duration
- Location / address
- Description with deep links and notes
- Reminder alarm (30 minutes before first event, configurable via `calendar.reminder_minutes`)

**Unconfirmed time handling:** Since movie showtimes and venue availability are NOT confirmed in MVP, all calendar events include:
> "This time is an estimate. Please confirm the actual time using the booking link below before heading out."

Saved to configurable output directory (`calendar.output_dir`, default `~/.datenight/calendars/`). Path printed in terminal.

### 2.3 History Endpoints (Worker)

| Method | Endpoint | Description |
|---|---|---|
| `POST /api/history` | Save a confirmed date to history |
| `GET /api/history?couple_id={id}&limit={n}` | List past dates for a couple |
| `GET /api/history/latest-type?couple_id={id}` | Get the most recent date's type (for no-repeat) |
| `GET /api/history/unrated?couple_id={id}` | Get the most recent unrated date (for rating nudge) |
| `PUT /api/history/:id/rate` | Add a post-date rating (1-5) and optional notes |
| `GET /api/history/:id` | Get a specific date record |

**Date history table schema:**
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
```

### 2.4 Aggregated Planning Endpoint

| Method | Endpoint | Description |
|---|---|---|
| `GET /api/plan-data?couple_id={id}&date={date}` | Returns all data the LLM needs in one call |

Returns:
- Both partner profiles
- Last 10 dates with ratings
- Most recent unrated date (for rating nudge)
- All venue categories with assigned IDs (movies, restaurants, activities, events)

This is the single endpoint the CLI calls before starting the LLM pipeline.

### 2.5 No-Repeat Logic

The system enforces variety by preventing the same date type back-to-back:

1. CLI calls `GET /api/history/latest-type?couple_id={id}` (or gets it from plan-data)
2. Last type (e.g., "dinner_and_movie") passed as constraint to Phase 1: "Do NOT plan a dinner_and_movie date"
3. Phase 2 independently validates type was varied
4. Phase 3 auto-revises if violation detected
5. If all three phases fail, re-roll from Phase 1 (up to 3 attempts)

Couples can still do the same type — just not twice in a row.

### 2.6 Date Resolution Rules

For `datenight plan` (no `--date` flag), the default target is "the next Saturday":

| Condition | Target Date |
|---|---|
| Today is Saturday, before 4:00 PM local | **Today** |
| Today is Saturday, 4:00 PM or later | **Next Saturday** |
| Any other day of the week | **Upcoming Saturday** |

The 4 PM cutoff gives couples time to act on a same-day plan. Configurable via `planning.same_day_cutoff` in config.yaml.

### 2.7 Rating Nudge

Before planning begins, if the most recent past date hasn't been rated:

> "You haven't rated your last date (Comedy & Craft Cocktails on Mar 22). Quick rating? (1-5 or Enter to skip):"

Single keypress to skip. Keeps rating data flowing without being annoying.

### 2.8 Interactive Plan Flow

```
datenight plan [--date YYYY-MM-DD] [--verbose] [--dry-run]
```

Full interactive flow:

1. **Rating nudge** (if last date unrated)
2. **Resolve date** (this Saturday or specified date)
3. **Fetch plan data** from Worker (profiles, history, venues)
4. **Show progress:** "Discovering movies...", "Finding restaurants...", etc.
5. **Run three-phase pipeline** (with progress indicators)
6. **Resolve venue IDs** → full venue data
7. **Generate deep links** deterministically
8. **Display plan** in Rich-formatted terminal output
9. **Prompt:** `[C]onfirm  [R]eroll  [Q]uit`
   - **Confirm:** Save to D1 via Worker, generate .ics file, print path
   - **Reroll:** Run full three-phase pipeline again
   - **Quit:** Exit without saving

### 2.9 CLI History & Rating Commands

| Command | Description |
|---|---|
| `datenight history` | Show all past dates in a Rich table |
| `datenight history --last 5` | Show last N dates |
| `datenight rate <date-id> <1-5>` | Rate a past date (optional `--notes "..."`) |
| `datenight calendar <date-id>` | Export a past date plan as .ics file |

### 2.10 Plan Display Format

```
────────────────────────────────────────
 DATE NIGHT: Laughs & Late-Night Bites
   Type: entertainment (last was: food_crawl ★4)
   Quality: 8.5/10
────────────────────────────────────────

  ~7:00 PM   The Improv House [A3]
                Comedy show - 90 min
                Yelp: https://yelp.com/biz/improv-house-waxahachie
                Maps: https://google.com/maps/search/...
                Time is estimated — confirm via venue

  ~9:00 PM   Craft & Co Bar [R1]
                Craft cocktails + small plates
                OpenTable: https://opentable.com/s?term=...
                Resy: https://resy.com/cities/dallas?query=...
                Yelp: https://yelp.com/biz/craft-and-co-bar-waxahachie
                Time is estimated — confirm via link

  Why this plan: "Both of you ranked comedy in your
  top 3 activities..."

────────────────────────────────────────
[C]onfirm  [R]eroll  [Q]uit
```

---

## 3. Definition of Done

- [ ] `deeplinks.py` generates correct URLs for all 6 services (Fandango, OpenTable, Resy, Maps, Yelp, Eventbrite)
- [ ] Deep link unit tests have 100% coverage
- [ ] .ics generation produces valid calendar files with separate events per stop
- [ ] Calendar events include unconfirmed-time disclaimers
- [ ] All 6 history endpoints work correctly
- [ ] `GET /api/plan-data` returns aggregated data in one call
- [ ] No-repeat logic blocks same date type back-to-back
- [ ] Date resolution logic handles all edge cases (Saturday AM/PM, weekdays)
- [ ] Rating nudge appears for unrated dates, skippable with Enter
- [ ] `datenight plan` runs full interactive flow: nudge → fetch → pipeline → display → confirm/reroll/quit
- [ ] Confirm saves to D1 and generates .ics
- [ ] Reroll runs pipeline again
- [ ] `datenight history` displays Rich table
- [ ] `datenight rate` updates rating in D1
- [ ] `datenight calendar` exports .ics for past date
- [ ] All unit tests pass (deeplinks, calendar, date resolution)
- [ ] Integration tests pass (full plan flow with mocks)

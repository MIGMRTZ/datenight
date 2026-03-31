# Sprint 3: Venue Discovery & Caching

**Goal:** Implement all external API integrations (TMDb, Yelp, Eventbrite) via the Cloudflare Worker, with KV caching, venue ID assignment, and sparse-results auto-expansion. By the end, the CLI can fetch real venue data with assigned IDs.

---

## 1. Deliverables

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 3.1 | Movie discovery route (`routes/movies.ts`) | `GET /api/movies?zip={zip}&date={date}` — proxies TMDb, assigns M1/M2/... IDs, caches in KV |
| 3.2 | Restaurant discovery route (`routes/restaurants.ts`) | `GET /api/restaurants?zip={zip}&cuisine={cuisine}&radius={mi}` — proxies Yelp, assigns R1/R2/... IDs, caches in KV |
| 3.3 | Activity discovery route (`routes/activities.ts`) | `GET /api/activities?zip={zip}&category={cat}` — proxies Yelp, assigns A1/A2/... IDs, caches in KV |
| 3.4 | Events discovery route (`routes/events.ts`) | `GET /api/events?zip={zip}&date_from={date}&date_to={date}` — proxies Eventbrite (with Yelp fallback), assigns E1/E2/... IDs, caches in KV |
| 3.5 | Sparse-results middleware (`middleware/sparse.ts`) | Auto-expand radius 10mi → 25mi → 40mi when < 3 results; include `radius_expanded: true` flag |
| 3.6 | KV caching layer | All venue endpoints cache responses in Workers KV with appropriate TTLs |
| 3.7 | API key management | Yelp, TMDb, (Eventbrite) keys stored as Worker secrets |
| 3.8 | Rate limiting | Per-endpoint rate limits to stay within free tiers |
| 3.9 | Unit tests for venue ID assignment | Verify ID format (R#, M#, A#, E#) and stability within a session |
| 3.10 | Integration tests for venue endpoints | Mock external APIs, verify caching, sparse expansion |

---

## 2. Technical Details

### 2.1 Venue Discovery Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET /api/movies?zip={zip}&date={date}` | Now-playing movies near zip. Each result gets ID: `M1`, `M2`, etc. |
| `GET /api/restaurants?zip={zip}&cuisine={cuisine}&radius={mi}` | Restaurants by cuisine and radius. IDs: `R1`, `R2`, etc. |
| `GET /api/activities?zip={zip}&category={cat}` | Activities by category. IDs: `A1`, `A2`, etc. |
| `GET /api/events?zip={zip}&date_from={date}&date_to={date}` | Events in date range. IDs: `E1`, `E2`, etc. |

All endpoints require `Authorization: Bearer <token>` header.

### 2.2 Venue ID System

This is a **critical architectural decision**. The LLM never generates URLs.

1. The Worker assigns short IDs to every venue: `R1`, `R2` for restaurants, `M1`, `M2` for movies, `A1`, `A2` for activities, `E1`, `E2` for events
2. IDs are **stable within a single planning session** — same request = same IDs
3. The LLM prompt includes the full venue list with IDs:
   ```
   Available restaurants:
   [R1] Craft & Co Bar — American, $$, 4.5★, 123 Main St
   [R2] Bistro 31 — Italian, $$$, 4.2★, 456 Oak Ave
   ```
4. The LLM references venues by ID only in its output
5. After the pipeline, `venue_resolver.py` maps IDs back to full venue data
6. `deeplinks.py` constructs URLs deterministically from venue metadata

**Any venue ID not in the original dataset is caught by Pydantic validation.**

### 2.3 Venue Response Shape

Example for restaurants:
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

Movies include: `id`, `title`, `genre`, `rating`, `synopsis`, `poster_url`, `tmdb_id`
Activities include: `id`, `name`, `category`, `address`, `rating`, `yelp_slug`, `lat`, `lng`
Events include: `id`, `name`, `date`, `time`, `venue`, `address`, `eventbrite_id`, `url`

### 2.4 KV Cache Configuration

| Cache Key Pattern | TTL | Content |
|---|---|---|
| `movies:{zip}:{date}` | 1 hour | Now-playing movies for a zip + date |
| `restaurants:{zip}:{cuisine}:{radius}` | 24 hours | Restaurant search results |
| `activities:{zip}:{category}` | 24 hours | Activity/venue search results |
| `events:{zip}:{date_range}` | 6 hours | Eventbrite event listings |

- Check KV first; on hit, return cached data (still assign IDs consistently)
- On miss, call external API, store result in KV, then return
- Cache includes the raw API response before ID assignment (IDs are assigned on read)

### 2.5 Sparse-Results Detection

If a venue search returns fewer than 3 results, the Worker automatically retries with expanded radius:

1. Initial search at configured radius (default 10mi)
2. If < 3 results → retry at 25mi
3. If still < 3 results → retry at 40mi
4. Return whatever is found with `radius_expanded: true` and actual `radius_miles`

This logic lives in `middleware/sparse.ts` and wraps all venue endpoints.

### 2.6 External API Details

#### Movies — TMDb API (free)
- **Endpoint:** `/movie/now_playing` with region filter
- **Free tier:** Generous (no daily limit concerns for MVP)
- **Returns:** Title, genre, rating, synopsis, poster, release date
- **Limitation:** No showtimes — MVP provides discovery only. Calendar events include disclaimer about estimated times.

#### Restaurants — Yelp Fusion API (free tier)
- **Endpoint:** `/businesses/search` with location, categories, radius
- **Free tier:** 5,000 calls/day
- **Returns:** Name, address, cuisine, rating, price, slug, coordinates
- **Rate limiting:** Worker enforces per-endpoint limits to stay within free tier

#### Activities — Yelp Fusion API
- **Same API, different categories:** active, arts, nightlife, etc.
- **Returns:** Same shape as restaurants

#### Events — Eventbrite API
- **Endpoint:** Events search by location and date range
- **Note:** Eventbrite API requires approval for production use and may be unreliable to obtain
- **Fallback:** If Eventbrite access is denied, use Yelp event search or skip time-specific events for MVP and rely on static venue discovery only
- **Returns:** Event name, date, time, venue, address, event ID, URL

### 2.7 API Key Management

All third-party API keys stored as Worker secrets via `wrangler secret put`:
- `YELP_API_KEY`
- `TMDB_API_KEY`
- `EVENTBRITE_API_KEY` (if available)

**Never in CLI config or source code.**

### 2.8 External API Failure Handling

| Scenario | Behavior |
|---|---|
| Yelp API down / key invalid | Return cached results if available; if not, return partial results with `warnings` array |
| TMDb API down / key invalid | Same pattern. CLI shows: "Movie data unavailable — you can still plan a non-movie date." |
| Eventbrite API denied/down | Fallback to Yelp activity search. No warning shown (seamless fallback). |
| Sparse results (< 3) | Auto-expand radius (10mi → 25mi → 40mi). CLI shows: "Expanded search to 25 miles to find more options." |
| Zero results even after expansion | CLI shows: "No [type] found within 40 miles. Try updating your location in config." Plan proceeds with whatever venue types did return results. |

---

## 3. Definition of Done

- [ ] `GET /api/movies` returns venue data with M# IDs from TMDb
- [ ] `GET /api/restaurants` returns venue data with R# IDs from Yelp
- [ ] `GET /api/activities` returns venue data with A# IDs from Yelp
- [ ] `GET /api/events` returns venue data with E# IDs (or graceful fallback)
- [ ] KV caching works — second request for same params is a cache hit
- [ ] Sparse-results expansion triggers at < 3 results
- [ ] `radius_expanded` flag present in responses when expansion occurred
- [ ] API keys stored as Worker secrets, not in source
- [ ] Rate limiting enforced
- [ ] All venue responses match expected shape (id, name, address, etc.)
- [ ] Unit tests pass for ID assignment logic
- [ ] Integration tests pass with mock external APIs

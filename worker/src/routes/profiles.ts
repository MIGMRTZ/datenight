import { Hono } from "hono";
import type { Env } from "../types";

interface ProfileBody {
  id: string;
  name: string;
  cuisines: string[];
  movie_genres: string[];
  activities: string[];
  dietary_restrictions?: string[];
  dislikes?: string[];
}

interface PartnerRow {
  id: string;
  name: string;
  cuisines: string;
  movie_genres: string;
  activities: string;
  dietary_restrictions: string;
  dislikes: string;
  created_at: string;
  updated_at: string;
}

function parsePartnerRow(row: PartnerRow) {
  return {
    id: row.id,
    name: row.name,
    cuisines: JSON.parse(row.cuisines),
    movie_genres: JSON.parse(row.movie_genres),
    activities: JSON.parse(row.activities),
    dietary_restrictions: JSON.parse(row.dietary_restrictions || "[]"),
    dislikes: JSON.parse(row.dislikes || "[]"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateProfileBody(body: Partial<ProfileBody>, requireId: boolean): string | null {
  if (requireId && !body.id) return "Missing required field: id";
  if (!body.name?.trim()) return "Missing required field: name";
  if (!Array.isArray(body.cuisines) || body.cuisines.length === 0)
    return "Missing required field: cuisines (non-empty array)";
  if (!Array.isArray(body.movie_genres) || body.movie_genres.length === 0)
    return "Missing required field: movie_genres (non-empty array)";
  if (!Array.isArray(body.activities) || body.activities.length === 0)
    return "Missing required field: activities (non-empty array)";
  return null;
}

export const profileRoutes = new Hono<{ Bindings: Env }>();

profileRoutes.post("/", async (c) => {
  const body = await c.req.json<ProfileBody>();
  const error = validateProfileBody(body, true);
  if (error) return c.json({ error }, 400);

  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(
      `INSERT INTO partners (id, name, cuisines, movie_genres, activities, dietary_restrictions, dislikes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.id,
        body.name,
        JSON.stringify(body.cuisines),
        JSON.stringify(body.movie_genres),
        JSON.stringify(body.activities),
        JSON.stringify(body.dietary_restrictions || []),
        JSON.stringify(body.dislikes || []),
        now,
        now
      )
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("PRIMARY")) {
      return c.json({ error: "A profile with this ID already exists" }, 409);
    }
    throw e;
  }

  const row = await c.env.DB.prepare("SELECT * FROM partners WHERE id = ?")
    .bind(body.id)
    .first<PartnerRow>();
  return c.json(parsePartnerRow(row!), 201);
});

profileRoutes.get("/", async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM partners ORDER BY name")
    .all<PartnerRow>();
  return c.json({ profiles: result.results.map(parsePartnerRow) });
});

profileRoutes.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM partners WHERE id = ?")
    .bind(c.req.param("id"))
    .first<PartnerRow>();
  if (!row) return c.json({ error: "Profile not found" }, 404);
  return c.json(parsePartnerRow(row));
});

profileRoutes.put("/:id", async (c) => {
  const body = await c.req.json<Omit<ProfileBody, "id">>();
  const error = validateProfileBody(body as ProfileBody, false);
  if (error) return c.json({ error }, 400);

  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE partners SET name=?, cuisines=?, movie_genres=?, activities=?,
     dietary_restrictions=?, dislikes=?, updated_at=? WHERE id=?`
  )
    .bind(
      body.name,
      JSON.stringify(body.cuisines),
      JSON.stringify(body.movie_genres),
      JSON.stringify(body.activities),
      JSON.stringify(body.dietary_restrictions || []),
      JSON.stringify(body.dislikes || []),
      now,
      c.req.param("id")
    )
    .run();

  if (!result.meta.changes) return c.json({ error: "Profile not found" }, 404);

  const row = await c.env.DB.prepare("SELECT * FROM partners WHERE id = ?")
    .bind(c.req.param("id"))
    .first<PartnerRow>();
  return c.json(parsePartnerRow(row!));
});

profileRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Check if partner is in a couple
  const couple = await c.env.DB.prepare(
    "SELECT id FROM couples WHERE partner_a = ? OR partner_b = ?"
  )
    .bind(id, id)
    .first();
  if (couple) {
    return c.json({ error: "Cannot delete — partner is in a couple" }, 409);
  }

  const result = await c.env.DB.prepare("DELETE FROM partners WHERE id = ?")
    .bind(id)
    .run();
  if (!result.meta.changes) return c.json({ error: "Profile not found" }, 404);
  return c.body(null, 204);
});

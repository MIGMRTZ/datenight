import { Hono } from "hono";
import type { Env } from "../types";

interface CoupleBody {
  id: string;
  partner_a: string;
  partner_b: string;
}

interface CoupleRow {
  id: string;
  partner_a: string;
  partner_b: string;
  created_at: string;
}

interface CoupleWithPartnersRow {
  id: string;
  partner_a: string;
  partner_b: string;
  created_at: string;
  pa_name: string;
  pa_cuisines: string;
  pa_movie_genres: string;
  pa_activities: string;
  pa_dietary_restrictions: string;
  pa_dislikes: string;
  pb_name: string;
  pb_cuisines: string;
  pb_movie_genres: string;
  pb_activities: string;
  pb_dietary_restrictions: string;
  pb_dislikes: string;
}

function parsePartnerFromJoin(prefix: "pa" | "pb", row: CoupleWithPartnersRow, id: string) {
  return {
    id,
    name: row[`${prefix}_name`],
    cuisines: JSON.parse(row[`${prefix}_cuisines`]),
    movie_genres: JSON.parse(row[`${prefix}_movie_genres`]),
    activities: JSON.parse(row[`${prefix}_activities`]),
    dietary_restrictions: JSON.parse(row[`${prefix}_dietary_restrictions`] || "[]"),
    dislikes: JSON.parse(row[`${prefix}_dislikes`] || "[]"),
  };
}

export const coupleRoutes = new Hono<{ Bindings: Env }>();

coupleRoutes.post("/", async (c) => {
  const body = await c.req.json<CoupleBody>();

  if (!body.id || !body.partner_a || !body.partner_b) {
    return c.json({ error: "Missing required fields: id, partner_a, partner_b" }, 400);
  }

  // Verify both partners exist
  const partnerA = await c.env.DB.prepare("SELECT id FROM partners WHERE id = ?")
    .bind(body.partner_a).first();
  if (!partnerA) return c.json({ error: `Partner not found: ${body.partner_a}` }, 404);

  const partnerB = await c.env.DB.prepare("SELECT id FROM partners WHERE id = ?")
    .bind(body.partner_b).first();
  if (!partnerB) return c.json({ error: `Partner not found: ${body.partner_b}` }, 404);

  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(
      "INSERT INTO couples (id, partner_a, partner_b, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(body.id, body.partner_a, body.partner_b, now)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return c.json({ error: "Partner is already in a couple" }, 409);
    }
    throw e;
  }

  return c.json({ id: body.id, partner_a: body.partner_a, partner_b: body.partner_b, created_at: now }, 201);
});

coupleRoutes.get("/", async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM couples ORDER BY created_at DESC")
    .all<CoupleRow>();
  return c.json({ couples: result.results });
});

coupleRoutes.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT c.id, c.partner_a, c.partner_b, c.created_at,
       pa.name as pa_name, pa.cuisines as pa_cuisines, pa.movie_genres as pa_movie_genres,
       pa.activities as pa_activities, pa.dietary_restrictions as pa_dietary_restrictions,
       pa.dislikes as pa_dislikes,
       pb.name as pb_name, pb.cuisines as pb_cuisines, pb.movie_genres as pb_movie_genres,
       pb.activities as pb_activities, pb.dietary_restrictions as pb_dietary_restrictions,
       pb.dislikes as pb_dislikes
     FROM couples c
     JOIN partners pa ON c.partner_a = pa.id
     JOIN partners pb ON c.partner_b = pb.id
     WHERE c.id = ?`
  )
    .bind(c.req.param("id"))
    .first<CoupleWithPartnersRow>();

  if (!row) return c.json({ error: "Couple not found" }, 404);

  return c.json({
    id: row.id,
    created_at: row.created_at,
    partner_a: parsePartnerFromJoin("pa", row, row.partner_a),
    partner_b: parsePartnerFromJoin("pb", row, row.partner_b),
  });
});

coupleRoutes.delete("/:id", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM couples WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  if (!result.meta.changes) return c.json({ error: "Couple not found" }, 404);
  return c.body(null, 204);
});

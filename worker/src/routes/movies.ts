import { Hono } from "hono";
import type { Env } from "../types";
import { assignVenueIds } from "../venues/ids";
import { withCache } from "../venues/cache";
import type { MovieVenue, VenueResponse } from "../venues/types";

// TMDb genre IDs → names (stable list, avoids extra API call)
const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

interface TmdbMovie {
  id: number;
  title: string;
  genre_ids: number[];
  vote_average: number;
  overview: string;
  poster_path: string | null;
}

interface TmdbResponse {
  results: TmdbMovie[];
}

function transformTmdbMovie(movie: TmdbMovie): Omit<MovieVenue, "id"> {
  const genre = movie.genre_ids
    .map((id) => GENRE_MAP[id] || "Other")
    .join(", ");

  return {
    name: movie.title,
    title: movie.title,
    genre,
    rating: movie.vote_average,
    synopsis: movie.overview,
    poster_url: movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "",
    tmdb_id: movie.id,
  };
}

export const movieRoutes = new Hono<{ Bindings: Env }>();

movieRoutes.get("/", async (c) => {
  const zip = c.req.query("zip");
  if (!zip) {
    return c.json({ error: "Missing required parameter: zip" }, 400);
  }

  const date = c.req.query("date") || new Date().toISOString().split("T")[0];
  const cacheKey = `movies:${zip}:${date}`;

  try {
    const { data: movies } = await withCache<Omit<MovieVenue, "id">[]>(
      c.env.CACHE,
      cacheKey,
      3600, // 1 hour TTL
      async () => {
        const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${c.env.TMDB_API_KEY}&region=US&page=1`;
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`TMDb API error: ${resp.status}`);
        }
        const data = (await resp.json()) as TmdbResponse;
        return data.results.map(transformTmdbMovie);
      }
    );

    const venues = assignVenueIds("M", movies);
    const response: VenueResponse<MovieVenue> = {
      venues,
      radius_miles: 0,
      radius_expanded: false,
    };
    return c.json(response);
  } catch {
    return c.json({
      venues: [],
      radius_miles: 0,
      radius_expanded: false,
      warnings: ["Movie data temporarily unavailable"],
    });
  }
});

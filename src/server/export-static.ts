import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Movie, Screening, StaticProgramSnapshot } from "../shared/types";
import { db, getCinemasWithSync, queryScreenings } from "./db";
import { getParisDateStr } from "./scrapers/utils";

export const STATIC_PROGRAM_PATH = path.resolve(
  import.meta.dir,
  "../../public/data/program.json"
);

export function seedMoviesFromStaticProgram(): number {
  if (!existsSync(STATIC_PROGRAM_PATH)) return 0;
  const currentMoviesCount =
    db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM movies").get()?.cnt ?? 0;
  if (currentMoviesCount > 0) return 0;

  let snapshot: StaticProgramSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(STATIC_PROGRAM_PATH, "utf8")) as StaticProgramSnapshot;
  } catch (err) {
    console.warn("[Seed] Impossible de lire public/data/program.json:", err);
    return 0;
  }

  const moviesList = Object.values(snapshot.movies || {});
  if (moviesList.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const stmt = db.query(`
    INSERT OR IGNORE INTO movies (
      canonical_key, title, original_title, director, release_year, duration_min,
      genres, synopsis, poster_url, tmdb_id, imdb_id, letterboxd_url,
      letterboxd_rating, letterboxd_votes, letterboxd_year, letterboxd_checked_at,
      is_cult, cult_reasons_json, is_live_broadcast, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const m of moviesList) {
      const checkedAt = m.letterboxdUrl ? snapshot.generatedAt : null;
      const lbYear = m.letterboxdUrl ? m.releaseYear : null;
      stmt.run(
        m.canonicalKey,
        m.title,
        m.originalTitle ?? null,
        m.director ?? null,
        m.releaseYear ?? null,
        m.durationMin ?? null,
        m.genres ?? null,
        m.synopsis ?? null,
        m.posterUrl ?? null,
        m.tmdbId ?? null,
        m.imdbId ?? null,
        m.letterboxdUrl ?? null,
        m.letterboxdRating ?? null,
        m.letterboxdVotes ?? null,
        lbYear,
        checkedAt,
        m.isCult ? 1 : 0,
        JSON.stringify(m.cultReasons ?? []),
        m.isLiveBroadcast ? 1 : 0,
        nowIso
      );
      inserted++;
    }
  });
  tx();

  console.log(`[Seed] ${inserted} films pré-chargés depuis public/data/program.json`);
  return inserted;
}

export function exportStaticProgram(): {
  screeningsCount: number;
  moviesCount: number;
  bytes: number;
  path: string;
} {
  const details = queryScreenings({
    from: getParisDateStr(0),
    cultOnly: false,
    includeOffsite: true,
  });

  if (details.length === 0) {
    throw new Error("Refus d'exporter un program.json vide : aucune séance à venir.");
  }

  const movies: Record<number, Movie> = {};
  const screenings: Screening[] = [];

  for (const s of details) {
    if (!movies[s.movie.id]) {
      movies[s.movie.id] = {
        ...s.movie,
        inWatchlist: false,
      };
    }

    screenings.push({
      id: s.id,
      cinemaId: s.cinemaId,
      movieId: s.movieId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      date: s.date,
      time: s.time,
      version: s.version,
      isCineConcert: s.isCineConcert,
      isOffsite: s.isOffsite,
      offsiteVenue: s.offsiteVenue,
      room: s.room,
      labels: s.labels,
      bookingUrl: s.bookingUrl,
      isCultOverride: s.isCultOverride,
      cultReasonOverride: s.cultReasonOverride,
    });
  }

  const snapshot: StaticProgramSnapshot = {
    generatedAt: new Date().toISOString(),
    cinemas: getCinemasWithSync(),
    movies,
    screenings,
  };

  mkdirSync(path.dirname(STATIC_PROGRAM_PATH), { recursive: true });
  const payload = JSON.stringify(snapshot);
  writeFileSync(STATIC_PROGRAM_PATH, payload, "utf8");

  return {
    screeningsCount: screenings.length,
    moviesCount: Object.keys(movies).length,
    bytes: Buffer.byteLength(payload, "utf8"),
    path: STATIC_PROGRAM_PATH,
  };
}

if (import.meta.main) {
  const res = exportStaticProgram();
  console.log(
    `[StaticExport] ${res.screeningsCount} séances, ${res.moviesCount} films (${Math.round(res.bytes / 1024)} Ko) -> ${res.path}`
  );
}

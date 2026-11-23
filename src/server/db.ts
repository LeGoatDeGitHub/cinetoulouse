import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  CinemaWithSync,
  Movie,
  ScreeningWithDetails,
  Version,
  WatchlistStatus,
  WatchlistStoredItem,
} from "../shared/types";
import {
  computeMatchedMovies,
  createWatchlistMatcher,
  extractLetterboxdSlug,
} from "../shared/watchlist";
import { CINEMA_MAP, CINEMAS } from "./cinemas";
import {
  canonicalizeTitle,
  cleanDisplayTitle,
  evaluateCultSignals,
  isLiveBroadcastTitle,
} from "./enricher/normalize";
import type { RawScrapedScreening } from "./scrapers/types";
import { computeEndsAt, getCurrentParisYear, getParisDateStr } from "./scrapers/utils";

const DATA_DIR = path.resolve(import.meta.dir, "../../data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "cinema.sqlite"), { create: true });

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    original_title TEXT,
    director TEXT,
    release_year INTEGER,
    duration_min INTEGER,
    genres TEXT,
    synopsis TEXT,
    poster_url TEXT,
    tmdb_id INTEGER,
    imdb_id TEXT,
    letterboxd_url TEXT,
    letterboxd_rating REAL,
    letterboxd_votes INTEGER,
    letterboxd_year INTEGER,
    letterboxd_checked_at TEXT,
    is_cult INTEGER NOT NULL DEFAULT 0,
    cult_reasons_json TEXT NOT NULL DEFAULT '[]',
    is_live_broadcast INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_movies_tmdb ON movies(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_movies_imdb ON movies(imdb_id);
  CREATE INDEX IF NOT EXISTS idx_movies_canonical ON movies(canonical_key);

  CREATE TABLE IF NOT EXISTS screenings (
    id TEXT PRIMARY KEY,
    cinema_id TEXT NOT NULL,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    version TEXT NOT NULL,
    is_cine_concert INTEGER NOT NULL DEFAULT 0,
    is_offsite INTEGER NOT NULL DEFAULT 0,
    offsite_venue TEXT,
    room TEXT,
    labels_json TEXT NOT NULL DEFAULT '[]',
    booking_url TEXT,
    is_cult_override INTEGER NOT NULL DEFAULT 0,
    cult_reason_override TEXT,
    scraped_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_screenings_date ON screenings(date, time);
  CREATE INDEX IF NOT EXISTS idx_screenings_cinema ON screenings(cinema_id, date);
  CREATE INDEX IF NOT EXISTS idx_screenings_movie ON screenings(movie_id);

  CREATE TABLE IF NOT EXISTS sync_logs (
    cinema_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    screenings_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    last_synced_at TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS page_cache (
    url TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist_items (
    id TEXT PRIMARY KEY,
    slug TEXT,
    title TEXT NOT NULL,
    canonical_key TEXT NOT NULL,
    release_year INTEGER,
    letterboxd_uri TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_watchlist_slug ON watchlist_items(slug);
  CREATE INDEX IF NOT EXISTS idx_watchlist_canonical ON watchlist_items(canonical_key);
`);

interface MovieRow {
  id: number;
  canonical_key: string;
  title: string;
  original_title: string | null;
  director: string | null;
  release_year: number | null;
  duration_min: number | null;
  genres: string | null;
  synopsis: string | null;
  poster_url: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  letterboxd_url: string | null;
  letterboxd_rating: number | null;
  letterboxd_votes: number | null;
  letterboxd_year: number | null;
  letterboxd_checked_at: string | null;
  is_cult: number;
  cult_reasons_json: string;
  is_live_broadcast: number;
}

function rowToMovie(r: MovieRow): Movie {
  return {
    id: r.id,
    canonicalKey: r.canonical_key,
    title: r.title,
    originalTitle: r.original_title,
    director: r.director,
    releaseYear: r.release_year,
    durationMin: r.duration_min,
    genres: r.genres,
    synopsis: r.synopsis,
    posterUrl: r.poster_url,
    tmdbId: r.tmdb_id,
    imdbId: r.imdb_id,
    letterboxdUrl: r.letterboxd_url,
    letterboxdRating: r.letterboxd_rating,
    letterboxdVotes: r.letterboxd_votes,
    isCult: Boolean(r.is_cult),
    cultReasons: safeParseArray(r.cult_reasons_json),
    isLiveBroadcast: Boolean(r.is_live_broadcast),
    inWatchlist: false,
  };
}

function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export function getCachedPage<T>(url: string, maxAgeMs = 7 * 24 * 3600 * 1000): T | null {
  const row = db
    .query<{ data_json: string; fetched_at: number }, [string]>(
      "SELECT data_json, fetched_at FROM page_cache WHERE url = ?"
    )
    .get(url);
  if (!row) return null;
  if (Date.now() - row.fetched_at > maxAgeMs) return null;
  try {
    return JSON.parse(row.data_json) as T;
  } catch {
    return null;
  }
}

export function setCachedPage(url: string, data: unknown): void {
  db.query(
    "INSERT OR REPLACE INTO page_cache (url, data_json, fetched_at) VALUES (?, ?, ?)"
  ).run(url, JSON.stringify(data), Date.now());
}

function findMatchingMovie(raw: RawScrapedScreening, baseKey: string): MovieRow | null {
  if (raw.tmdbId) {
    const byTmdb = db
      .query<MovieRow, [number]>("SELECT * FROM movies WHERE tmdb_id = ? LIMIT 1")
      .get(raw.tmdbId);
    if (byTmdb) return byTmdb;
  }
  if (raw.imdbId) {
    const byImdb = db
      .query<MovieRow, [string]>("SELECT * FROM movies WHERE imdb_id = ? LIMIT 1")
      .get(raw.imdbId);
    if (byImdb) return byImdb;
  }

  const keysToTry = [baseKey];
  if (raw.originalTitle) {
    const origKey = canonicalizeTitle(raw.originalTitle);
    if (origKey && origKey !== baseKey) keysToTry.push(origKey);
  }

  for (const key of keysToTry) {
    const candidates = db
      .query<MovieRow, [string, string]>(
        "SELECT * FROM movies WHERE canonical_key = ? OR canonical_key LIKE ? || ':%'"
      )
      .all(key, key);
    for (const c of candidates) {
      if (
        raw.releaseYear &&
        c.release_year &&
        Math.abs(raw.releaseYear - c.release_year) > 2
      ) {
        continue;
      }
      return c;
    }
  }
  return null;
}

function upsertMovie(raw: RawScrapedScreening, cultEval: ReturnType<typeof evaluateCultSignals>): number {
  const displayTitle = cleanDisplayTitle(raw.title);
  const baseKey = canonicalizeTitle(displayTitle) || `movie-${Date.now()}`;
  const existing = findMatchingMovie(raw, baseKey);
  const nowIso = new Date().toISOString();
  const isLive = raw.isLiveBroadcast || isLiveBroadcastTitle(displayTitle, raw.genres) ? 1 : 0;

  if (existing) {
    const mergedReasons = [...new Set([...safeParseArray(existing.cult_reasons_json), ...cultEval.movieReasons])];
    // Prefer earlier year if neither is Letterboxd-locked, or trust Letterboxd year
    let nextYear = existing.release_year;
    if (raw.releaseYear) {
      if (!nextYear) {
        nextYear = raw.releaseYear;
      } else if (!existing.letterboxd_year && raw.releaseYear < nextYear) {
        nextYear = raw.releaseYear;
      }
    }
    const threshold = getCurrentParisYear() - 3;
    const baseReasons = mergedReasons.filter((r) => !r.startsWith("Film de "));
    if (nextYear && nextYear <= threshold && !isLive) {
      baseReasons.push(`Film de ${nextYear}`);
    }
    const finalReasons = [...new Set(baseReasons)];
    const nextIsCult = !isLive && (Boolean(existing.is_cult) || cultEval.isMovieCult || finalReasons.length > 0) ? 1 : 0;

    // Prefer cleaner display title (without Pathé "La séance Ciné Hits :" wrapper if an unwrapped version exists)
    const nextTitle =
      existing.title.length <= displayTitle.length && !/^(?:la séance|back to basic)/i.test(existing.title)
        ? existing.title
        : !/^(?:la séance|back to basic)/i.test(displayTitle)
          ? displayTitle
          : existing.title;

    db.query(
      `UPDATE movies SET
        title = ?,
        original_title = COALESCE(original_title, ?),
        director = COALESCE(director, ?),
        release_year = ?,
        duration_min = COALESCE(duration_min, ?),
        genres = COALESCE(genres, ?),
        synopsis = COALESCE(synopsis, ?),
        poster_url = COALESCE(poster_url, ?),
        tmdb_id = COALESCE(tmdb_id, ?),
        imdb_id = COALESCE(imdb_id, ?),
        is_cult = ?,
        cult_reasons_json = ?,
        is_live_broadcast = MAX(is_live_broadcast, ?),
        updated_at = ?
      WHERE id = ?`
    ).run(
      nextTitle,
      raw.originalTitle ? cleanDisplayTitle(raw.originalTitle) : null,
      raw.director?.trim() || null,
      nextYear,
      raw.durationMin && raw.durationMin > 0 ? raw.durationMin : null,
      raw.genres?.trim() || null,
      raw.synopsis?.trim() || null,
      raw.posterUrl?.trim() || null,
      raw.tmdbId || null,
      raw.imdbId || null,
      nextIsCult,
      JSON.stringify(finalReasons),
      isLive,
      nowIso,
      existing.id
    );
    return existing.id;
  }

  // Ensure unique canonical_key if same title + different year already exists
  let keyToInsert = baseKey;
  const collision = db
    .query<{ id: number }, [string]>("SELECT id FROM movies WHERE canonical_key = ?")
    .get(keyToInsert);
  if (collision) {
    keyToInsert = `${baseKey}:${raw.releaseYear || Date.now()}`;
  }

  const res = db
    .query(
      `INSERT INTO movies (
        canonical_key, title, original_title, director, release_year, duration_min,
        genres, synopsis, poster_url, tmdb_id, imdb_id,
        is_cult, cult_reasons_json, is_live_broadcast, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      keyToInsert,
      displayTitle,
      raw.originalTitle ? cleanDisplayTitle(raw.originalTitle) : null,
      raw.director?.trim() || null,
      raw.releaseYear ?? null,
      raw.durationMin && raw.durationMin > 0 ? raw.durationMin : null,
      raw.genres?.trim() || null,
      raw.synopsis?.trim() || null,
      raw.posterUrl?.trim() || null,
      raw.tmdbId ?? null,
      raw.imdbId ?? null,
      !isLive && cultEval.isMovieCult ? 1 : 0,
      JSON.stringify(cultEval.movieReasons),
      isLive,
      nowIso
    );
  return Number(res.lastInsertRowid);
}

export function saveCinemaScreenings(
  cinemaId: string,
  items: RawScrapedScreening[],
  durationMs: number
): number {
  const nowIso = new Date().toISOString();
  const todayStr = getParisDateStr(0);

  const tx = db.transaction(() => {
    // Delete current & future screenings for this cinema (also clean old past screenings > 2 days ago)
    const oldCutoff = getParisDateStr(-2);
    db.query("DELETE FROM screenings WHERE cinema_id = ? AND date >= ?").run(cinemaId, todayStr);
    db.query("DELETE FROM screenings WHERE date < ?").run(oldCutoff);

    const insertStmt = db.query(`
      INSERT OR REPLACE INTO screenings (
        id, cinema_id, movie_id, starts_at, ends_at, date, time,
        version, is_cine_concert, is_offsite, offsite_venue, room,
        labels_json, booking_url, is_cult_override, cult_reason_override, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seenIds = new Set<string>();
    let saved = 0;

    for (const raw of items) {
      if (!raw.title || !raw.date || !raw.time) continue;
      if (raw.date < todayStr) continue;

      const cultEval = evaluateCultSignals({
        title: raw.title,
        genres: raw.genres,
        releaseYear: raw.releaseYear,
        cinemaId,
        labels: raw.labels,
        isCineConcert: raw.isCineConcert,
        isCultOverride: raw.isCultOverride,
        cultReasonOverride: raw.cultReasonOverride,
        isLiveBroadcast: raw.isLiveBroadcast,
      });

      const movieId = upsertMovie(raw, cultEval);
      const startsAt = raw.startsAt || `${raw.date}T${raw.time}:00`;
      const endsAt = raw.endsAt || computeEndsAt(startsAt, raw.durationMin);
      const sid = `${cinemaId}:${raw.screeningId}`;
      if (seenIds.has(sid)) continue;
      seenIds.add(sid);

      insertStmt.run(
        sid,
        cinemaId,
        movieId,
        startsAt,
        endsAt,
        raw.date,
        raw.time,
        raw.version || "UNKNOWN",
        raw.isCineConcert ? 1 : 0,
        raw.isOffsite ? 1 : 0,
        raw.offsiteVenue ?? null,
        raw.room ?? null,
        JSON.stringify([...new Set(raw.labels ?? [])]),
        raw.bookingUrl ?? null,
        cultEval.isScreeningCultOverride ? 1 : 0,
        cultEval.screeningCultReason,
        nowIso
      );
      saved++;
    }

    db.query(
      `INSERT OR REPLACE INTO sync_logs (cinema_id, status, screenings_count, error_message, last_synced_at, duration_ms)
       VALUES (?, 'ok', ?, NULL, ?, ?)`
    ).run(cinemaId, saved, nowIso, durationMs);

    return saved;
  });

  return tx();
}

export function saveCinemaSyncError(cinemaId: string, errorMessage: string, durationMs: number): void {
  const existingCount =
    db
      .query<{ cnt: number }, [string, string]>(
        "SELECT COUNT(*) as cnt FROM screenings WHERE cinema_id = ? AND date >= ?"
      )
      .get(cinemaId, getParisDateStr(0))?.cnt ?? 0;

  db.query(
    `INSERT OR REPLACE INTO sync_logs (cinema_id, status, screenings_count, error_message, last_synced_at, duration_ms)
     VALUES (?, 'error', ?, ?, ?, ?)`
  ).run(cinemaId, existingCount, errorMessage, new Date().toISOString(), durationMs);
}

export function getCinemasWithSync(): CinemaWithSync[] {
  const logs = db.query<{
    cinema_id: string;
    status: string;
    screenings_count: number;
    error_message: string | null;
    last_synced_at: string | null;
    duration_ms: number | null;
  }, []>("SELECT * FROM sync_logs").all();

  const countRows = db
    .query<{ cinema_id: string; cnt: number }, [string]>(
      "SELECT cinema_id, COUNT(*) as cnt FROM screenings WHERE date >= ? GROUP BY cinema_id"
    )
    .all(getParisDateStr(0));

  const logMap = new Map(logs.map((l) => [l.cinema_id, l]));
  const countMap = new Map(countRows.map((r) => [r.cinema_id, r.cnt]));

  return CINEMAS.map((c) => {
    const l = logMap.get(c.id);
    return {
      ...c,
      status: (l?.status as "idle" | "ok" | "error") || "idle",
      screeningsCount: countMap.get(c.id) ?? l?.screenings_count ?? 0,
      errorMessage: l?.error_message ?? null,
      lastSyncedAt: l?.last_synced_at ?? null,
      durationMs: l?.duration_ms ?? null,
    };
  });
}

export type WatchlistItemInput = WatchlistStoredItem;
export { extractLetterboxdSlug };

function getSetting(key: string): string | null {
  return (
    db
      .query<{ value: string }, [string]>("SELECT value FROM app_settings WHERE key = ?")
      .get(key)?.value ?? null
  );
}

function setSetting(key: string, value: string): void {
  db.query("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(key, value);
}

function deleteSetting(key: string): void {
  db.query("DELETE FROM app_settings WHERE key = ?").run(key);
}

export function replaceWatchlist(
  items: WatchlistItemInput[],
  meta: { username: string | null; source: "letterboxd" | "csv"; syncedAt: string }
): void {
  const nowIso = meta.syncedAt || new Date().toISOString();
  const tx = db.transaction(() => {
    db.query("DELETE FROM watchlist_items").run();
    const insertStmt = db.query(`
      INSERT OR REPLACE INTO watchlist_items (
        id, slug, title, canonical_key, release_year, letterboxd_uri, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertStmt.run(
        item.id,
        item.slug,
        item.title,
        item.canonicalKey,
        item.releaseYear,
        item.letterboxdUri,
        nowIso
      );
    }

    setSetting("watchlist_source", meta.source);
    setSetting("watchlist_synced_at", nowIso);
    if (meta.username) {
      setSetting("watchlist_username", meta.username);
    } else {
      deleteSetting("watchlist_username");
    }
  });
  tx();
}

export function clearWatchlist(): void {
  const tx = db.transaction(() => {
    db.query("DELETE FROM watchlist_items").run();
    deleteSetting("watchlist_username");
    deleteSetting("watchlist_source");
    deleteSetting("watchlist_synced_at");
  });
  tx();
}

function loadWatchlistMatcher() {
  const rows = db
    .query<{ slug: string | null; canonical_key: string; release_year: number | null }, []>(
      "SELECT slug, canonical_key, release_year FROM watchlist_items"
    )
    .all();

  return createWatchlistMatcher(
    rows.map((row) => ({
      slug: row.slug,
      canonicalKey: row.canonical_key,
      releaseYear: row.release_year,
    }))
  );
}

export function getWatchlistStatus(): WatchlistStatus {
  const username = getSetting("watchlist_username");
  const sourceRaw = getSetting("watchlist_source");
  const source = sourceRaw === "letterboxd" || sourceRaw === "csv" ? sourceRaw : null;
  const lastSyncedAt = getSetting("watchlist_synced_at");
  const totalCount =
    db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM watchlist_items").get()?.cnt ?? 0;

  if (totalCount === 0) {
    return {
      username,
      source,
      totalCount: 0,
      lastSyncedAt,
      matchedMovies: [],
    };
  }

  const matchedScreenings = queryScreenings({
    from: getParisDateStr(0),
    cultOnly: false,
    includeOffsite: false,
    watchlistOnly: true,
  });

  return {
    username,
    source,
    totalCount,
    lastSyncedAt,
    matchedMovies: computeMatchedMovies(matchedScreenings),
  };
}

export interface ScreeningQueryFilters {
  from?: string;
  to?: string;
  cultOnly?: boolean;
  watchlistOnly?: boolean;
  versions?: Version[];
  cinemas?: string[];
  includeOffsite?: boolean;
  minRating?: number;
  q?: string;
}

export function queryScreenings(filters: ScreeningQueryFilters): ScreeningWithDetails[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  const fromDate = filters.from || getParisDateStr(0);
  where.push("s.date >= ?");
  params.push(fromDate);

  if (filters.to) {
    where.push("s.date <= ?");
    params.push(filters.to);
  }

  if (!filters.includeOffsite) {
    where.push("s.is_offsite = 0");
  }

  if (filters.cultOnly) {
    where.push("(m.is_cult = 1 OR s.is_cult_override = 1)");
  }

  if (filters.versions && filters.versions.length > 0) {
    const placeholders = filters.versions.map(() => "?").join(",");
    where.push(`s.version IN (${placeholders})`);
    params.push(...filters.versions);
  }

  if (filters.cinemas && filters.cinemas.length > 0) {
    const placeholders = filters.cinemas.map(() => "?").join(",");
    where.push(`s.cinema_id IN (${placeholders})`);
    params.push(...filters.cinemas);
  }

  if (filters.minRating && filters.minRating > 0) {
    where.push("m.letterboxd_rating >= ?");
    params.push(filters.minRating);
  }

  const sql = `
    SELECT
      s.*,
      m.id as m_id, m.canonical_key as m_canonical_key, m.title as m_title,
      m.original_title as m_original_title, m.director as m_director,
      m.release_year as m_release_year, m.duration_min as m_duration_min,
      m.genres as m_genres, m.synopsis as m_synopsis, m.poster_url as m_poster_url,
      m.tmdb_id as m_tmdb_id, m.imdb_id as m_imdb_id,
      m.letterboxd_url as m_letterboxd_url, m.letterboxd_rating as m_letterboxd_rating,
      m.letterboxd_votes as m_letterboxd_votes, m.is_cult as m_is_cult,
      m.cult_reasons_json as m_cult_reasons_json, m.is_live_broadcast as m_is_live_broadcast
    FROM screenings s
    JOIN movies m ON m.id = s.movie_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.date ASC, s.time ASC, m.title ASC
  `;

  const rows = db.query<Record<string, unknown>, (string | number)[]>(sql).all(...params);
  const wlMatcher = loadWatchlistMatcher();
  const qNorm = filters.q
    ? filters.q
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

  const out: ScreeningWithDetails[] = [];
  for (const r of rows) {
    const cinema = CINEMA_MAP.get(String(r.cinema_id));
    if (!cinema) continue;

    const letterboxdUrl = r.m_letterboxd_url ? String(r.m_letterboxd_url) : null;
    const canonicalKey = String(r.m_canonical_key);
    const originalTitle = r.m_original_title ? String(r.m_original_title) : null;
    const releaseYear = r.m_release_year ? Number(r.m_release_year) : null;

    const inWatchlist = wlMatcher.matches({
      letterboxdUrl,
      canonicalKey,
      originalTitle,
      releaseYear,
    });
    if (filters.watchlistOnly && !inWatchlist) continue;

    const movie: Movie = {
      id: Number(r.m_id),
      canonicalKey,
      title: String(r.m_title),
      originalTitle,
      director: r.m_director ? String(r.m_director) : null,
      releaseYear,
      durationMin: r.m_duration_min ? Number(r.m_duration_min) : null,
      genres: r.m_genres ? String(r.m_genres) : null,
      synopsis: r.m_synopsis ? String(r.m_synopsis) : null,
      posterUrl: r.m_poster_url ? String(r.m_poster_url) : null,
      tmdbId: r.m_tmdb_id ? Number(r.m_tmdb_id) : null,
      imdbId: r.m_imdb_id ? String(r.m_imdb_id) : null,
      letterboxdUrl,
      letterboxdRating: r.m_letterboxd_rating != null ? Number(r.m_letterboxd_rating) : null,
      letterboxdVotes: r.m_letterboxd_votes != null ? Number(r.m_letterboxd_votes) : null,
      isCult: Boolean(r.m_is_cult),
      cultReasons: safeParseArray(String(r.m_cult_reasons_json)),
      isLiveBroadcast: Boolean(r.m_is_live_broadcast),
      inWatchlist,
    };

    if (qNorm) {
      const searchable = `${movie.title} ${movie.originalTitle ?? ""} ${movie.director ?? ""} ${movie.cultReasons.join(" ")} ${String(r.labels_json)} ${String(r.cult_reason_override ?? "")}`
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (!searchable.includes(qNorm)) continue;
    }

    const isCultOverride = Boolean(r.is_cult_override);
    const cultReasonOverride = r.cult_reason_override ? String(r.cult_reason_override) : null;
    const effectiveCult = movie.isCult || isCultOverride;
    const effectiveCultReasons = [
      ...new Set([...movie.cultReasons, ...(cultReasonOverride ? [cultReasonOverride] : [])]),
    ];

    out.push({
      id: String(r.id),
      cinemaId: String(r.cinema_id),
      movieId: movie.id,
      startsAt: String(r.starts_at),
      endsAt: String(r.ends_at),
      date: String(r.date),
      time: String(r.time),
      version: String(r.version) as Version,
      isCineConcert: Boolean(r.is_cine_concert),
      isOffsite: Boolean(r.is_offsite),
      offsiteVenue: r.offsite_venue ? String(r.offsite_venue) : null,
      room: r.room ? String(r.room) : null,
      labels: safeParseArray(String(r.labels_json)),
      bookingUrl: r.booking_url ? String(r.booking_url) : null,
      isCultOverride,
      cultReasonOverride,
      movie,
      cinema,
      effectiveCult,
      effectiveCultReasons,
    });
  }

  return out;
}

export function getMoviesNeedingLetterboxd(limit = 300): Movie[] {
  const retryMissBefore = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const refreshHitBefore = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const today = getParisDateStr(0);

  const rows = db
    .query<MovieRow, [string, string, string, number]>(
      `SELECT DISTINCT m.* FROM movies m
       JOIN screenings s ON s.movie_id = m.id
       WHERE s.date >= ?
         AND m.is_live_broadcast = 0
         AND (
           m.letterboxd_checked_at IS NULL
           OR (m.letterboxd_url IS NULL AND m.letterboxd_checked_at < ?)
           OR (m.letterboxd_url IS NOT NULL AND m.letterboxd_checked_at < ?)
         )
       ORDER BY m.is_cult DESC, m.tmdb_id DESC, m.id ASC
       LIMIT ?`
    )
    .all(today, retryMissBefore, refreshHitBefore, limit);

  return rows.map(rowToMovie);
}

export function getMoviesNeedingLetterboxdPoster(): Movie[] {
  const today = getParisDateStr(0);
  const rows = db
    .query<MovieRow, [string]>(
      `SELECT DISTINCT m.* FROM movies m
       JOIN screenings s ON s.movie_id = m.id
       WHERE s.date >= ?
         AND m.letterboxd_url IS NOT NULL
         AND (m.poster_url IS NULL OR m.poster_url NOT LIKE '%ltrbxd%')
       ORDER BY m.is_cult DESC, m.id ASC`
    )
    .all(today);

  return rows.map(rowToMovie);
}

export function updateMovieLetterboxd(
  movieId: number,
  patch: {
    imdbId?: string | null;
    tmdbId?: number | null;
    letterboxdUrl: string | null;
    letterboxdRating: number | null;
    letterboxdVotes: number | null;
    originalYear?: number | null;
    posterUrl?: string | null;
  }
): void {
  const row = db
    .query<MovieRow, [number]>("SELECT * FROM movies WHERE id = ?")
    .get(movieId);
  if (!row) return;

  const reasons = safeParseArray(row.cult_reasons_json);
  let nextYear = row.release_year;
  let lbYear = row.letterboxd_year;

  if (patch.originalYear && patch.originalYear >= 1888 && patch.originalYear <= 2035) {
    lbYear = patch.originalYear;
    if (!nextYear || patch.originalYear < nextYear) {
      nextYear = patch.originalYear;
    }
  }

  const threshold = getCurrentParisYear() - 3;
  if (nextYear && nextYear <= threshold && !row.is_live_broadcast) {
    // Replace any newer "Film de ..." reason if we discovered the real earlier year
    const filtered = reasons.filter((r) => !r.startsWith("Film de "));
    filtered.push(`Film de ${nextYear}`);
    reasons.splice(0, reasons.length, ...new Set(filtered));
  }

  const isCult = !row.is_live_broadcast && (Boolean(row.is_cult) || reasons.length > 0) ? 1 : 0;

  db.query(
    `UPDATE movies SET
      imdb_id = COALESCE(imdb_id, ?),
      tmdb_id = COALESCE(tmdb_id, ?),
      letterboxd_url = COALESCE(?, letterboxd_url),
      letterboxd_rating = COALESCE(?, letterboxd_rating),
      letterboxd_votes = COALESCE(?, letterboxd_votes),
      letterboxd_year = COALESCE(?, letterboxd_year),
      release_year = ?,
      poster_url = COALESCE(?, poster_url),
      is_cult = ?,
      cult_reasons_json = ?,
      letterboxd_checked_at = ?,
      updated_at = ?
    WHERE id = ?`
  ).run(
    patch.imdbId ?? null,
    patch.tmdbId ?? null,
    patch.letterboxdUrl,
    patch.letterboxdRating,
    patch.letterboxdVotes,
    lbYear,
    nextYear,
    patch.posterUrl ?? null,
    isCult,
    JSON.stringify([...new Set(reasons)]),
    new Date().toISOString(),
    new Date().toISOString(),
    movieId
  );
}

export function getTotalUpcomingScreeningsCount(): number {
  return (
    db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM screenings WHERE date >= ?"
      )
      .get(getParisDateStr(0))?.cnt ?? 0
  );
}

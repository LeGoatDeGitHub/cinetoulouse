import type { Movie } from "../../shared/types";
import {
  getMoviesNeedingLetterboxd,
  getMoviesNeedingLetterboxdPoster,
  updateMovieLetterboxd,
} from "../db";
import {
  canonicalizeTitle,
  extractParentheticalTitle,
  stripParentheticalTitle,
} from "./normalize";
import { fetchJson, fetchWithTimeout, getCurrentParisYear, sleep } from "../scrapers/utils";

interface ImdbSuggestItem {
  id?: string;
  l?: string; // Title
  q?: string;
  qid?: string; // "movie" | "short" | "tvSeries"
  s?: string; // Cast / director string
  y?: number; // Year
  i?: { imageUrl?: string };
}

interface ImdbSuggestResponse {
  d?: ImdbSuggestItem[];
}

interface ParsedLetterboxd {
  url: string;
  rating: number | null;
  votes: number | null;
  originalYear: number | null;
  posterUrl: string | null;
  directors: string[];
}

function parseLetterboxdHtml(html: string, finalUrl: string): ParsedLetterboxd | null {
  const ldMatches = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    const cleaned = m[1]
      .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, "")
      .replace(/\/\*\s*\]\]>\s*\*\//g, "")
      .trim();
    try {
      const data = JSON.parse(cleaned);
      if (data["@type"] !== "Movie") continue;
      const ratingRaw = data.aggregateRating?.ratingValue;
      const votesRaw = data.aggregateRating?.ratingCount;
      const yearMatch = typeof data.dateCreated === "string" ? data.dateCreated.match(/^(\d{4})/) : null;
      const dirs: string[] = Array.isArray(data.director)
        ? data.director.map((d: { name?: string }) => d?.name || "").filter(Boolean)
        : [];
      return {
        url: data.url || data["@id"] || finalUrl,
        rating: typeof ratingRaw === "number" ? Math.round(ratingRaw * 100) / 100 : null,
        votes: typeof votesRaw === "number" ? votesRaw : null,
        originalYear: yearMatch ? Number(yearMatch[1]) : null,
        posterUrl: typeof data.image === "string" ? data.image : null,
        directors: dirs,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchLetterboxdByPath(path: string): Promise<ParsedLetterboxd | null> {
  const url = `https://letterboxd.com${path}`;
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 12000,
      retries: 1,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    if (!res.url.includes("/film/")) return null;
    const html = await res.text();
    return parseLetterboxdHtml(html, res.url);
  } catch {
    return null;
  }
}

async function searchImdbSuggestion(
  movie: Movie
): Promise<{ imdbId: string; requireDirectorVerify: boolean } | null> {
  const baseTitle = stripParentheticalTitle(movie.title);
  const isPossibleReissue =
    movie.isCult && Boolean(movie.releaseYear && movie.releaseYear >= getCurrentParisYear() - 1);
  const rawCandidates = [
    movie.originalTitle ? stripParentheticalTitle(movie.originalTitle) : "",
    extractParentheticalTitle(movie.title) || "",
    baseTitle,
    !isPossibleReissue && movie.releaseYear ? `${baseTitle} ${movie.releaseYear}` : "",
  ].filter(Boolean);

  const uniqueQueries = [...new Set(rawCandidates)];
  const directorLast = movie.director
    ? movie.director
        .split(",")[0]
        .trim()
        .split(/\s+/)
        .pop()
        ?.normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase() || ""
    : "";

  for (const query of uniqueQueries) {
    const slug = query
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (slug.length < 2) continue;
    const firstChar = slug[0];
    if (!/[a-z0-9]/.test(firstChar)) continue;

    try {
      const url = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(slug)}.json`;
      const data = await fetchJson<ImdbSuggestResponse>(url, { timeoutMs: 8000, retries: 1 });
      const items = (data.d || []).filter(
        (it) =>
          it.id?.startsWith("tt") &&
          (!it.qid || it.qid === "movie" || it.qid === "short" || it.qid === "tvMovie")
      );
      if (items.length === 0) continue;

      const queryCanon = canonicalizeTitle(baseTitle);
      let best: { item: ImdbSuggestItem; score: number; titleMatched: boolean } | null = null;

      for (const item of items) {
        if (!item.l) continue;
        let score = 0;
        let titleMatched = false;
        const itemCanon = canonicalizeTitle(item.l);
        if (itemCanon === queryCanon) {
          score += 55;
          titleMatched = true;
        } else if (itemCanon.includes(queryCanon) || queryCanon.includes(itemCanon)) {
          score += 22;
          titleMatched = true;
        } else if (movie.releaseYear && item.y && Math.abs(movie.releaseYear - item.y) <= 1) {
          // Localized French title returned an English/original IMDb result with matching year!
          score += 20;
        } else {
          continue;
        }

        if (directorLast && directorLast.length >= 3 && item.s) {
          const sNorm = item.s
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
          if (sNorm.includes(directorLast)) {
            score += 40;
          }
        }

        if (!isPossibleReissue && movie.releaseYear && item.y) {
          const diff = Math.abs(movie.releaseYear - item.y);
          if (diff === 0) score += 35;
          else if (diff === 1) score += 20;
          else if (diff > 2) score -= 45;
        } else if (isPossibleReissue && item.y && item.y <= getCurrentParisYear() - 3) {
          // Re-releases (e.g. Pathé Ciné Hits) list the 2026 event date instead of original release year
          score += 20;
        }

        if (!best || score > best.score) {
          best = { item, score, titleMatched };
        }
      }

      if (best && best.score >= 50 && best.item.id) {
        return {
          imdbId: best.item.id,
          requireDirectorVerify: !best.titleMatched,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveTmdbViaApi(movie: Movie): Promise<number | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const query = stripParentheticalTitle(movie.originalTitle || movie.title);
  try {
    const yearParam = movie.releaseYear ? `&year=${movie.releaseYear}` : "";
    const data = await fetchJson<{ results?: Array<{ id: number; release_date?: string }> }>(
      `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&language=fr-FR${yearParam}`,
      { timeoutMs: 8000, retries: 1 }
    );
    return data.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function enrichSingleMovieLetterboxd(movie: Movie): Promise<boolean> {
  let tmdbId = movie.tmdbId;
  let imdbId = movie.imdbId;
  let parsed: ParsedLetterboxd | null = null;

  if (movie.letterboxdUrl) {
    try {
      const p = new URL(movie.letterboxdUrl).pathname;
      if (p.includes("/film/")) {
        parsed = await fetchLetterboxdByPath(p);
      }
    } catch {
      // Ignore malformed stored URL
    }
  }

  if (!parsed && tmdbId) {
    parsed = await fetchLetterboxdByPath(`/tmdb/${tmdbId}/`);
  }

  if (!parsed && imdbId) {
    parsed = await fetchLetterboxdByPath(`/imdb/${imdbId}/`);
  }

  if (!parsed && !tmdbId && process.env.TMDB_API_KEY) {
    tmdbId = await resolveTmdbViaApi(movie);
    if (tmdbId) {
      parsed = await fetchLetterboxdByPath(`/tmdb/${tmdbId}/`);
    }
  }

  if (!parsed && !imdbId) {
    const suggest = await searchImdbSuggestion(movie);
    if (suggest) {
      const candidate = await fetchLetterboxdByPath(`/imdb/${suggest.imdbId}/`);
      if (candidate) {
        let verified = true;
        if (suggest.requireDirectorVerify && movie.director && candidate.directors.length > 0) {
          const movieDirLast = movie.director
            .split(",")[0]
            .trim()
            .split(/\s+/)
            .pop()
            ?.normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
          const lbDirs = candidate.directors
            .join(" ")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
          if (movieDirLast && movieDirLast.length >= 3 && !lbDirs.includes(movieDirLast)) {
            verified = false;
          }
        }
        if (verified) {
          imdbId = suggest.imdbId;
          parsed = candidate;
        }
      }
    }
  }

  updateMovieLetterboxd(movie.id, {
    tmdbId,
    imdbId,
    letterboxdUrl: parsed?.url ?? null,
    letterboxdRating: parsed?.rating ?? null,
    letterboxdVotes: parsed?.votes ?? null,
    originalYear: parsed?.originalYear ?? null,
    posterUrl: parsed?.posterUrl ?? null,
  });

  return Boolean(parsed);
}

export async function enrichMissingLetterboxd(
  onProgress?: (done: number, total: number) => void
): Promise<{ total: number; matched: number }> {
  const movies = getMoviesNeedingLetterboxd(300);
  const total = movies.length;
  if (total === 0) {
    onProgress?.(0, 0);
    return { total: 0, matched: 0 };
  }

  let done = 0;
  let matched = 0;
  let nextIdx = 0;
  const concurrency = 3;

  async function worker() {
    while (nextIdx < movies.length) {
      const m = movies[nextIdx++];
      const ok = await enrichSingleMovieLetterboxd(m);
      if (ok) matched++;
      done++;
      onProgress?.(done, total);
      await sleep(160);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );

  return { total, matched };
}

export async function backfillLetterboxdPosters(
  onProgress?: (done: number, total: number) => void
): Promise<{ total: number; updated: number }> {
  const movies = getMoviesNeedingLetterboxdPoster();
  const total = movies.length;
  if (total === 0) {
    onProgress?.(0, 0);
    return { total: 0, updated: 0 };
  }

  let done = 0;
  let updated = 0;
  let nextIdx = 0;
  const concurrency = 4;

  async function worker() {
    while (nextIdx < movies.length) {
      const m = movies[nextIdx++];
      if (m.letterboxdUrl) {
        try {
          const path = new URL(m.letterboxdUrl).pathname;
          const parsed = await fetchLetterboxdByPath(path);
          if (parsed?.posterUrl) {
            updateMovieLetterboxd(m.id, {
              letterboxdUrl: parsed.url,
              letterboxdRating: parsed.rating,
              letterboxdVotes: parsed.votes,
              originalYear: parsed.originalYear,
              posterUrl: parsed.posterUrl,
            });
            updated++;
          }
        } catch {
          // Ignore individual failures
        }
      }
      done++;
      onProgress?.(done, total);
      await sleep(100);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );

  return { total, updated };
}

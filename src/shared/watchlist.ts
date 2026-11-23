import type {
  ScreeningWithDetails,
  WatchlistMatchedMovie,
  WatchlistStoredItem,
} from "./types";

const PREFIX_PATTERNS = [
  /^(?:la\s+s[ée]ance\s+cin[ée]\s+hits|cin[ée]\s+hits|back\s+to\s+basic|il\s+[ée]tait\s+une\s+fois|s[ée]ance\s+sp[ée]ciale|les\s+rendez-vous\s+de\s+la\s+pop|cin[ée]-gourmand|avant-premi[èe]re(?:\s*(?:&|et)\s*rencontre)?)\s*[:•\-–]\s*/i,
];

const SUFFIX_PATTERNS = [
  /\s*pr[ée]c[ée]d[ée]\s+du\s+court[- ]m[ée]trage.*$/i,
  /\s*[-–]\s*version\s+longue$/i,
  /\s*\(version\s+longue\)$/i,
  /\s*\((?:4k|restaur[ée]e?|vf|vostf?r?|vo|tamoule|hindi|pendjabi|malayalam|t[ée]lougou)\)$/i,
  /\s*[-–]\s*(?:cin[ée]ma|th[ée][âa]tre|salle|universit[ée]|le\s+metronum).*$/i,
];

export class WatchlistInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "WatchlistInputError";
    this.status = status;
  }
}

export function extractLetterboxdSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/film\/([^/?#]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export function canonicalizeForWatchlist(raw: string): string {
  let t = raw.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  for (const re of PREFIX_PATTERNS) {
    t = t.replace(re, "");
  }
  for (const re of SUFFIX_PATTERNS) {
    t = t.replace(re, "");
  }
  const paren = t.match(/\(([^()]{3,60})\)\s*$/);
  if (
    paren &&
    !/^(?:vf|vost|vostfr|vo|4k|version longue|tamoule|hindi|restaur[ée]e?|\d{4})$/i.test(
      paren[1].trim()
    )
  ) {
    t = t.replace(/\s*\([^()]+\)\s*$/, "").trim();
  }
  return t
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeLetterboxdUsername(raw: string): string {
  let cleaned = raw.trim().replace(/^@+/, "");
  const urlMatch = cleaned.match(/^(?:https?:\/\/)?(?:www\.)?letterboxd\.com\/([^/?#]+)/i);
  if (urlMatch) {
    cleaned = urlMatch[1];
  }
  cleaned = cleaned.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/i.test(cleaned)) {
    throw new WatchlistInputError(
      "Pseudo Letterboxd invalide (ex: monpseudo ou https://letterboxd.com/monpseudo/).",
      400
    );
  }
  return cleaned;
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && clean[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

export function parseWatchlistCsv(csvText: string): WatchlistStoredItem[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new WatchlistInputError(
      "Aucun film détecté dans ce fichier CSV. Assure-toi d'importer le fichier watchlist.csv exporté depuis Letterboxd.",
      400
    );
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  const yearIdx = headers.indexOf("year");
  const uriIdx = headers.indexOf("letterboxd uri");

  if (nameIdx === -1) {
    throw new WatchlistInputError(
      "En-tête CSV invalide : colonne « Name » introuvable. Importe le fichier watchlist.csv exporté depuis Letterboxd.",
      400
    );
  }

  const deduped = new Map<string, WatchlistStoredItem>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[nameIdx]?.trim();
    if (!title) continue;

    const yearRaw = yearIdx >= 0 ? (row[yearIdx]?.trim() ?? "") : "";
    const releaseYear = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
    const letterboxdUri = uriIdx >= 0 && row[uriIdx]?.trim() ? row[uriIdx].trim() : null;
    const slug = extractLetterboxdSlug(letterboxdUri);
    const canonicalKey = canonicalizeForWatchlist(title);
    if (!canonicalKey && !slug) continue;

    const id = slug ? `lb:${slug}` : `csv:${canonicalKey}:${releaseYear ?? ""}`;
    deduped.set(id, {
      id,
      slug,
      title,
      canonicalKey: canonicalKey || slug || id,
      releaseYear,
      letterboxdUri,
    });
  }

  const items = [...deduped.values()];
  if (items.length === 0) {
    throw new WatchlistInputError(
      "Aucun film détecté dans ce fichier CSV. Assure-toi d'importer le fichier watchlist.csv exporté depuis Letterboxd.",
      400
    );
  }

  return items;
}

export function createWatchlistMatcher(
  items: Array<Pick<WatchlistStoredItem, "slug" | "canonicalKey" | "releaseYear">>
) {
  const slugs = new Set<string>();
  const byKey = new Map<string, Array<number | null>>();

  for (const item of items) {
    if (item.slug) slugs.add(item.slug.toLowerCase());
    if (item.canonicalKey && item.canonicalKey.length >= 2) {
      const years = byKey.get(item.canonicalKey) ?? [];
      years.push(item.releaseYear ?? null);
      byKey.set(item.canonicalKey, years);
    }
  }

  return {
    isEmpty: slugs.size === 0 && byKey.size === 0,
    matches(movie: {
      letterboxdUrl: string | null;
      canonicalKey: string;
      originalTitle: string | null;
      releaseYear: number | null;
    }): boolean {
      if (slugs.size === 0 && byKey.size === 0) return false;

      const slug = extractLetterboxdSlug(movie.letterboxdUrl);
      if (slug && slugs.has(slug)) return true;

      const candidateKeys = new Set<string>();
      const baseKey = movie.canonicalKey.split(":")[0];
      if (baseKey && baseKey.length >= 2) candidateKeys.add(baseKey);
      if (movie.originalTitle) {
        const origKey = canonicalizeForWatchlist(movie.originalTitle);
        if (origKey && origKey.length >= 2) candidateKeys.add(origKey);
      }
      if (slug) {
        const slugText = slug.replace(/-\d{4}$/, "").replace(/-/g, " ");
        const slugKey = canonicalizeForWatchlist(slugText);
        if (slugKey && slugKey.length >= 2) candidateKeys.add(slugKey);
      }

      for (const key of candidateKeys) {
        const itemYears = byKey.get(key);
        if (!itemYears) continue;
        for (const itemYear of itemYears) {
          if (
            itemYear == null ||
            movie.releaseYear == null ||
            Math.abs(movie.releaseYear - itemYear) <= 1
          ) {
            return true;
          }
        }
      }

      return false;
    },
  };
}

export function computeMatchedMovies(
  screenings: ScreeningWithDetails[]
): WatchlistMatchedMovie[] {
  const byMovie = new Map<number, WatchlistMatchedMovie>();
  for (const s of screenings) {
    if (!s.movie.inWatchlist) continue;
    let entry = byMovie.get(s.movie.id);
    if (!entry) {
      entry = {
        movieId: s.movie.id,
        title: s.movie.title,
        releaseYear: s.movie.releaseYear,
        posterUrl: s.movie.posterUrl,
        letterboxdRating: s.movie.letterboxdRating,
        letterboxdUrl: s.movie.letterboxdUrl,
        isCult: s.effectiveCult,
        screeningsCount: 0,
        nextScreeningAt: s.startsAt,
        cinemas: [],
      };
      byMovie.set(s.movie.id, entry);
    }
    entry.screeningsCount += 1;
    entry.isCult = entry.isCult || s.effectiveCult;
    if (s.startsAt < entry.nextScreeningAt) {
      entry.nextScreeningAt = s.startsAt;
    }
    if (!entry.cinemas.includes(s.cinema.shortName)) {
      entry.cinemas.push(s.cinema.shortName);
    }
  }

  return [...byMovie.values()].sort((a, b) =>
    a.nextScreeningAt.localeCompare(b.nextScreeningAt)
  );
}

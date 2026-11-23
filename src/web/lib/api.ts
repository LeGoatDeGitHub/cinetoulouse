import type {
  CinemaWithSync,
  ScreeningWithDetails,
  StaticProgramSnapshot,
  SyncStatus,
  Version,
  WatchlistStatus,
  WatchlistStoredItem,
} from "../../shared/types";
import {
  computeMatchedMovies,
  createWatchlistMatcher,
  parseWatchlistCsv,
} from "../../shared/watchlist";

export interface ScreeningsParams {
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

const IS_STATIC_MODE = typeof __IS_VERCEL__ !== "undefined" && __IS_VERCEL__;
const WATCHLIST_STORAGE_KEY = "cinetoulouse.watchlist.v1";

interface StoredWatchlistState {
  username: string | null;
  source: "letterboxd" | "csv";
  syncedAt: string;
  items: WatchlistStoredItem[];
}

let staticProgramPromise: Promise<StaticProgramSnapshot> | null = null;

function getTodayParisClient(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

function readStoredWatchlist(): StoredWatchlistState | null {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWatchlistState;
    if (!Array.isArray(parsed?.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredWatchlist(state: StoredWatchlistState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    } else {
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function loadStaticProgram(force = false): Promise<StaticProgramSnapshot> {
  if (!staticProgramPromise || force) {
    const url = force ? `/data/program.json?t=${Date.now()}` : "/data/program.json";
    staticProgramPromise = fetch(url).then(async (res) => {
      if (!res.ok) {
        staticProgramPromise = null;
        throw new Error(`Impossible de charger la programmation (${res.status})`);
      }
      return (await res.json()) as StaticProgramSnapshot;
    });
  }
  return staticProgramPromise;
}

function buildStaticSyncStatus(snapshot: StaticProgramSnapshot): SyncStatus {
  const okCount = snapshot.cinemas.filter((c) => c.status === "ok").length;
  return {
    inProgress: false,
    stage: "done",
    startedAt: snapshot.generatedAt,
    finishedAt: snapshot.generatedAt,
    cinemasDone: okCount,
    cinemasTotal: snapshot.cinemas.length,
    letterboxdDone: 0,
    letterboxdTotal: 0,
    cinemas: snapshot.cinemas,
  };
}

function queryStaticScreenings(
  snapshot: StaticProgramSnapshot,
  params: ScreeningsParams
): ScreeningWithDetails[] {
  const cinemaMap = new Map(snapshot.cinemas.map((c) => [c.id, c]));
  const storedWl = readStoredWatchlist();
  const wlMatcher = createWatchlistMatcher(storedWl?.items ?? []);

  const fromDate = params.from || getTodayParisClient();
  const qNorm = params.q
    ? params.q
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

  const out: ScreeningWithDetails[] = [];
  for (const s of snapshot.screenings) {
    if (s.date < fromDate) continue;
    if (params.to && s.date > params.to) continue;
    if (!params.includeOffsite && s.isOffsite) continue;
    if (params.versions && params.versions.length > 0 && !params.versions.includes(s.version)) {
      continue;
    }
    if (params.cinemas && params.cinemas.length > 0 && !params.cinemas.includes(s.cinemaId)) {
      continue;
    }

    const baseMovie = snapshot.movies[s.movieId];
    const cinema = cinemaMap.get(s.cinemaId);
    if (!baseMovie || !cinema) continue;

    if (
      params.minRating &&
      params.minRating > 0 &&
      (baseMovie.letterboxdRating == null || baseMovie.letterboxdRating < params.minRating)
    ) {
      continue;
    }

    const effectiveCult = baseMovie.isCult || s.isCultOverride;
    if (params.cultOnly && !effectiveCult) continue;

    const inWatchlist = wlMatcher.matches({
      letterboxdUrl: baseMovie.letterboxdUrl,
      canonicalKey: baseMovie.canonicalKey,
      originalTitle: baseMovie.originalTitle,
      releaseYear: baseMovie.releaseYear,
    });
    if (params.watchlistOnly && !inWatchlist) continue;

    if (qNorm) {
      const searchable = `${baseMovie.title} ${baseMovie.originalTitle ?? ""} ${baseMovie.director ?? ""} ${baseMovie.cultReasons.join(" ")} ${JSON.stringify(s.labels)} ${s.cultReasonOverride ?? ""}`
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (!searchable.includes(qNorm)) continue;
    }

    const effectiveCultReasons = [
      ...new Set([
        ...baseMovie.cultReasons,
        ...(s.cultReasonOverride ? [s.cultReasonOverride] : []),
      ]),
    ];

    out.push({
      ...s,
      movie: {
        ...baseMovie,
        inWatchlist,
      },
      cinema,
      effectiveCult,
      effectiveCultReasons,
    });
  }

  return out;
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errData = (await res.json()) as { error?: string };
      if (errData?.error) message = errData.error;
    } catch {
      // Ignore invalid JSON error bodies
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchCinemas(): Promise<CinemaWithSync[]> {
  if (IS_STATIC_MODE) {
    const snapshot = await loadStaticProgram();
    return snapshot.cinemas;
  }
  const res = await fetch("/api/cinemas");
  const data = await parseApiResponse<{ cinemas: CinemaWithSync[] }>(res);
  return data.cinemas;
}

export async function fetchScreenings(
  params: ScreeningsParams
): Promise<{ screenings: ScreeningWithDetails[]; total: number }> {
  if (IS_STATIC_MODE) {
    const snapshot = await loadStaticProgram();
    const screenings = queryStaticScreenings(snapshot, params);
    return { screenings, total: screenings.length };
  }

  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.cultOnly !== undefined) qs.set("cultOnly", String(params.cultOnly));
  if (params.watchlistOnly) qs.set("watchlistOnly", "true");
  if (params.versions && params.versions.length > 0) {
    qs.set("versions", params.versions.join(","));
  }
  if (params.cinemas && params.cinemas.length > 0) {
    qs.set("cinemas", params.cinemas.join(","));
  }
  if (params.includeOffsite) qs.set("includeOffsite", "true");
  if (params.minRating && params.minRating > 0) {
    qs.set("minRating", String(params.minRating));
  }
  if (params.q && params.q.trim()) qs.set("q", params.q.trim());

  const res = await fetch(`/api/screenings?${qs.toString()}`);
  return parseApiResponse<{ screenings: ScreeningWithDetails[]; total: number }>(res);
}

export async function triggerRefresh(): Promise<SyncStatus> {
  if (IS_STATIC_MODE) {
    const snapshot = await loadStaticProgram(true);
    return buildStaticSyncStatus(snapshot);
  }
  const res = await fetch("/api/refresh", { method: "POST" });
  return parseApiResponse<SyncStatus>(res);
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  if (IS_STATIC_MODE) {
    const snapshot = await loadStaticProgram();
    return buildStaticSyncStatus(snapshot);
  }
  const res = await fetch("/api/sync/status");
  return parseApiResponse<SyncStatus>(res);
}

export async function fetchWatchlistStatus(): Promise<WatchlistStatus> {
  if (IS_STATIC_MODE) {
    const stored = readStoredWatchlist();
    if (!stored || stored.items.length === 0) {
      return {
        username: stored?.username ?? null,
        source: stored?.source ?? null,
        totalCount: 0,
        lastSyncedAt: stored?.syncedAt ?? null,
        matchedMovies: [],
      };
    }

    const snapshot = await loadStaticProgram();
    const matchedScreenings = queryStaticScreenings(snapshot, {
      from: getTodayParisClient(),
      cultOnly: false,
      includeOffsite: false,
      watchlistOnly: true,
    });

    return {
      username: stored.username,
      source: stored.source,
      totalCount: stored.items.length,
      lastSyncedAt: stored.syncedAt,
      matchedMovies: computeMatchedMovies(matchedScreenings),
    };
  }

  const res = await fetch("/api/watchlist");
  return parseApiResponse<WatchlistStatus>(res);
}

export async function syncWatchlist(
  username: string
): Promise<WatchlistStatus & { truncated?: boolean }> {
  const res = await fetch("/api/watchlist/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

  if (IS_STATIC_MODE) {
    const payload = await parseApiResponse<{
      username: string;
      source: "letterboxd";
      syncedAt: string;
      totalCount: number;
      truncated?: boolean;
      items: WatchlistStoredItem[];
    }>(res);

    writeStoredWatchlist({
      username: payload.username,
      source: payload.source,
      syncedAt: payload.syncedAt,
      items: payload.items,
    });
    const status = await fetchWatchlistStatus();
    return { ...status, truncated: payload.truncated };
  }

  return parseApiResponse<WatchlistStatus & { truncated?: boolean }>(res);
}

export async function importWatchlistCsv(csv: string): Promise<WatchlistStatus> {
  if (IS_STATIC_MODE) {
    const items = parseWatchlistCsv(csv);
    writeStoredWatchlist({
      username: null,
      source: "csv",
      syncedAt: new Date().toISOString(),
      items,
    });
    return fetchWatchlistStatus();
  }

  const res = await fetch("/api/watchlist/import-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv }),
  });
  return parseApiResponse<WatchlistStatus>(res);
}

export async function clearWatchlist(): Promise<WatchlistStatus> {
  if (IS_STATIC_MODE) {
    writeStoredWatchlist(null);
    return {
      username: null,
      source: null,
      totalCount: 0,
      lastSyncedAt: null,
      matchedMovies: [],
    };
  }

  const res = await fetch("/api/watchlist", { method: "DELETE" });
  return parseApiResponse<WatchlistStatus>(res);
}

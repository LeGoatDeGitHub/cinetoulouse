export type Version = "VOSTFR" | "VF" | "MUET" | "UNKNOWN";
export type CinemaZone = "centre" | "metropole";

export interface Cinema {
  id: string;
  name: string;
  shortName: string;
  zone: CinemaZone;
  address: string;
  city: string;
  websiteUrl: string;
  color: string;
  isArtEtEssai: boolean;
}

export interface CinemaWithSync extends Cinema {
  status: "idle" | "ok" | "error";
  screeningsCount: number;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  durationMs: number | null;
}

export interface Movie {
  id: number;
  canonicalKey: string;
  title: string;
  originalTitle: string | null;
  director: string | null;
  releaseYear: number | null;
  durationMin: number | null;
  genres: string | null;
  synopsis: string | null;
  posterUrl: string | null;
  tmdbId: number | null;
  imdbId: string | null;
  letterboxdUrl: string | null;
  letterboxdRating: number | null;
  letterboxdVotes: number | null;
  isCult: boolean;
  cultReasons: string[];
  isLiveBroadcast: boolean;
  inWatchlist: boolean;
}

export interface WatchlistMatchedMovie {
  movieId: number;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  letterboxdRating: number | null;
  letterboxdUrl: string | null;
  isCult: boolean;
  screeningsCount: number;
  nextScreeningAt: string;
  cinemas: string[];
}

export interface WatchlistStoredItem {
  id: string;
  slug: string | null;
  title: string;
  canonicalKey: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
}

export interface WatchlistStatus {
  username: string | null;
  source: "letterboxd" | "csv" | null;
  totalCount: number;
  lastSyncedAt: string | null;
  matchedMovies: WatchlistMatchedMovie[];
}

export interface StaticProgramSnapshot {
  generatedAt: string;
  cinemas: CinemaWithSync[];
  movies: Record<number, Movie>;
  screenings: Screening[];
}

export interface Screening {
  id: string;
  cinemaId: string;
  movieId: number;
  startsAt: string; // YYYY-MM-DDTHH:mm:00
  endsAt: string; // YYYY-MM-DDTHH:mm:00
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  version: Version;
  isCineConcert: boolean;
  isOffsite: boolean;
  offsiteVenue: string | null;
  room: string | null;
  labels: string[];
  bookingUrl: string | null;
  isCultOverride: boolean;
  cultReasonOverride: string | null;
}

export interface ScreeningWithDetails extends Screening {
  movie: Movie;
  cinema: Cinema;
  effectiveCult: boolean;
  effectiveCultReasons: string[];
}

export interface SyncStatus {
  inProgress: boolean;
  stage: "idle" | "scraping" | "enriching" | "done";
  startedAt: string | null;
  finishedAt: string | null;
  cinemasDone: number;
  cinemasTotal: number;
  letterboxdDone: number;
  letterboxdTotal: number;
  cinemas: CinemaWithSync[];
}

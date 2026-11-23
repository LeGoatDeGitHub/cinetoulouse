import type { Version } from "../../shared/types";

export interface RawScrapedScreening {
  cinemaId: string;
  screeningId: string;
  title: string;
  originalTitle?: string | null;
  director?: string | null;
  releaseYear?: number | null;
  durationMin?: number | null;
  genres?: string | null;
  synopsis?: string | null;
  posterUrl?: string | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  startsAt: string; // YYYY-MM-DDTHH:mm:00
  endsAt?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  version: Version;
  isCineConcert?: boolean;
  isOffsite?: boolean;
  offsiteVenue?: string | null;
  room?: string | null;
  labels?: string[];
  bookingUrl?: string | null;
  isCultOverride?: boolean;
  cultReasonOverride?: string | null;
  isLiveBroadcast?: boolean;
}

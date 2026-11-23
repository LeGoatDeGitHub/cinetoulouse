import type { Version } from "../../shared/types";
import type { RawScrapedScreening } from "./types";
import { extractYear, fetchJson, getParisDateStr, stripHtml } from "./utils";

interface WebediaShowtime {
  id: string;
  startsAt: string;
  tags?: string[];
  isExpired?: boolean;
  data?: {
    ticketing?: Array<{ urls?: string[]; provider?: string }>;
  };
  screen?: { name?: string };
}

interface WebediaScheduleResponse {
  [theaterId: string]: {
    schedule?: {
      [movieId: string]: {
        [date: string]: WebediaShowtime[];
      };
    };
  };
}

interface WebediaMovie {
  id: string;
  title: string;
  originalTitle?: string;
  runtime?: number; // seconds
  genres?: string;
  poster?: string;
  synopsis?: string;
  direction?: string[];
  releases?: Array<{ releasedAt?: string }>;
  release?: string;
}

interface WebediaEvent {
  id: string;
  title: string;
  type?: string;
  description?: string;
  path?: string;
}

function mapVersion(tags: string[] = []): Version {
  if (tags.includes("Localization.Version.Original")) return "VOSTFR";
  if (tags.includes("Localization.Language.French") || tags.includes("Showtime.Accessibility.Dubbed")) {
    return "VF";
  }
  return "UNKNOWN";
}

export async function scrapeWebedia(params: {
  cinemaId: string;
  baseUrl: string;
  theaterId: string;
}): Promise<RawScrapedScreening[]> {
  const from = `${getParisDateStr(0)}T03:00:00`;
  const to = `${getParisDateStr(15)}T03:00:00`;
  const theatersParam = encodeURIComponent(
    JSON.stringify({ id: params.theaterId, timeZone: "Europe/Paris" })
  );

  const scheduleUrl = `${params.baseUrl}/api/gatsby-source-boxofficeapi/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&theaters=${theatersParam}`;

  const [schedResp, eventsResp] = await Promise.all([
    fetchJson<WebediaScheduleResponse>(scheduleUrl),
    fetchJson<WebediaEvent[]>(`${params.baseUrl}/api/gatsby-source-boxofficeapi/events`).catch(
      () => [] as WebediaEvent[]
    ),
  ]);

  const theaterSchedule = schedResp?.[params.theaterId]?.schedule || {};
  const movieIds = Object.keys(theaterSchedule);
  if (movieIds.length === 0) return [];

  // Batch fetch movie details in chunks of 30
  const moviesMap = new Map<string, WebediaMovie>();
  for (let i = 0; i < movieIds.length; i += 30) {
    const chunk = movieIds.slice(i, i + 30);
    const qs = chunk.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
    const movies = await fetchJson<WebediaMovie[]>(
      `${params.baseUrl}/api/gatsby-source-boxofficeapi/movies?basic=false&castingLimit=3&${qs}`
    );
    for (const m of movies) {
      moviesMap.set(String(m.id), m);
    }
  }

  const eventSummaries = (Array.isArray(eventsResp) ? eventsResp : []).map((ev) => ({
    title: ev.title,
    type: ev.type || "",
    haystack: `${ev.title} ${stripHtml(ev.description || "")}`.toLowerCase(),
  }));

  const out: RawScrapedScreening[] = [];

  for (const [movieId, byDate] of Object.entries(theaterSchedule)) {
    const movie = moviesMap.get(movieId);
    if (!movie) continue;

    const durationMin = movie.runtime ? Math.round(movie.runtime / 60) : null;
    const releaseYear =
      extractYear(movie.releases?.[0]?.releasedAt?.slice(0, 4)) ??
      extractYear(movie.release?.slice(0, 4));
    const director = movie.direction?.join(", ") || null;

    const titleLower = movie.title.toLowerCase();
    const matchedEvents = eventSummaries
      .filter((ev) => ev.haystack.includes(titleLower))
      .map((ev) => ev.title);

    for (const showtimes of Object.values(byDate)) {
      for (const st of showtimes) {
        if (st.isExpired) continue;
        const dtMatch = st.startsAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        if (!dtMatch) continue;
        const [, date, time] = dtMatch;

        const tags = st.tags || [];
        const labels = [...matchedEvents];
        if (tags.includes("Showtime.Accessibility.HearingImpaired")) labels.push("ST-SME");
        if (tags.includes("Auditorium.Experience.DolbyAtmos")) labels.push("Dolby Atmos");
        if (tags.includes("Auditorium.Experience.ICE")) labels.push("ICE");
        if (tags.includes("Format.Projection.3D")) labels.push("3D");

        const bookingUrl =
          st.data?.ticketing?.find((t) => t.provider === "default")?.urls?.[0] ||
          st.data?.ticketing?.[0]?.urls?.[0] ||
          null;

        out.push({
          cinemaId: params.cinemaId,
          screeningId: st.id || `${movieId}-${st.startsAt}`,
          title: movie.title,
          originalTitle:
            movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : null,
          director,
          releaseYear,
          durationMin,
          genres: movie.genres || null,
          synopsis: movie.synopsis || null,
          posterUrl: movie.poster || null,
          startsAt: `${date}T${time}:00`,
          date,
          time,
          version: mapVersion(tags),
          room: st.screen?.name || null,
          labels,
          bookingUrl,
        });
      }
    }
  }

  return out;
}

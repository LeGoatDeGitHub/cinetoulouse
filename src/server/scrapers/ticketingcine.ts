import type { Version } from "../../shared/types";
import type { RawScrapedScreening } from "./types";
import { extractYear, fetchJson } from "./utils";

interface TicketingSession {
  id: string;
  date: string; // YYYYMMDDHHmm
  version?: string;
  features?: string[];
  hall_name?: string;
  booking_url?: string;
}

interface TicketingEvent {
  id: string;
  title: string;
  title_ori?: string;
  director?: string;
  release_date?: string;
  prod_year?: string;
  localized_genres?: string;
  synopsis?: string;
  bill_url?: string;
  duration?: number;
  tmdb_id?: number;
  imdb_id?: string;
  art_et_essai_patrimoine?: boolean;
  sessions?: TicketingSession[];
}

interface TicketingResponse {
  result?: {
    schedule?: {
      events?: TicketingEvent[];
    };
  };
}

function mapVersion(session: TicketingSession): Version {
  const v = (session.version || "").toUpperCase();
  if (v.includes("VOST") || v === "VO") return "VOSTFR";
  if (v.includes("VF")) return "VF";
  const feats = session.features || [];
  if (feats.includes("vo") || feats.includes("vost")) return "VOSTFR";
  if (feats.includes("vf")) return "VF";
  return "UNKNOWN";
}

function parseSessionDate(raw: string): { date: string; time: string; startsAt: string } | null {
  if (!/^\d{12}$/.test(raw)) return null;
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const hh = raw.slice(8, 10);
  const mm = raw.slice(10, 12);
  const date = `${y}-${m}-${d}`;
  const time = `${hh}:${mm}`;
  return { date, time, startsAt: `${date}T${time}:00` };
}

export async function scrapeTicketingCine(params: {
  cinemaId: string;
  siteId: string;
  origin: string;
}): Promise<RawScrapedScreening[]> {
  const res = await fetchJson<TicketingResponse>("https://ws.ticketingcine.com/site", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: params.origin,
      Referer: `${params.origin}/`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "get_prog",
      params: { site_id: params.siteId },
    }),
  });

  const events = res?.result?.schedule?.events || [];
  const out: RawScrapedScreening[] = [];

  for (const ev of events) {
    const releaseYear = extractYear(ev.prod_year) ?? extractYear(ev.release_date?.slice(0, 4));
    for (const s of ev.sessions || []) {
      const parsed = parseSessionDate(s.date);
      if (!parsed) continue;

      const labels: string[] = [];
      if (ev.art_et_essai_patrimoine) labels.push("Patrimoine");
      const feats = s.features || [];
      if (feats.includes("preview")) labels.push("Avant-première");
      if (feats.includes("only_session")) labels.push("Séance unique");
      if (feats.includes("subtitle_ocap")) labels.push("ST-SME");
      if (feats.includes("audio_vi")) labels.push("Audiodescription");

      out.push({
        cinemaId: params.cinemaId,
        screeningId: s.id || `${ev.id}-${s.date}`,
        title: ev.title,
        originalTitle: ev.title_ori && ev.title_ori !== ev.title ? ev.title_ori : null,
        director: ev.director || null,
        releaseYear,
        durationMin: ev.duration || null,
        genres: ev.localized_genres || null,
        synopsis: ev.synopsis || null,
        posterUrl: ev.bill_url || null,
        tmdbId: ev.tmdb_id || null,
        imdbId: ev.imdb_id || null,
        startsAt: parsed.startsAt,
        date: parsed.date,
        time: parsed.time,
        version: mapVersion(s),
        room: s.hall_name || null,
        labels,
        bookingUrl: s.booking_url || null,
      });
    }
  }

  return out;
}

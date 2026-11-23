import type { Version } from "../../shared/types";
import { getCachedPage, setCachedPage } from "../db";
import type { RawScrapedScreening } from "./types";
import {
  extractYear,
  fetchJson,
  getParisDateStr,
  mapWithConcurrency,
  stripHtml,
} from "./utils";

interface PatheCinemaShowsResponse {
  shows: Record<
    string,
    {
      days?: Record<
        string,
        {
          versions?: string[];
          flag?: string | null;
          specialShowtime?: boolean;
          labelCategory?: string | null;
        }
      >;
    }
  >;
}

interface PatheShowDetail {
  slug: string;
  title: string;
  originalTitle?: string;
  directors?: string;
  duration?: number;
  genres?: string[];
  synopsis?: string;
  posterPath?: { md?: string; lg?: string };
  releaseAt?: { FR_FR?: string };
  isMovie?: boolean;
}

interface PatheShowtime {
  time: string; // "2026-11-23 10:30:00"
  endTime?: string;
  version?: string; // "vost" | "vf" | "vfst"
  tags?: string[];
  status?: string;
  refCmd?: string;
  auditoriumName?: string;
}

function mapVersion(v?: string): Version {
  const low = (v || "").toLowerCase();
  if (low === "vost" || low === "vo") return "VOSTFR";
  if (low === "vf" || low === "vfst") return "VF";
  return "UNKNOWN";
}

async function getShowDetailCached(slug: string): Promise<PatheShowDetail | null> {
  const url = `https://www.pathe.fr/api/show/${encodeURIComponent(slug)}?language=fr`;
  const cached = getCachedPage<PatheShowDetail>(url);
  if (cached) return cached;
  try {
    const detail = await fetchJson<PatheShowDetail>(url, {
      headers: { Referer: "https://www.pathe.fr/" },
    });
    setCachedPage(url, detail);
    return detail;
  } catch {
    return null;
  }
}

export async function scrapePathe(params: {
  cinemaId: string;
  cinemaSlug: string;
}): Promise<RawScrapedScreening[]> {
  const fromDate = getParisDateStr(0);
  const toDate = getParisDateStr(14);

  const showsResp = await fetchJson<PatheCinemaShowsResponse>(
    `https://www.pathe.fr/api/cinema/${params.cinemaSlug}/shows?language=fr`,
    { headers: { Referer: `https://www.pathe.fr/cinemas/${params.cinemaSlug}` } }
  );

  const pairs: Array<{ showSlug: string; date: string; flag: string | null }> = [];
  const uniqueSlugs = new Set<string>();

  for (const [showSlug, info] of Object.entries(showsResp.shows || {})) {
    for (const [date, dayInfo] of Object.entries(info.days || {})) {
      if (date >= fromDate && date <= toDate) {
        uniqueSlugs.add(showSlug);
        pairs.push({ showSlug, date, flag: dayInfo.flag ?? null });
      }
    }
  }

  const detailMap = new Map<string, PatheShowDetail>();
  await mapWithConcurrency([...uniqueSlugs], 6, async (slug) => {
    const d = await getShowDetailCached(slug);
    if (d) detailMap.set(slug, d);
  });

  const out: RawScrapedScreening[] = [];

  await mapWithConcurrency(pairs, 6, async ({ showSlug, date, flag }) => {
    const detail = detailMap.get(showSlug);
    if (!detail) return;

    let showtimes: PatheShowtime[] = [];
    try {
      showtimes = await fetchJson<PatheShowtime[]>(
        `https://www.pathe.fr/api/show/${encodeURIComponent(showSlug)}/showtimes/${params.cinemaSlug}/${date}?language=fr`,
        { headers: { Referer: `https://www.pathe.fr/cinemas/${params.cinemaSlug}` } }
      );
    } catch {
      return;
    }

    const releaseYear = extractYear(detail.releaseAt?.FR_FR?.slice(0, 4));
    const genres = detail.genres?.join(", ") || null;
    const isLiveBroadcast =
      detail.isMovie === false &&
      !/cin[ée]\s*hits|back\s*to\s*basic|il\s*[ée]tait\s*une\s*fois|version\s*longue/i.test(
        detail.title
      );

    for (const st of showtimes) {
      const m = st.time?.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
      if (!m) continue;
      const [, stDate, stTime] = m;
      const endM = st.endTime?.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);

      const labels: string[] = [];
      if (flag) labels.push(flag);
      if (/cin[ée]\s*hits/i.test(detail.title)) labels.push("Ciné Hits");
      if (/back\s*to\s*basic/i.test(detail.title)) labels.push("Back to Basic");
      if (/il\s*[ée]tait\s*une\s*fois/i.test(detail.title)) labels.push("Il était une fois");

      const tags = st.tags || [];
      if (tags.includes("imax")) labels.push("IMAX");
      if (tags.includes("4dx")) labels.push("4DX");
      if (tags.includes("dolby")) labels.push("Dolby");

      out.push({
        cinemaId: params.cinemaId,
        screeningId: `${showSlug}-${stDate}T${stTime}-${st.version || "x"}-${st.auditoriumName || "0"}`,
        title: detail.title,
        originalTitle:
          detail.originalTitle && detail.originalTitle !== detail.title
            ? detail.originalTitle
            : null,
        director: detail.directors || null,
        releaseYear,
        durationMin: detail.duration || null,
        genres,
        synopsis: detail.synopsis ? stripHtml(detail.synopsis) : null,
        posterUrl: detail.posterPath?.md || detail.posterPath?.lg || null,
        startsAt: `${stDate}T${stTime}:00`,
        endsAt: endM ? `${endM[1]}T${endM[2]}:00` : null,
        date: stDate,
        time: stTime,
        version: mapVersion(st.version),
        room: st.auditoriumName ? `Salle ${st.auditoriumName}` : null,
        labels,
        bookingUrl: st.refCmd || `https://www.pathe.fr/films/${showSlug}`,
        isLiveBroadcast,
      });
    }
  });

  return out;
}

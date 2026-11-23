import type { Version } from "../../shared/types";
import { canonicalizeTitle } from "../enricher/normalize";
import type { RawScrapedScreening } from "./types";
import { decodeHtmlEntities, fetchJson, stripHtml } from "./utils";

interface UtopiaAttrObj {
  title?: string;
  presentation?: string;
}

interface UtopiaShowtime {
  session_datetime: string; // 2026-11-23T13:30:00+01:00
  movie: {
    boxoffice_id?: string;
    title: string;
  };
  auditorium?: {
    id?: string;
    name?: string;
  };
  attributes?: Array<string | UtopiaAttrObj>;
}

interface UtopiaWpFilm {
  id: number;
  link: string;
  title: { rendered: string };
  content?: { rendered: string };
  type_de_film?: number[];
}

export async function scrapeUtopia(params: {
  cinemaId: string;
  cinemaCode: "P3404" | "W3120";
  fallbackBookingUrl: string;
}): Promise<RawScrapedScreening[]> {
  const showtimes = await fetchJson<UtopiaShowtime[]>(
    `https://toulouse.cinemas-utopia.org/wp-json/cinema/${params.cinemaCode}/showtimes`
  );

  // Fetch WP film catalog (type_de_film: 9 = Répertoire)
  const filmMap = new Map<string, { isRepertoire: boolean; link: string; synopsis: string }>();
  for (let page = 1; page <= 3; page++) {
    try {
      const films = await fetchJson<UtopiaWpFilm[]>(
        `https://toulouse.cinemas-utopia.org/wp-json/wp/v2/film?per_page=100&page=${page}`
      );
      if (!Array.isArray(films) || films.length === 0) break;
      for (const f of films) {
        const key = canonicalizeTitle(decodeHtmlEntities(f.title?.rendered));
        if (!key) continue;
        filmMap.set(key, {
          isRepertoire: Array.isArray(f.type_de_film) && f.type_de_film.includes(9),
          link: f.link,
          synopsis: stripHtml(f.content?.rendered || "").slice(0, 600),
        });
      }
      if (films.length < 100) break;
    } catch {
      break;
    }
  }

  const out: RawScrapedScreening[] = [];

  for (const st of showtimes) {
    const dtMatch = st.session_datetime?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!dtMatch || !st.movie?.title) continue;
    const [, date, time] = dtMatch;

    const title = decodeHtmlEntities(st.movie.title);
    const key = canonicalizeTitle(title);
    const wpFilm = filmMap.get(key);

    let version: Version = "UNKNOWN";
    let isCineConcert = false;
    const labels: string[] = [];

    if (wpFilm?.isRepertoire) {
      labels.push("Répertoire");
    }

    for (const attr of st.attributes || []) {
      if (typeof attr === "string") {
        const up = attr.trim().toUpperCase();
        if (up === "VO" || up === "VOST" || up === "VOSTFR") version = "VOSTFR";
        else if (up === "VF") version = "VF";
      } else if (attr && typeof attr === "object" && attr.title) {
        const attrTitle = decodeHtmlEntities(attr.title).trim();
        labels.push(attrTitle);
        if (/cin[ée]\s*-?\s*concert/i.test(attrTitle)) {
          isCineConcert = true;
          if (/muet/i.test(attr.presentation || "") || version === "UNKNOWN") {
            version = "MUET";
          }
        }
      }
    }

    out.push({
      cinemaId: params.cinemaId,
      screeningId: `${st.movie.boxoffice_id || key}-${date}T${time}`,
      title,
      synopsis: wpFilm?.synopsis || null,
      startsAt: `${date}T${time}:00`,
      date,
      time,
      version,
      isCineConcert,
      labels,
      bookingUrl: wpFilm?.link || params.fallbackBookingUrl,
    });
  }

  return out;
}

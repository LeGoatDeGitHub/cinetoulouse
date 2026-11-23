import * as cheerio from "cheerio";
import type { Version } from "../../shared/types";
import { getCachedPage, setCachedPage } from "../db";
import type { RawScrapedScreening } from "./types";
import {
  decodeHtmlEntities,
  extractYear,
  fetchText,
  getParisDateStr,
  mapWithConcurrency,
  parseFrenchDate,
} from "./utils";

const BASE_URL = "https://www.lacinemathequedetoulouse.com";

interface CinemathequeDetail {
  director: string | null;
  releaseYear: number | null;
  durationMin: number | null;
  version: Version;
  synopsis: string | null;
  posterUrl: string | null;
  bookingUrl: string | null;
}

function parseCreditsLine(line: string): {
  director: string | null;
  releaseYear: number | null;
  durationMin: number | null;
  version: Version;
} {
  const releaseYear = extractYear(line);
  const durMatch = line.match(/(\d+)\s*min/i);
  const durationMin = durMatch ? Number(durMatch[1]) : null;

  let director: string | null = null;
  if (releaseYear) {
    const beforeYear = line.split(String(releaseYear))[0] || "";
    const cleaned = beforeYear.replace(/[.\s]+$/, "").trim();
    if (cleaned.length >= 3 && cleaned.length <= 80 && !/min|dcp|35mm|16mm/i.test(cleaned)) {
      director = cleaned;
    }
  }

  let version: Version = "VOSTFR";
  if (/\bmuet\b/i.test(line)) {
    version = "MUET";
  } else if (/vost|sous-titr/i.test(line)) {
    version = "VOSTFR";
  } else if (/\bvf\b|\bversion\s+fran[çc]aise\b/i.test(line)) {
    version = "VF";
  } else if (/\.\s*fr\./i.test(line) || /\bfrance\b/i.test(line)) {
    version = "VF";
  }

  return { director, releaseYear, durationMin, version };
}

async function getProjectionDetail(href: string): Promise<CinemathequeDetail> {
  const url = `${BASE_URL}${href}`;
  const cached = getCachedPage<CinemathequeDetail>(url);
  if (cached) return cached;

  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const $body = $(".cms-body").first();

    // Find first meaningful paragraph after h1 containing year or duration
    const paras = $body
      .find("p")
      .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    const creditLine =
      paras.find(
        (p) =>
          !/synchro/i.test(p) &&
          /\b(18|19|20)\d{2}\b/.test(p) &&
          /\b(\d+\s*min|dcp|35\s*mm|16\s*mm|muet|n&b|coul|vo|vf)\b/i.test(p)
      ) || "";
    const parsed = parseCreditsLine(creditLine);

    const synopsis =
      paras.find((p) => p.length > 90 && p !== creditLine) || null;

    let posterUrl: string | null = null;
    $body.find("img").each((_, img) => {
      if (posterUrl) return;
      const src = $(img).attr("data-src") || $(img).attr("src") || "";
      if (src && !src.includes("filter-")) {
        posterUrl = src.startsWith("http") ? src : `${BASE_URL}${src}`;
      }
    });

    const rawTicketing = $('a[href*="ticketingcine"]').first().attr("href");
    const ticketingHref = rawTicketing ? decodeHtmlEntities(rawTicketing) : url;

    const detail: CinemathequeDetail = {
      ...parsed,
      synopsis,
      posterUrl,
      bookingUrl: ticketingHref,
    };

    setCachedPage(url, detail);
    return detail;
  } catch {
    return {
      director: null,
      releaseYear: null,
      durationMin: null,
      version: "VOSTFR",
      synopsis: null,
      posterUrl: null,
      bookingUrl: url,
    };
  }
}

interface RawAgendaItem {
  date: string;
  time: string;
  title: string;
  href: string;
  room: string | null;
  cycle: string | null;
  isCineConcert: boolean;
  isOffsite: boolean;
  offsiteVenue: string | null;
}

export async function scrapeCinematheque(): Promise<RawScrapedScreening[]> {
  const from = getParisDateStr(0);
  const to = getParisDateStr(28);
  const html = await fetchText(`${BASE_URL}/programmation/agenda?from=${from}&to=${to}`);
  const $ = cheerio.load(html);

  const rawItems: RawAgendaItem[] = [];

  $(".timetable-item").each((_, el) => {
    const $item = $(el);
    const $desktop = $item.find(".timetable-item-date .hidden-xs").first();
    const timeRaw = $desktop.find(".timetable-item-start-time").text().trim();
    const tm = timeRaw.match(/^(\d{1,2})h(\d{2})$/i);
    if (!tm) return;
    const time = `${tm[1].padStart(2, "0")}:${tm[2]}`;

    const $dateClone = $desktop.clone();
    $dateClone.find(".timetable-item-start-time, .timetable-item-room").remove();
    const date = parseFrenchDate($dateClone.text());
    if (!date) return;

    const roomRaw = $desktop.find(".timetable-item-room").text().replace(/[→\s]+/g, " ").trim();
    const room = roomRaw || null;

    const $titleLink = $item.find(".timetable-item-title a").first();
    const href = $titleLink.attr("href") || "";
    const fullTitle = $titleLink
      .text()
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!href || !fullTitle) return;

    // Skip cancelled events and non-film workshops
    if (/annul[ée]|lecture perform[ée]e/i.test(fullTitle)) return;
    if (/^(?:visite guid[ée]e|atelier\b|cin[ée]-bruitage|jam cin[ée]-concert)/i.test(fullTitle)) {
      return;
    }

    const cycle = $item.find('a[href*="/programmation/cycles/"]').first().text().replace(/\s+/g, " ").trim() || null;
    const hasCineConcertImg =
      $item.find('img[data-src*="filter-cine-concert"], img[src*="filter-cine-concert"]').length > 0;
    const isCineConcert = hasCineConcertImg || /cin[ée]-concert/i.test(cycle || "");

    const looksExternal =
      !room ||
      /\[.+\]|th[ée][âa]tre|universit[ée]|metronum|s[ée]n[ée]chal|jean marais|salle arc[ée]|institut/i.test(
        fullTitle
      );

    let title = fullTitle;
    let offsiteVenue: string | null = null;
    if (looksExternal) {
      const splitMatch = fullTitle.match(/^(.+?)\s+[–-]\s+(.+)$/);
      if (splitMatch) {
        title = splitMatch[1].trim();
        offsiteVenue = splitMatch[2].trim();
      }
    } else {
      // Remove internal "– . le studio" suffix when in Salle 2
      title = fullTitle.replace(/\s+[–-]\s+\.?\s*le studio$/i, "").trim();
    }

    rawItems.push({
      date,
      time,
      title,
      href,
      room,
      cycle,
      isCineConcert,
      isOffsite: looksExternal,
      offsiteVenue,
    });
  });

  const uniqueHrefs = [...new Set(rawItems.map((i) => i.href))];
  const detailMap = new Map<string, CinemathequeDetail>();
  await mapWithConcurrency(uniqueHrefs, 5, async (href) => {
    detailMap.set(href, await getProjectionDetail(href));
  });

  return rawItems.map((item) => {
    const detail = detailMap.get(item.href);
    const labels: string[] = [];
    if (item.cycle) labels.push(item.cycle);
    if (item.isCineConcert) labels.push("Ciné-concert");

    return {
      cinemaId: "cinematheque",
      screeningId: `${item.href}-${item.date}T${item.time}`,
      title: item.title,
      director: detail?.director || null,
      releaseYear: detail?.releaseYear || null,
      durationMin: detail?.durationMin || null,
      synopsis: detail?.synopsis || null,
      posterUrl: detail?.posterUrl || null,
      startsAt: `${item.date}T${item.time}:00`,
      date: item.date,
      time: item.time,
      version: detail?.version || (item.isCineConcert ? "MUET" : "VOSTFR"),
      isCineConcert: item.isCineConcert,
      isOffsite: item.isOffsite,
      offsiteVenue: item.offsiteVenue,
      room: item.room,
      labels,
      bookingUrl: detail?.bookingUrl || `${BASE_URL}${item.href}`,
      isCultOverride: true,
      cultReasonOverride: item.cycle || "Cinémathèque de Toulouse",
    };
  });
}

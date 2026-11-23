import * as cheerio from "cheerio";
import type { Version } from "../../shared/types";
import { getCachedPage, setCachedPage } from "../db";
import type { RawScrapedScreening } from "./types";
import { extractYear, fetchText, mapWithConcurrency } from "./utils";

interface CosmoFilmDetail {
  releaseYear: number | null;
  durationMin: number | null;
  country: string | null;
  lang: string | null;
  director: string | null;
  synopsis: string | null;
  posterUrl: string | null;
}

const BASE_URL = "https://www.american-cosmograph.fr";

function toAbsUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function parseDuration(raw: string): number | null {
  const m = raw.match(/(\d+)h\s*(\d{2})?/i);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

function mapVersion(lang: string | null, country: string | null, tags: string[]): Version {
  const l = (lang || "").toUpperCase();
  if (l.includes("VOST") || l === "VO") return "VOSTFR";
  if (l === "VF") return "VF";
  if (tags.some((t) => /\bVF\b/i.test(t))) return "VF";
  if (tags.some((t) => /VOST/i.test(t))) return "VOSTFR";
  if (country && /^france$/i.test(country.trim())) return "VF";
  return "UNKNOWN";
}

async function getFilmDetail(href: string): Promise<CosmoFilmDetail> {
  const url = toAbsUrl(href);
  const cached = getCachedPage<CosmoFilmDetail>(url);
  if (cached) return cached;

  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);

    const yearText = $(".field_anneesortie .value").text().trim();
    const durText = $(".field_duree .value").text().trim();
    const countryText = $(".field_pays .value").text().trim();
    const langText = $(".field_languediffusion .value").text().trim();

    const bodyText = ($("main, .com-content-article, body").first().text() || "")
      .replace(/\s+/g, " ")
      .trim();
    const dirMatch = bodyText.match(/Un film de\s+(.+?)(?:\s+avec\b|\s+var\s+pathJoomla\b|$)/i);
    const director = dirMatch ? dirMatch[1].trim().slice(0, 100) : null;

    const posterSrc =
      $(".fc_field_affiche img, .field_affiche img, .com-content-article img")
        .first()
        .attr("src") || null;

    const paragraphs = $(".com-content-article__body p, .field_description p, .desc-film p")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((p) => p.length > 60 && !/Nous rencontrons actuellement un problème/i.test(p));

    const detail: CosmoFilmDetail = {
      releaseYear: extractYear(yearText),
      durationMin: parseDuration(durText),
      country: countryText || null,
      lang: langText || null,
      director,
      synopsis: paragraphs.slice(0, 2).join(" ") || null,
      posterUrl: posterSrc ? toAbsUrl(posterSrc) : null,
    };

    setCachedPage(url, detail);
    return detail;
  } catch {
    return {
      releaseYear: null,
      durationMin: null,
      country: null,
      lang: null,
      director: null,
      synopsis: null,
      posterUrl: null,
    };
  }
}

interface RawCosmoThumb {
  date: string;
  time: string;
  title: string;
  href: string;
  tags: string[];
  room: string | null;
  durationMin: number | null;
  posterUrl: string | null;
}

function parseSchedulePage(html: string): { thumbs: RawCosmoThumb[]; nextHref: string | null } {
  const $ = cheerio.load(html);
  const nextHref = $("a.seance-next").attr("href") || null;
  const thumbs: RawCosmoThumb[] = [];

  $('.progseances-daypane[id^="day-"]').each((_, pane) => {
    const $pane = $(pane);
    const date = ($pane.attr("id") || "").replace("day-", "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    $pane.find("li.progseances-thumb").each((__, li) => {
      const $li = $(li);
      const timeRaw = $li.find(".horaire_debut strong").text().trim();
      const tm = timeRaw.match(/^(\d{1,2})h(\d{2})$/i);
      if (!tm) return;
      const time = `${tm[1].padStart(2, "0")}:${tm[2]}`;

      const $a = $li.find("h3.filmTitle a").first();
      const title = $a.text().replace(/\s+/g, " ").trim();
      const href = $a.attr("href") || "";
      if (!title || !href) return;

      const tags = $li
        .find(".filmTag")
        .map((___, t) => $(t).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t && !/tarif réduit/i.test(t));

      const horaireText = $li.find(".horaire").text().replace(/\s+/g, " ").trim();
      const roomMatch = horaireText.match(/salle\s+\d+/i);
      const durMatch = horaireText.match(/Durée\s*:\s*(\d+h\d{2})/i);

      const style = $li.attr("style") || "";
      const bgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/i);

      thumbs.push({
        date,
        time,
        title,
        href,
        tags,
        room: roomMatch ? roomMatch[0] : null,
        durationMin: durMatch ? parseDuration(durMatch[1]) : null,
        posterUrl: bgMatch ? toAbsUrl(bgMatch[1]) : null,
      });
    });
  });

  return { thumbs, nextHref };
}

export async function scrapeCosmograph(): Promise<RawScrapedScreening[]> {
  const firstHtml = await fetchText(`${BASE_URL}/les-horaires.html?view=seances`);
  const page1 = parseSchedulePage(firstHtml);
  let allThumbs = [...page1.thumbs];

  if (page1.nextHref) {
    try {
      const nextHtml = await fetchText(toAbsUrl(page1.nextHref));
      const page2 = parseSchedulePage(nextHtml);
      allThumbs = [...allThumbs, ...page2.thumbs];
    } catch {
      // Keep page1 if week 2 fails
    }
  }

  const uniqueHrefs = [...new Set(allThumbs.map((t) => t.href))];
  const detailMap = new Map<string, CosmoFilmDetail>();
  await mapWithConcurrency(uniqueHrefs, 5, async (href) => {
    detailMap.set(href, await getFilmDetail(href));
  });

  return allThumbs.map((t) => {
    const detail = detailMap.get(t.href);
    const version = mapVersion(detail?.lang || null, detail?.country || null, t.tags);
    const cleanTitle = t.title === t.title.toUpperCase() && /[A-ZÀ-Ÿ]/.test(t.title)
      ? t.title.charAt(0) + t.title.slice(1).toLowerCase()
      : t.title;

    return {
      cinemaId: "cosmograph",
      screeningId: `${t.href}-${t.date}T${t.time}`,
      title: cleanTitle,
      director: detail?.director || null,
      releaseYear: detail?.releaseYear || null,
      durationMin: t.durationMin || detail?.durationMin || null,
      synopsis: detail?.synopsis || null,
      posterUrl: detail?.posterUrl || t.posterUrl,
      startsAt: `${t.date}T${t.time}:00`,
      date: t.date,
      time: t.time,
      version,
      room: t.room,
      labels: t.tags,
      bookingUrl: toAbsUrl(t.href),
    };
  });
}

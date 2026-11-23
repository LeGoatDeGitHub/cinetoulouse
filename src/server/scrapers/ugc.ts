import * as cheerio from "cheerio";
import type { Version } from "../../shared/types";
import type { RawScrapedScreening } from "./types";
import {
  decodeHtmlEntities,
  fetchText,
  getParisDateStr,
  mapWithConcurrency,
  parseFrenchDate,
} from "./utils";

function formatUgcTitle(raw: string): string {
  const clean = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  if (!clean) return clean;
  // UGC outputs film titles in ALL CAPS; convert to readable sentence/title case
  if (clean === clean.toUpperCase() && /[A-ZÀ-Ÿ]/.test(clean)) {
    const lower = clean.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return clean;
}

function mapVersion(raw?: string): Version {
  const up = (raw || "").trim().toUpperCase();
  if (up === "VOSTF" || up === "VOSTFR" || up === "VO" || up === "VOST") return "VOSTFR";
  if (up === "VF" || up === "VFSTF") return "VF";
  return "UNKNOWN";
}

function parseDdMmYyyy(raw?: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export async function scrapeUgcMontaudran(): Promise<RawScrapedScreening[]> {
  const today = getParisDateStr(0);
  const maxDate = getParisDateStr(14);
  const maxCultDate = getParisDateStr(35);

  const [mainHtml, cultHtml, pestaclesHtml] = await Promise.all([
    fetchText("https://www.ugc.fr/cinema-ugc-montaudran.html"),
    fetchText(
      "https://www.ugc.fr/cinemaAjaxAction!getDoNotMissAsList.action?doNotMissCategoryId=3&cinemaId=56",
      { headers: { "X-Requested-With": "XMLHttpRequest" } }
    ).catch(() => ""),
    fetchText(
      "https://www.ugc.fr/cinemaAjaxAction!getDoNotMissAsList.action?doNotMissCategoryId=16&cinemaId=56",
      { headers: { "X-Requested-With": "XMLHttpRequest" } }
    ).catch(() => ""),
  ]);

  const dates = new Set<string>();
  const $main = cheerio.load(mainHtml);
  $main('div[id^="nav_date_"]').each((_, el) => {
    const d = ($main(el).attr("id") || "").replace("nav_date_", "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && d <= maxDate) {
      dates.add(d);
    }
  });

  // Also grab future UGC Culte / Pestacles dates even beyond 14 days
  for (const extraHtml of [cultHtml, pestaclesHtml]) {
    if (!extraHtml) continue;
    const $ex = cheerio.load(extraHtml);
    $ex(".screening-date li").each((_, el) => {
      const parsed = parseFrenchDate($ex(el).text());
      if (parsed && parsed >= today && parsed <= maxCultDate) {
        dates.add(parsed);
      }
    });
  }

  if (dates.size === 0) dates.add(today);

  const out: RawScrapedScreening[] = [];

  await mapWithConcurrency([...dates].sort(), 4, async (date) => {
    const html = await fetchText(
      `https://www.ugc.fr/showingsCinemaAjaxAction!getShowingsForCinemaPage.action?cinemaId=56&date=${date}&page=30007`,
      { headers: { "X-Requested-With": "XMLHttpRequest" } }
    ).catch(() => "");

    if (!html || html.trim().length < 50) return;

    const $ = cheerio.load(html);
    $('div[id^="bloc-showing-film-"]').each((_, card) => {
      const $card = $(card);
      const $titleLink = $card.find(".info-wrapper .block--title a").first();
      const rawTitle =
        $titleLink.attr("title") ||
        $titleLink.text() ||
        $card.find("button[data-showing]").first().attr("data-film") ||
        "";
      const title = formatUgcTitle(rawTitle);
      if (!title) return;

      const poster =
        $card.find(".img-wrapper img").first().attr("data-src") ||
        $card.find(".img-wrapper img").first().attr("src") ||
        null;

      const cardLabel =
        $titleLink.attr("data-film-label") ||
        $card.find(".film-tag").first().text().trim() ||
        "";
      const genres =
        $titleLink.attr("data-film-kind") ||
        $card.find("button[data-showing]").first().attr("data-filmgender") ||
        null;

      const $info = $card.find(".info-wrapper").clone();
      $info.find("script").remove();
      const infoText = $info.text().replace(/\s+/g, " ").trim();
      const releaseMatch = infoText.match(/Sortie le\s+(\d{1,2}\s+[a-zàâäéèêëïîôöùûüç.]+\s+\d{4})/i);
      const parsedRelease = releaseMatch ? parseFrenchDate(releaseMatch[1]) : null;
      const releaseYear = parsedRelease ? Number(parsedRelease.slice(0, 4)) : null;

      const dirMatch = infoText.match(/\bDe\s+(.+?)(?:\s+Avec\b|\s+Synopsis\b|$)/);
      const director = dirMatch ? dirMatch[1].trim() : null;

      const durMatch = infoText.match(/\((\d+)h(\d{2})\)/i);
      const durationMin = durMatch ? Number(durMatch[1]) * 60 + Number(durMatch[2]) : null;

      const synMatch = infoText.match(/Synopsis\s+(.+?)(?:\s+VOIR PLUS\b|\s+\d{2}:\d{2}\b|$)/i);
      const synopsis = synMatch ? synMatch[1].trim() : null;

      $card.find("button[data-showing]").each((__, btn) => {
        const $btn = $(btn);
        const showingId = $btn.attr("data-showing");
        const time = $btn.attr("data-seancehour")?.trim() || "";
        const seanceDate = parseDdMmYyyy($btn.attr("data-seancedate")) || date;
        if (!showingId || !/^\d{2}:\d{2}$/.test(time)) return;

        const verRaw = $btn.attr("data-version") || "";
        const version = mapVersion(verRaw);
        const labelNom = ($btn.attr("data-labelnom") || cardLabel || "").trim();
        const btnText = $btn.text().replace(/\s+/g, " ").trim();
        const roomMatch = btnText.match(/(Salle\s+\S+)/i);
        const room = roomMatch ? roomMatch[1] : null;

        const labels: string[] = [];
        if (labelNom) labels.push(labelNom);
        if (verRaw.toUpperCase() === "VFSTF") labels.push("VFSTF");

        const isCultLabel = /ugc culte|pestacles/i.test(labelNom);

        out.push({
          cinemaId: "ugc-montaudran",
          screeningId: showingId,
          title,
          director,
          releaseYear,
          durationMin,
          genres,
          synopsis,
          posterUrl: poster,
          startsAt: `${seanceDate}T${time}:00`,
          date: seanceDate,
          time,
          version,
          room,
          labels,
          bookingUrl: `https://www.ugc.fr/reservationSeances.html?id=${showingId}`,
          isCultOverride: isCultLabel,
          cultReasonOverride: isCultLabel ? labelNom : null,
        });
      });
    });
  });

  return out;
}

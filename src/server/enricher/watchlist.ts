import * as cheerio from "cheerio";
import {
  WatchlistInputError,
  normalizeLetterboxdUsername,
  parseWatchlistCsv,
} from "../../shared/watchlist";
import type { WatchlistItemInput } from "../db";
import { fetchWithTimeout, sleep } from "../scrapers/utils";
import { canonicalizeTitle } from "./normalize";

const MAX_WATCHLIST_PAGES = 50;
const PAGE_CONCURRENCY = 4;

export {
  WatchlistInputError as WatchlistError,
  normalizeLetterboxdUsername,
  parseWatchlistCsv,
};

function parseWatchlistPageHtml(html: string): {
  items: WatchlistItemInput[];
  maxPage: number;
} {
  const $ = cheerio.load(html);
  const items: WatchlistItemInput[] = [];

  $("[data-item-slug]").each((_, el) => {
    const $el = $(el);
    const slug = $el.attr("data-item-slug")?.trim().toLowerCase();
    if (!slug) return;

    const rawName = (
      $el.attr("data-item-name") ||
      $el.attr("data-item-full-display-name") ||
      ""
    ).trim();

    const yearMatch = rawName.match(/\s*\((\d{4})\)\s*$/);
    const releaseYear = yearMatch ? Number(yearMatch[1]) : null;
    const title =
      (yearMatch ? rawName.slice(0, yearMatch.index).trim() : rawName) ||
      slug.replace(/-\d{4}$/, "").replace(/-/g, " ");

    const canonicalKey =
      canonicalizeTitle(title) ||
      canonicalizeTitle(slug.replace(/-\d{4}$/, "").replace(/-/g, " "));
    if (!canonicalKey) return;

    items.push({
      id: `lb:${slug}`,
      slug,
      title,
      canonicalKey,
      releaseYear,
      letterboxdUri: `https://letterboxd.com/film/${slug}/`,
    });
  });

  let maxPage = 1;
  $(".paginate-pages li").each((_, el) => {
    const n = Number.parseInt($(el).text().trim(), 10);
    if (Number.isFinite(n) && n > maxPage) {
      maxPage = n;
    }
  });

  return { items, maxPage };
}

export async function fetchLetterboxdWatchlist(rawUsername: string): Promise<{
  username: string;
  items: WatchlistItemInput[];
  pagesFetched: number;
  truncated: boolean;
}> {
  const username = normalizeLetterboxdUsername(rawUsername);
  const baseUrl = `https://letterboxd.com/${username}/watchlist/`;

  const firstRes = await fetchWithTimeout(baseUrl, {
    timeoutMs: 15_000,
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (firstRes.status === 404) {
    throw new WatchlistInputError(
      `Utilisateur Letterboxd « ${username} » introuvable. Vérifie l'orthographe du pseudo.`,
      404
    );
  }
  if (firstRes.status === 403) {
    throw new WatchlistInputError(
      `La watchlist de « ${username} » est privée ou inaccessible. Rends-la publique dans tes paramètres Letterboxd, ou utilise l'import watchlist.csv ci-dessous.`,
      403
    );
  }
  if (!firstRes.ok) {
    throw new WatchlistInputError(
      `Erreur Letterboxd (HTTP ${firstRes.status}). Réessaie ou utilise l'import watchlist.csv.`,
      502
    );
  }

  const firstHtml = await firstRes.text();
  const { items: firstItems, maxPage } = parseWatchlistPageHtml(firstHtml);
  const pagesToFetch = Math.min(maxPage, MAX_WATCHLIST_PAGES);
  const truncated = maxPage > MAX_WATCHLIST_PAGES;

  const deduped = new Map<string, WatchlistItemInput>();
  for (const item of firstItems) {
    deduped.set(item.slug || item.id, item);
  }

  let pagesFetched = 1;
  if (pagesToFetch > 1) {
    const pageNumbers = Array.from({ length: pagesToFetch - 1 }, (_, i) => i + 2);
    for (let i = 0; i < pageNumbers.length; i += PAGE_CONCURRENCY) {
      const batch = pageNumbers.slice(i, i + PAGE_CONCURRENCY);
      const batchItems = await Promise.all(
        batch.map(async (page) => {
          const url = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
          try {
            const res = await fetchWithTimeout(url, {
              timeoutMs: 15_000,
              headers: {
                "Accept-Language": "en-US,en;q=0.9",
              },
            });
            if (!res.ok) {
              console.warn(`[Watchlist] Page ${page} pour ${username}: HTTP ${res.status}`);
              return [];
            }
            const html = await res.text();
            pagesFetched += 1;
            return parseWatchlistPageHtml(html).items;
          } catch (err) {
            console.warn(
              `[Watchlist] Erreur page ${page} pour ${username}: ${err instanceof Error ? err.message : String(err)}`
            );
            return [];
          }
        })
      );

      for (const items of batchItems) {
        for (const item of items) {
          deduped.set(item.slug || item.id, item);
        }
      }

      if (i + PAGE_CONCURRENCY < pageNumbers.length) {
        await sleep(120);
      }
    }
  }

  return {
    username,
    items: [...deduped.values()],
    pagesFetched,
    truncated,
  };
}

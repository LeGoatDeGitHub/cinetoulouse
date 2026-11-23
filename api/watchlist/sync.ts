import * as cheerio from "cheerio";
import type { WatchlistStoredItem } from "../../src/shared/types";
import {
  WatchlistInputError,
  canonicalizeForWatchlist,
  normalizeLetterboxdUsername,
} from "../../src/shared/watchlist";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_WATCHLIST_PAGES = 50;
const PAGE_CONCURRENCY = 4;

async function fetchLetterboxdPage(url: string, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": CHROME_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseWatchlistPageHtml(html: string): {
  items: WatchlistStoredItem[];
  maxPage: number;
} {
  const $ = cheerio.load(html);
  const items: WatchlistStoredItem[] = [];

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
      canonicalizeForWatchlist(title) ||
      canonicalizeForWatchlist(slug.replace(/-\d{4}$/, "").replace(/-/g, " "));
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

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { username?: unknown } | null;
  if (!body || typeof body.username !== "string" || !body.username.trim()) {
    return Response.json({ error: "Indique ton pseudo Letterboxd." }, { status: 400 });
  }

  try {
    const username = normalizeLetterboxdUsername(body.username);
    const firstRes = await fetchLetterboxdPage(`https://letterboxd.com/${username}/watchlist/`);

    if (firstRes.status === 404) {
      return Response.json(
        {
          error: `Utilisateur Letterboxd « ${username} » introuvable. Vérifie l'orthographe du pseudo.`,
        },
        { status: 404 }
      );
    }
    if (firstRes.status === 403) {
      return Response.json(
        {
          error: `La watchlist de « ${username} » est privée ou inaccessible. Rends-la publique dans tes paramètres Letterboxd, ou utilise l'import watchlist.csv ci-dessous.`,
        },
        { status: 403 }
      );
    }
    if (!firstRes.ok) {
      return Response.json(
        {
          error: `Erreur Letterboxd (HTTP ${firstRes.status}). Réessaie ou utilise l'import watchlist.csv.`,
        },
        { status: 502 }
      );
    }

    const firstHtml = await firstRes.text();
    const { items: firstItems, maxPage } = parseWatchlistPageHtml(firstHtml);
    const pagesToFetch = Math.min(maxPage, MAX_WATCHLIST_PAGES);
    const truncated = maxPage > MAX_WATCHLIST_PAGES;

    const deduped = new Map<string, WatchlistStoredItem>();
    for (const item of firstItems) {
      deduped.set(item.slug || item.id, item);
    }

    if (pagesToFetch > 1) {
      const pageNumbers = Array.from({ length: pagesToFetch - 1 }, (_, i) => i + 2);
      for (let i = 0; i < pageNumbers.length; i += PAGE_CONCURRENCY) {
        const batch = pageNumbers.slice(i, i + PAGE_CONCURRENCY);
        const batchItems = await Promise.all(
          batch.map(async (page) => {
            try {
              const res = await fetchLetterboxdPage(
                `https://letterboxd.com/${username}/watchlist/page/${page}/`
              );
              if (!res.ok) return [];
              const html = await res.text();
              return parseWatchlistPageHtml(html).items;
            } catch (err) {
              console.error(`[api/watchlist/sync] page ${page}:`, err);
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
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    }

    const items = [...deduped.values()];
    return Response.json({
      username,
      source: "letterboxd" as const,
      syncedAt: new Date().toISOString(),
      totalCount: items.length,
      truncated,
      items,
    });
  } catch (err) {
    if (err instanceof WatchlistInputError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/watchlist/sync] unexpected error:", err);
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de la synchronisation Letterboxd.",
      },
      { status: 502 }
    );
  }
}

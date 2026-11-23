import { existsSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Version } from "../shared/types";
import {
  clearWatchlist,
  getCinemasWithSync,
  getTotalUpcomingScreeningsCount,
  getWatchlistStatus,
  queryScreenings,
  replaceWatchlist,
} from "./db";
import {
  WatchlistError,
  fetchLetterboxdWatchlist,
  parseWatchlistCsv,
} from "./enricher/watchlist";
import { getSyncStatus, triggerFullSync } from "./sync";

const app = new Hono();

app.get("/api/cinemas", (c) => {
  return c.json({ cinemas: getCinemasWithSync() });
});

app.get("/api/sync/status", (c) => {
  return c.json(getSyncStatus());
});

app.post("/api/refresh", (c) => {
  // Start sync asynchronously and return current status immediately
  void triggerFullSync();
  return c.json(getSyncStatus(), 202);
});

app.get("/api/screenings", (c) => {
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;
  const cultOnly = c.req.query("cultOnly") === "true";
  const watchlistOnly = c.req.query("watchlistOnly") === "true";
  const includeOffsite = c.req.query("includeOffsite") === "true";
  const q = c.req.query("q") || undefined;

  const minRatingRaw = c.req.query("minRating");
  const minRating = minRatingRaw ? Number(minRatingRaw) : undefined;

  const versionsParam = c.req.query("versions");
  const versions = versionsParam
    ? (versionsParam.split(",").filter(Boolean) as Version[])
    : undefined;

  const cinemasParam = c.req.query("cinemas");
  const cinemas = cinemasParam
    ? cinemasParam.split(",").filter(Boolean)
    : undefined;

  const screenings = queryScreenings({
    from,
    to,
    cultOnly,
    watchlistOnly,
    versions,
    cinemas,
    includeOffsite,
    minRating: Number.isFinite(minRating) ? minRating : undefined,
    q,
  });

  return c.json({
    screenings,
    total: screenings.length,
  });
});

app.get("/api/watchlist", (c) => {
  return c.json(getWatchlistStatus());
});

app.post("/api/watchlist/sync", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { username?: unknown } | null;
  if (!body || typeof body.username !== "string" || !body.username.trim()) {
    return c.json({ error: "Indique ton pseudo Letterboxd." }, 400);
  }

  try {
    const result = await fetchLetterboxdWatchlist(body.username);
    replaceWatchlist(result.items, {
      username: result.username,
      source: "letterboxd",
      syncedAt: new Date().toISOString(),
    });
    return c.json({
      ...getWatchlistStatus(),
      truncated: result.truncated,
    });
  } catch (err) {
    if (err instanceof WatchlistError) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404 | 502);
    }
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de la synchronisation Letterboxd.",
      },
      502
    );
  }
});

app.post("/api/watchlist/import-csv", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { csv?: unknown } | null;
  if (!body || typeof body.csv !== "string" || !body.csv.trim()) {
    return c.json({ error: "Fichier CSV vide ou invalide." }, 400);
  }
  if (Buffer.byteLength(body.csv, "utf8") > 5 * 1024 * 1024) {
    return c.json({ error: "Fichier CSV trop volumineux (max 5 Mo)." }, 400);
  }

  try {
    const items = parseWatchlistCsv(body.csv);
    replaceWatchlist(items, {
      username: null,
      source: "csv",
      syncedAt: new Date().toISOString(),
    });
    return c.json(getWatchlistStatus());
  } catch (err) {
    if (err instanceof WatchlistError) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404 | 502);
    }
    return c.json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'import CSV." },
      400
    );
  }
});

app.delete("/api/watchlist", (c) => {
  clearWatchlist();
  return c.json(getWatchlistStatus());
});

// Serve production frontend if built
const distWebDir = path.resolve(import.meta.dir, "../../dist/web");
if (existsSync(distWebDir)) {
  app.use("/*", serveStatic({ root: "./dist/web" }));
  app.get("*", serveStatic({ path: "./dist/web/index.html" }));
}

const port = Number(process.env.PORT || 3001);

if (getTotalUpcomingScreeningsCount() === 0) {
  console.log("[Server] Base vide : lancement d'une synchronisation initiale en arrière-plan...");
  void triggerFullSync();
}

console.log(`[Server] CinéToulouse prêt sur http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};

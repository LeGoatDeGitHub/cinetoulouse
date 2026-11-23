import type { SyncStatus } from "../shared/types";
import { CINEMAS } from "./cinemas";
import {
  getCinemasWithSync,
  saveCinemaScreenings,
  saveCinemaSyncError,
} from "./db";
import { enrichMissingLetterboxd } from "./enricher/letterboxd";
import { scrapeCinematheque } from "./scrapers/cinematheque";
import { scrapeCosmograph } from "./scrapers/cosmograph";
import { scrapePathe } from "./scrapers/pathe";
import { scrapeTicketingCine } from "./scrapers/ticketingcine";
import type { RawScrapedScreening } from "./scrapers/types";
import { scrapeUgcMontaudran } from "./scrapers/ugc";
import { scrapeUtopia } from "./scrapers/utopia";
import { scrapeWebedia } from "./scrapers/webedia";

const SCRAPERS: Record<string, () => Promise<RawScrapedScreening[]>> = {
  abc: () =>
    scrapeTicketingCine({
      cinemaId: "abc",
      siteId: "EMS0947",
      origin: "https://www.ticketingcine.com",
    }),
  cratere: () =>
    scrapeTicketingCine({
      cinemaId: "cratere",
      siteId: "EMS0011",
      origin: "https://www.ticketingcine.com",
    }),
  autan: () =>
    scrapeTicketingCine({
      cinemaId: "autan",
      siteId: "EMS0874",
      origin: "https://www.cine-autan-ramonville.fr",
    }),
  "cgr-blagnac": () =>
    scrapeWebedia({
      cinemaId: "cgr-blagnac",
      baseUrl: "https://www.cgrcinemas.fr",
      theaterId: "P0692",
    }),
  "veo-muret": () =>
    scrapeWebedia({
      cinemaId: "veo-muret",
      baseUrl: "https://muret.veocinemas.fr",
      theaterId: "W3161",
    }),
  "veo-cartoucherie": () =>
    scrapeWebedia({
      cinemaId: "veo-cartoucherie",
      baseUrl: "https://cartoucherie.veocinemas.fr",
      theaterId: "G0699",
    }),
  "utopia-tournefeuille": () =>
    scrapeUtopia({
      cinemaId: "utopia-tournefeuille",
      cinemaCode: "P3404",
      fallbackBookingUrl: "https://toulouse.cinemas-utopia.org/horaires-tournefeuille/",
    }),
  "utopia-borderouge": () =>
    scrapeUtopia({
      cinemaId: "utopia-borderouge",
      cinemaCode: "W3120",
      fallbackBookingUrl: "https://toulouse.cinemas-utopia.org/horaires/",
    }),
  "pathe-wilson": () =>
    scrapePathe({
      cinemaId: "pathe-wilson",
      cinemaSlug: "cinema-pathe-wilson",
    }),
  "pathe-labege": () =>
    scrapePathe({
      cinemaId: "pathe-labege",
      cinemaSlug: "cinema-pathe-labege",
    }),
  "ugc-montaudran": () => scrapeUgcMontaudran(),
  cosmograph: () => scrapeCosmograph(),
  cinematheque: () => scrapeCinematheque(),
};

const syncState = {
  inProgress: false,
  stage: "idle" as SyncStatus["stage"],
  startedAt: null as string | null,
  finishedAt: null as string | null,
  cinemasDone: 0,
  cinemasTotal: CINEMAS.length,
  letterboxdDone: 0,
  letterboxdTotal: 0,
};

let activePromise: Promise<SyncStatus> | null = null;

export function getSyncStatus(): SyncStatus {
  return {
    ...syncState,
    cinemas: getCinemasWithSync(),
  };
}

export function triggerFullSync(): Promise<SyncStatus> {
  if (activePromise) return activePromise;

  activePromise = (async () => {
    syncState.inProgress = true;
    syncState.stage = "scraping";
    syncState.startedAt = new Date().toISOString();
    syncState.finishedAt = null;
    syncState.cinemasDone = 0;
    syncState.cinemasTotal = CINEMAS.length;
    syncState.letterboxdDone = 0;
    syncState.letterboxdTotal = 0;

    try {
      await Promise.allSettled(
        CINEMAS.map(async (cinema) => {
          const started = Date.now();
          const scraper = SCRAPERS[cinema.id];
          if (!scraper) {
            saveCinemaSyncError(cinema.id, "Connecteur manquant", 0);
            syncState.cinemasDone++;
            return;
          }
          try {
            const rawScreenings = await scraper();
            const count = saveCinemaScreenings(
              cinema.id,
              rawScreenings,
              Date.now() - started
            );
            console.log(
              `[Sync] ${cinema.shortName}: ${count} séances (${Date.now() - started}ms)`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Sync] Erreur ${cinema.shortName}: ${msg}`);
            saveCinemaSyncError(cinema.id, msg, Date.now() - started);
          } finally {
            syncState.cinemasDone++;
          }
        })
      );

      syncState.stage = "enriching";
      const lbRes = await enrichMissingLetterboxd((done, total) => {
        syncState.letterboxdDone = done;
        syncState.letterboxdTotal = total;
      });
      console.log(`[Letterboxd] Enrichis: ${lbRes.matched}/${lbRes.total}`);
      syncState.stage = "done";
      syncState.finishedAt = new Date().toISOString();
    } finally {
      syncState.inProgress = false;
      activePromise = null;
    }

    return getSyncStatus();
  })();

  return activePromise;
}

import { useState } from "react";
import {
  AlertCircle,
  Bookmark,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clapperboard,
  List,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { SyncStatus, WatchlistStatus } from "../../shared/types";

export type ViewMode = "week" | "month" | "list";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  syncStatus: SyncStatus | null;
  onRefresh: () => void;
  watchlistStatus: WatchlistStatus | null;
  onOpenWatchlist: () => void;
}

export function Header({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  syncStatus,
  onRefresh,
  watchlistStatus,
  onOpenWatchlist,
}: Props) {
  const [showHealth, setShowHealth] = useState(false);

  const okCount = syncStatus?.cinemas.filter((c) => c.status === "ok").length ?? 0;
  const errCount = syncStatus?.cinemas.filter((c) => c.status === "error").length ?? 0;
  const totalCount = syncStatus?.cinemas.length ?? 13;
  const hasWatchlist = Boolean(watchlistStatus && watchlistStatus.totalCount > 0);

  return (
    <header className="border-b border-[#2c3440] bg-[#14181c]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#00e054] to-[#0ea5e9] text-[#0c1218] shadow-md shadow-[#00e054]/20">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">CinéToulouse</h1>
              <span className="hidden rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#f59e0b] ring-1 ring-[#f59e0b]/30 sm:inline-block">
                Cultes & Art et Essai
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {totalCount} salles · Toulouse & Métropole
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="order-3 w-full md:order-2 md:max-w-md md:flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="movie-search"
              name="q"
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Chercher un film, réalisateur… (ex: La Gradiva, Keaton)"
              className="w-full rounded-lg border border-[#2c3440] bg-[#1c2228] py-2 pl-9 pr-9 text-sm text-white placeholder-slate-500 transition-colors focus:border-[#00e054] focus:outline-none focus:ring-1 focus:ring-[#00e054]/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Effacer la recherche"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right controls: view switcher + refresh */}
        <div className="order-2 flex items-center gap-2 md:order-3">
          <div className="inline-flex rounded-lg border border-[#2c3440] bg-[#1c2228] p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("week")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "week"
                  ? "bg-[#2c3440] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              <span>Semaine</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("month")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-[#2c3440] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Mois</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-[#2c3440] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Films</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenWatchlist}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              hasWatchlist
                ? "border-[#40bcf4]/50 bg-[#40bcf4]/15 text-sky-200 hover:bg-[#40bcf4]/25 hover:text-white"
                : "border-[#2c3440] bg-[#1c2228] text-slate-300 hover:border-[#40bcf4]/50 hover:text-white"
            }`}
            title="Configurer ou synchroniser ma Watchlist Letterboxd"
          >
            <Bookmark
              className={`h-3.5 w-3.5 ${
                hasWatchlist ? "fill-[#40bcf4] text-[#40bcf4]" : "text-slate-400"
              }`}
            />
            <span className="hidden sm:inline">
              {watchlistStatus?.username
                ? `@${watchlistStatus.username}`
                : hasWatchlist
                  ? "Watchlist CSV"
                  : "Watchlist"}
            </span>
            {hasWatchlist && watchlistStatus && (
              <span className="rounded-full bg-[#40bcf4] px-1.5 py-0.2 text-[10px] font-bold text-[#08131b]">
                {watchlistStatus.matchedMovies.length}
              </span>
            )}
          </button>

          <div className="relative">
            <div className="flex items-center">
              <button
                type="button"
                onClick={onRefresh}
                disabled={syncStatus?.inProgress}
                className="inline-flex items-center gap-1.5 rounded-l-lg border border-[#2c3440] bg-[#1c2228] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#00e054]/50 hover:text-white disabled:opacity-60"
                title="Rafraîchir la programmation"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncStatus?.inProgress ? "animate-spin text-[#00e054]" : ""}`}
                />
                <span className="hidden sm:inline">
                  {syncStatus?.inProgress
                    ? syncStatus.stage === "enriching"
                      ? `Letterboxd ${syncStatus.letterboxdDone}/${syncStatus.letterboxdTotal}`
                      : `Sync ${syncStatus.cinemasDone}/${syncStatus.cinemasTotal}`
                    : "Rafraîchir"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowHealth((v) => !v)}
                className="inline-flex items-center gap-1 rounded-r-lg border border-l-0 border-[#2c3440] bg-[#1c2228] px-2 py-1.5 text-xs text-slate-400 hover:bg-[#252d36] hover:text-white"
                title="État des cinémas"
              >
                {errCount > 0 ? (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#00e054]" />
                )}
                <span>
                  {okCount}/{totalCount}
                </span>
              </button>
            </div>

            {showHealth && syncStatus && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[#2c3440] bg-[#1c2228] p-3 shadow-2xl z-50">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      État du cache & scraping
                    </span>
                    {syncStatus.finishedAt && (
                      <p className="text-[11px] text-slate-500">
                        Mis à jour le{" "}
                        {new Date(syncStatus.finishedAt).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHealth(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-xs">
                  {syncStatus.cinemas.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md bg-[#14181c] px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="truncate text-slate-200">{c.shortName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400">{c.screeningsCount} s.</span>
                        {c.status === "ok" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#00e054]" />
                        ) : c.status === "error" ? (
                          <span title={c.errorMessage || "Erreur"}>
                            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                          </span>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

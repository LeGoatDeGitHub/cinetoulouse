import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Sparkles } from "lucide-react";
import type {
  CinemaWithSync,
  ScreeningWithDetails,
  SyncStatus,
  Version,
  WatchlistStatus,
} from "../shared/types";
import { CalendarMonthView } from "./components/CalendarMonthView";
import { CalendarWeekView } from "./components/CalendarWeekView";
import { FilterBar } from "./components/FilterBar";
import { Header, type ViewMode } from "./components/Header";
import { ListView } from "./components/ListView";
import { ScreeningModal } from "./components/ScreeningModal";
import { WatchlistModal } from "./components/WatchlistModal";
import {
  fetchCinemas,
  fetchScreenings,
  fetchSyncStatus,
  fetchWatchlistStatus,
  triggerRefresh,
} from "./lib/api";
import {
  addDays,
  getMonthGridDates,
  getTodayParis,
} from "./lib/dates";

const STORAGE_KEY = "cinetoulouse.prefs.v1";

interface SavedPrefs {
  viewMode?: ViewMode;
  cultOnly?: boolean;
  watchlistOnly?: boolean;
  selectedVersions?: Version[];
  selectedCinemas?: string[];
  includeOffsite?: boolean;
  minRating?: number;
}

function loadPrefs(): SavedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPrefs) : {};
  } catch {
    return {};
  }
}

export function App() {
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const today = useMemo(() => getTodayParis(), []);

  const [viewMode, setViewMode] = useState<ViewMode>(initialPrefs.viewMode || "week");
  const [cultOnly, setCultOnly] = useState<boolean>(initialPrefs.cultOnly ?? true);
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(
    initialPrefs.watchlistOnly ?? false
  );
  const [selectedVersions, setSelectedVersions] = useState<Version[]>(
    initialPrefs.selectedVersions || []
  );
  const [selectedCinemas, setSelectedCinemas] = useState<string[]>(
    initialPrefs.selectedCinemas || []
  );
  const [includeOffsite, setIncludeOffsite] = useState<boolean>(
    initialPrefs.includeOffsite ?? false
  );
  const [minRating, setMinRating] = useState<number>(initialPrefs.minRating ?? 0);
  const [search, setSearch] = useState<string>("");

  const [weekStart, setWeekStart] = useState<string>(() => today);
  const [monthState, setMonthState] = useState<{ year: number; monthIndex0: number }>(() => ({
    year: Number(today.slice(0, 4)),
    monthIndex0: Number(today.slice(5, 7)) - 1,
  }));

  const [cinemas, setCinemas] = useState<CinemaWithSync[]>([]);
  const [screenings, setScreenings] = useState<ScreeningWithDetails[]>([]);
  const [allFilmsSearchCount, setAllFilmsSearchCount] = useState<number>(0);
  const [allFilmsWatchlistCount, setAllFilmsWatchlistCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [watchlistStatus, setWatchlistStatus] = useState<WatchlistStatus | null>(null);
  const [watchlistModalOpen, setWatchlistModalOpen] = useState<boolean>(false);
  const [selectedScreening, setSelectedScreening] = useState<ScreeningWithDetails | null>(
    null
  );

  // Persist user filter preferences
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          viewMode,
          cultOnly,
          watchlistOnly,
          selectedVersions,
          selectedCinemas,
          includeOffsite,
          minRating,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [
    viewMode,
    cultOnly,
    watchlistOnly,
    selectedVersions,
    selectedCinemas,
    includeOffsite,
    minRating,
  ]);

  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      return { from: weekStart, to: addDays(weekStart, 6) };
    }
    if (viewMode === "month") {
      const { gridStart, gridEnd } = getMonthGridDates(
        monthState.year,
        monthState.monthIndex0
      );
      return { from: gridStart, to: gridEnd };
    }
    return { from: today, to: undefined };
  }, [viewMode, weekStart, monthState, today]);

  const loadScreenings = useCallback(async () => {
    setLoading(true);
    try {
      const baseParams = {
        from: dateRange.from,
        to: dateRange.to,
        watchlistOnly,
        versions: selectedVersions,
        cinemas: selectedCinemas,
        includeOffsite,
        minRating,
        q: search,
      };
      const res = await fetchScreenings({ ...baseParams, cultOnly });
      setScreenings(res.screenings);

      // If searching in Cult-only mode, check if "Tous les films" has additional hits (e.g. "La Gradiva")
      if (cultOnly && search.trim().length >= 2) {
        const allRes = await fetchScreenings({ ...baseParams, cultOnly: false });
        setAllFilmsSearchCount(allRes.total);
      } else {
        setAllFilmsSearchCount(0);
      }

      // If filtering by Watchlist in Cult-only mode, check if "Tous les films" has more watchlist screenings
      if (cultOnly && watchlistOnly) {
        const wlAllRes = await fetchScreenings({ ...baseParams, cultOnly: false });
        setAllFilmsWatchlistCount(wlAllRes.total);
      } else {
        setAllFilmsWatchlistCount(0);
      }
    } catch (err) {
      console.error("Erreur chargement séances:", err);
    } finally {
      setLoading(false);
    }
  }, [
    dateRange,
    watchlistOnly,
    selectedVersions,
    selectedCinemas,
    includeOffsite,
    minRating,
    search,
    cultOnly,
  ]);

  useEffect(() => {
    void loadScreenings();
  }, [loadScreenings]);

  useEffect(() => {
    void fetchCinemas().then(setCinemas).catch(console.error);
    void fetchSyncStatus().then(setSyncStatus).catch(console.error);
    void fetchWatchlistStatus().then(setWatchlistStatus).catch(console.error);
  }, []);

  // Poll sync progress while a sync is running
  useEffect(() => {
    if (!syncStatus?.inProgress) return;
    const timer = setInterval(async () => {
      try {
        const next = await fetchSyncStatus();
        setSyncStatus(next);
        setCinemas(next.cinemas);
        void loadScreenings();
        if (!next.inProgress) {
          void fetchWatchlistStatus().then(setWatchlistStatus).catch(console.error);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [syncStatus?.inProgress, loadScreenings]);

  const handleRefresh = async () => {
    try {
      const status = await triggerRefresh();
      setSyncStatus(status);
      if (!status.inProgress) {
        setCinemas(status.cinemas);
        void loadScreenings();
      }
    } catch (err) {
      console.error("Erreur refresh:", err);
    }
  };

  const handleJumpToday = () => {
    setWeekStart(today);
    setMonthState({
      year: Number(today.slice(0, 4)),
      monthIndex0: Number(today.slice(5, 7)) - 1,
    });
  };

  const handleWatchlistStatusChange = (next: WatchlistStatus) => {
    setWatchlistStatus(next);
    if (next.totalCount === 0 && watchlistOnly) {
      setWatchlistOnly(false);
      return;
    }
    void loadScreenings();
  };

  const watchlistDisplayedCount = useMemo(
    () => screenings.filter((s) => s.movie.inWatchlist).length,
    [screenings]
  );

  // All screenings of the currently inspected movie (across all upcoming dates)
  const [modalMovieScreenings, setModalMovieScreenings] = useState<ScreeningWithDetails[]>([]);
  useEffect(() => {
    if (!selectedScreening) {
      setModalMovieScreenings([]);
      return;
    }
    const title = selectedScreening.movie.title;
    void fetchScreenings({
      from: today,
      cultOnly: false,
      includeOffsite,
      q: title,
    })
      .then((res) => {
        setModalMovieScreenings(
          res.screenings.filter((s) => s.movie.id === selectedScreening.movie.id)
        );
      })
      .catch(() => {
        setModalMovieScreenings(
          screenings.filter((s) => s.movie.id === selectedScreening.movie.id)
        );
      });
  }, [selectedScreening, today, includeOffsite, screenings]);

  return (
    <div className="min-h-screen bg-[#14181c] text-[#e5e7eb]">
      <Header
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          // When user types a search query, default list view makes finding multi-cinema times immediate if not already browsing
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        syncStatus={syncStatus}
        onRefresh={handleRefresh}
        watchlistStatus={watchlistStatus}
        onOpenWatchlist={() => setWatchlistModalOpen(true)}
      />

      <FilterBar
        cinemas={cinemas}
        selectedCinemas={selectedCinemas}
        onSelectedCinemasChange={setSelectedCinemas}
        cultOnly={cultOnly}
        onCultOnlyChange={setCultOnly}
        watchlistOnly={watchlistOnly}
        onWatchlistOnlyChange={setWatchlistOnly}
        watchlistStatus={watchlistStatus}
        onOpenWatchlist={() => setWatchlistModalOpen(true)}
        watchlistDisplayedCount={watchlistDisplayedCount}
        selectedVersions={selectedVersions}
        onSelectedVersionsChange={setSelectedVersions}
        includeOffsite={includeOffsite}
        onIncludeOffsiteChange={setIncludeOffsite}
        minRating={minRating}
        onMinRatingChange={setMinRating}
        totalDisplayed={screenings.length}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        {/* Sync banner if initial background sync is running */}
        {syncStatus?.inProgress && screenings.length === 0 && (
          <div className="mb-4 rounded-xl border border-[#00e054]/30 bg-[#00e054]/10 px-4 py-3 text-sm text-emerald-200">
            Synchronisation initiale des cinémas toulousains en cours (
            {syncStatus.cinemasDone}/{syncStatus.cinemasTotal})… Les séances apparaissent en direct.
          </div>
        )}

        {/* Helpful prompt when filtering Watchlist in Cultes mode finds more hits in Tous les films */}
        {cultOnly && watchlistOnly && allFilmsWatchlistCount > screenings.length && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#40bcf4]/40 bg-[#40bcf4]/10 px-4 py-2.5 text-xs text-sky-100">
            <span className="inline-flex items-center gap-2">
              <Bookmark className="h-4 w-4 shrink-0 fill-[#40bcf4] text-[#40bcf4]" />
              <span>
                <strong>{allFilmsWatchlistCount}</strong> séance
                {allFilmsWatchlistCount > 1 ? "s" : ""} de ta Watchlist trouvée
                {allFilmsWatchlistCount > 1 ? "s" : ""} dans <strong>Tous les films</strong>{" "}
                (actuellement filtré sur Cultes & Patrimoine).
              </span>
            </span>
            <button
              type="button"
              onClick={() => setCultOnly(false)}
              className="rounded-lg bg-[#40bcf4] px-3 py-1 font-bold text-[#08131b] hover:bg-[#66cbff] transition-colors"
            >
              Afficher dans Tous les films
            </button>
          </div>
        )}

        {/* Helpful prompt when searching in Cultes mode finds hits in Tous les films */}
        {cultOnly && search.trim().length >= 2 && allFilmsSearchCount > screenings.length && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <strong>{allFilmsSearchCount}</strong> séance{allFilmsSearchCount > 1 ? "s" : ""}{" "}
                trouvée{allFilmsSearchCount > 1 ? "s" : ""} pour « {search.trim()} » dans{" "}
                <strong>Tous les films</strong> (actuellement filtré sur Cultes & Patrimoine).
              </span>
            </span>
            <button
              type="button"
              onClick={() => setCultOnly(false)}
              className="rounded-lg bg-amber-400 px-3 py-1 font-semibold text-[#14181c] hover:bg-amber-300 transition-colors"
            >
              Afficher dans Tous les films
            </button>
          </div>
        )}

        {viewMode === "week" && (
          <CalendarWeekView
            weekStart={weekStart}
            onWeekStartChange={setWeekStart}
            onJumpToday={handleJumpToday}
            screenings={screenings}
            loading={loading}
            onSelectScreening={setSelectedScreening}
          />
        )}

        {viewMode === "month" && (
          <CalendarMonthView
            year={monthState.year}
            monthIndex0={monthState.monthIndex0}
            onMonthChange={(y, m) => setMonthState({ year: y, monthIndex0: m })}
            onJumpToday={handleJumpToday}
            screenings={screenings}
            loading={loading}
            onSelectScreening={setSelectedScreening}
          />
        )}

        {viewMode === "list" && (
          <ListView
            screenings={screenings}
            loading={loading}
            hasWatchlist={(watchlistStatus?.totalCount ?? 0) > 0}
            onSelectScreening={setSelectedScreening}
          />
        )}
      </main>

      <ScreeningModal
        screening={selectedScreening}
        allMovieScreenings={modalMovieScreenings}
        onSelectScreening={setSelectedScreening}
        onClose={() => setSelectedScreening(null)}
      />

      <WatchlistModal
        open={watchlistModalOpen}
        status={watchlistStatus}
        onClose={() => setWatchlistModalOpen(false)}
        onStatusChange={handleWatchlistStatusChange}
        onFilterWatchlist={(showAllFilms) => {
          setWatchlistOnly(true);
          if (showAllFilms) setCultOnly(false);
        }}
      />
    </div>
  );
}

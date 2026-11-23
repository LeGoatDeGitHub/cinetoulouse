import { useState } from "react";
import { Bookmark, ChevronDown, Filter, Sparkles, Star, Ticket } from "lucide-react";
import type { CinemaWithSync, Version, WatchlistStatus } from "../../shared/types";

interface Props {
  cinemas: CinemaWithSync[];
  selectedCinemas: string[];
  onSelectedCinemasChange: (ids: string[]) => void;
  cultOnly: boolean;
  onCultOnlyChange: (v: boolean) => void;
  watchlistOnly: boolean;
  onWatchlistOnlyChange: (v: boolean) => void;
  watchlistStatus: WatchlistStatus | null;
  onOpenWatchlist: () => void;
  watchlistDisplayedCount: number;
  selectedVersions: Version[];
  onSelectedVersionsChange: (versions: Version[]) => void;
  includeOffsite: boolean;
  onIncludeOffsiteChange: (v: boolean) => void;
  minRating: number;
  onMinRatingChange: (r: number) => void;
  totalDisplayed: number;
}

const VERSION_OPTIONS: Array<{
  id: Version;
  label: string;
  activeClass: string;
}> = [
  {
    id: "VOSTFR",
    label: "VOSTFR",
    activeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
  },
  {
    id: "VF",
    label: "VF",
    activeClass: "bg-sky-500/20 text-sky-300 border-sky-500/50",
  },
  {
    id: "MUET",
    label: "Muet (Ciné-concert)",
    activeClass: "bg-purple-500/20 text-purple-300 border-purple-500/50",
  },
];

export function FilterBar({
  cinemas,
  selectedCinemas,
  onSelectedCinemasChange,
  cultOnly,
  onCultOnlyChange,
  watchlistOnly,
  onWatchlistOnlyChange,
  watchlistStatus,
  onOpenWatchlist,
  watchlistDisplayedCount,
  selectedVersions,
  onSelectedVersionsChange,
  includeOffsite,
  onIncludeOffsiteChange,
  minRating,
  onMinRatingChange,
  totalDisplayed,
}: Props) {
  const [openCinemas, setOpenCinemas] = useState(false);
  const hasWatchlist = Boolean(watchlistStatus && watchlistStatus.totalCount > 0);

  const toggleVersion = (v: Version) => {
    if (selectedVersions.includes(v)) {
      onSelectedVersionsChange(selectedVersions.filter((x) => x !== v));
    } else {
      onSelectedVersionsChange([...selectedVersions, v]);
    }
  };

  const toggleCinema = (id: string) => {
    if (selectedCinemas.includes(id)) {
      onSelectedCinemasChange(selectedCinemas.filter((x) => x !== id));
    } else {
      onSelectedCinemasChange([...selectedCinemas, id]);
    }
  };

  const centreCinemas = cinemas.filter((c) => c.zone === "centre");
  const metropoleCinemas = cinemas.filter((c) => c.zone === "metropole");
  const allSelected = selectedCinemas.length === 0 || selectedCinemas.length === cinemas.length;

  return (
    <div className="border-b border-[#2c3440] bg-[#181d23]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Cult vs All toggle */}
          <div className="inline-flex rounded-lg border border-[#2c3440] bg-[#14181c] p-0.5">
            <button
              type="button"
              onClick={() => onCultOnlyChange(true)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                cultOnly
                  ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Cultes & Patrimoine</span>
            </button>
            <button
              type="button"
              onClick={() => onCultOnlyChange(false)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                !cultOnly
                  ? "bg-[#00e054]/20 text-[#00e054] ring-1 ring-[#00e054]/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Ticket className="h-3.5 w-3.5" />
              <span>Tous les films</span>
            </button>
          </div>

          {/* Watchlist filter toggle */}
          <button
            type="button"
            onClick={() =>
              hasWatchlist ? onWatchlistOnlyChange(!watchlistOnly) : onOpenWatchlist()
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all ${
              hasWatchlist && watchlistOnly
                ? "border-[#40bcf4] bg-[#40bcf4] font-bold text-[#08131b] shadow-md shadow-[#40bcf4]/25"
                : "border-[#2c3440] bg-[#14181c] font-medium text-slate-300 hover:border-[#40bcf4]/60 hover:text-white"
            }`}
            title={
              hasWatchlist
                ? "Filtrer sur les films de ma Watchlist Letterboxd"
                : "Connecter ma Watchlist Letterboxd"
            }
          >
            <Bookmark
              className={`h-3.5 w-3.5 ${
                hasWatchlist && watchlistOnly
                  ? "fill-current text-[#08131b]"
                  : hasWatchlist
                    ? "fill-[#40bcf4] text-[#40bcf4]"
                    : "text-slate-400"
              }`}
            />
            <span>Ma Watchlist</span>
            {hasWatchlist && watchlistStatus && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  watchlistOnly
                    ? "bg-[#08131b]/20 text-[#08131b]"
                    : "bg-[#40bcf4]/20 text-[#40bcf4]"
                }`}
              >
                {watchlistStatus.matchedMovies.length}
              </span>
            )}
          </button>

          {/* Version pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {VERSION_OPTIONS.map((opt) => {
              const active = selectedVersions.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleVersion(opt.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? opt.activeClass
                      : "border-[#2c3440] bg-[#14181c] text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Cinemas dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenCinemas((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                !allSelected
                  ? "border-[#00e054]/50 bg-[#00e054]/10 text-[#00e054]"
                  : "border-[#2c3440] bg-[#14181c] text-slate-300 hover:border-slate-500"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>
                {allSelected
                  ? `Cinémas (${cinemas.length})`
                  : `${selectedCinemas.length} cinéma${selectedCinemas.length > 1 ? "s" : ""}`}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {openCinemas && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setOpenCinemas(false)}
                />
                <div className="absolute left-0 z-50 mt-2 w-[340px] sm:w-[440px] rounded-xl border border-[#2c3440] bg-[#1c2228] p-3.5 shadow-2xl">
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-[#2c3440] pb-2.5">
                    <button
                      type="button"
                      onClick={() => onSelectedCinemasChange([])}
                      className="rounded bg-[#2c3440] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#3a4454]"
                    >
                      Tous
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedCinemasChange(
                          cinemas.filter((c) => c.isArtEtEssai).map((c) => c.id)
                        )
                      }
                      className="rounded bg-[#252d36] px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-[#323d4a]"
                    >
                      Art & Essai
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedCinemasChange(
                          cinemas.filter((c) => c.zone === "centre").map((c) => c.id)
                        )
                      }
                      className="rounded bg-[#252d36] px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-[#323d4a]"
                    >
                      Toulouse Centre
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectedCinemasChange(
                          cinemas.filter((c) => !c.isArtEtEssai).map((c) => c.id)
                        )
                      }
                      className="rounded bg-[#252d36] px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-[#323d4a]"
                    >
                      Grands circuits
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Toulouse Centre
                      </div>
                      <div className="space-y-1">
                        {centreCinemas.map((c) => {
                          const checked =
                            allSelected || selectedCinemas.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-[#252d36]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  if (allSelected) {
                                    onSelectedCinemasChange(
                                      cinemas.filter((x) => x.id !== c.id).map((x) => x.id)
                                    );
                                  } else {
                                    toggleCinema(c.id);
                                  }
                                }}
                                className="rounded border-slate-600 bg-[#14181c] text-[#00e054] focus:ring-0"
                              />
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="truncate text-slate-200">{c.shortName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Métropole
                      </div>
                      <div className="space-y-1">
                        {metropoleCinemas.map((c) => {
                          const checked =
                            allSelected || selectedCinemas.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-[#252d36]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  if (allSelected) {
                                    onSelectedCinemasChange(
                                      cinemas.filter((x) => x.id !== c.id).map((x) => x.id)
                                    );
                                  } else {
                                    toggleCinema(c.id);
                                  }
                                }}
                                className="rounded border-slate-600 bg-[#14181c] text-[#00e054] focus:ring-0"
                              />
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="truncate text-slate-200">{c.shortName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-[#2c3440] pt-2.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={includeOffsite}
                        onChange={(e) => onIncludeOffsiteChange(e.target.checked)}
                        className="rounded border-slate-600 bg-[#14181c] text-[#00e054] focus:ring-0"
                      />
                      <span>Inclure Cinémathèque hors-les-murs (SYNCHRO région)</span>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Min Letterboxd rating */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-[#2c3440] bg-[#14181c] px-2 py-1 text-xs">
            <Star className="h-3.5 w-3.5 text-[#00e054]" />
            {[
              { val: 0, label: "Toutes" },
              { val: 3.5, label: "3.5+" },
              { val: 4.0, label: "4.0+" },
            ].map((r) => (
              <button
                key={r.val}
                type="button"
                onClick={() => onMinRatingChange(r.val)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                  minRating === r.val
                    ? "bg-[#00e054]/20 text-[#00e054]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>
            <span className="font-semibold text-slate-200">{totalDisplayed}</span> séance
            {totalDisplayed > 1 ? "s" : ""} affichée{totalDisplayed > 1 ? "s" : ""}
          </span>
          {watchlistDisplayedCount > 0 && !watchlistOnly && (
            <span className="inline-flex items-center gap-1 font-semibold text-[#40bcf4]">
              <span>·</span>
              <Bookmark className="h-3 w-3 fill-current" />
              <span>{watchlistDisplayedCount} Watchlist</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

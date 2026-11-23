import { useMemo, useState } from "react";
import { ArrowDownUp, Bookmark, ExternalLink, Sparkles, Star, Ticket } from "lucide-react";
import type { Movie, ScreeningWithDetails } from "../../shared/types";
import { formatDayHeader } from "../lib/dates";
import { formatVersionLabel } from "../lib/gcal";
import { GoogleCalButton } from "./GoogleCalButton";
import { MoviePoster } from "./MoviePoster";
import { versionBadgeClass } from "./ScreeningModal";

interface Props {
  screenings: ScreeningWithDetails[];
  loading: boolean;
  hasWatchlist: boolean;
  onSelectScreening: (s: ScreeningWithDetails) => void;
}

interface GroupedMovie {
  movie: Movie;
  screenings: ScreeningWithDetails[];
  reasons: string[];
  effectiveCult: boolean;
}

export function ListView({ screenings, loading, hasWatchlist, onSelectScreening }: Props) {
  const [sortBy, setSortBy] = useState<"watchlist" | "soonest" | "rating">("soonest");

  const groups = useMemo<GroupedMovie[]>(() => {
    const map = new Map<number, GroupedMovie>();
    for (const s of screenings) {
      let g = map.get(s.movie.id);
      if (!g) {
        g = {
          movie: s.movie,
          screenings: [],
          reasons: [...s.effectiveCultReasons],
          effectiveCult: s.effectiveCult,
        };
        map.set(s.movie.id, g);
      } else {
        g.effectiveCult = g.effectiveCult || s.effectiveCult;
        for (const r of s.effectiveCultReasons) {
          if (!g.reasons.includes(r)) g.reasons.push(r);
        }
      }
      g.screenings.push(s);
    }

    const arr = [...map.values()];
    if (sortBy === "watchlist") {
      arr.sort((a, b) => {
        const wa = a.movie.inWatchlist ? 1 : 0;
        const wb = b.movie.inWatchlist ? 1 : 0;
        if (wb !== wa) return wb - wa;
        return a.screenings[0].startsAt.localeCompare(b.screenings[0].startsAt);
      });
    } else if (sortBy === "rating") {
      arr.sort((a, b) => {
        const ra = a.movie.letterboxdRating ?? -1;
        const rb = b.movie.letterboxdRating ?? -1;
        if (rb !== ra) return rb - ra;
        return a.screenings[0].startsAt.localeCompare(b.screenings[0].startsAt);
      });
    } else {
      arr.sort((a, b) =>
        a.screenings[0].startsAt.localeCompare(b.screenings[0].startsAt)
      );
    }
    return arr;
  }, [screenings, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-300">
          <span className="font-bold text-white">{groups.length}</span> film
          {groups.length > 1 ? "s" : ""} à l’affiche
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-[#2c3440] bg-[#1c2228] p-0.5 text-xs">
          <ArrowDownUp className="ml-2 h-3.5 w-3.5 text-slate-400" />
          {hasWatchlist && (
            <button
              type="button"
              onClick={() => setSortBy("watchlist")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${
                sortBy === "watchlist"
                  ? "bg-[#40bcf4] font-bold text-[#08131b]"
                  : "text-sky-300 hover:text-white"
              }`}
            >
              <Bookmark className="h-3 w-3 fill-current" />
              Watchlist d’abord
            </button>
          )}
          <button
            type="button"
            onClick={() => setSortBy("soonest")}
            className={`rounded-md px-2.5 py-1 font-medium ${
              sortBy === "soonest"
                ? "bg-[#2c3440] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Prochaine séance
          </button>
          <button
            type="button"
            onClick={() => setSortBy("rating")}
            className={`rounded-md px-2.5 py-1 font-medium ${
              sortBy === "rating"
                ? "bg-[#2c3440] text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Note Letterboxd
          </button>
        </div>
      </div>

      {loading && groups.length === 0 ? (
        <div className="rounded-xl border border-[#2c3440] bg-[#181e24] p-10 text-center text-sm text-slate-400">
          Chargement de la programmation…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-[#2c3440] bg-[#181e24] p-10 text-center text-sm text-slate-400">
          Aucune séance ne correspond aux filtres sélectionnés.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ movie, screenings: items, reasons, effectiveCult }) => {
            const lbUrl =
              movie.letterboxdUrl ||
              `https://letterboxd.com/search/${encodeURIComponent(movie.title)}/`;

            // Group screenings by date for crisp display
            const byDate = new Map<string, ScreeningWithDetails[]>();
            for (const s of items) {
              const list = byDate.get(s.date) || [];
              list.push(s);
              byDate.set(s.date, list);
            }

            return (
              <article
                key={movie.id}
                className={`rounded-xl border p-4 shadow-md transition-colors ${
                  movie.inWatchlist
                    ? "border-[#40bcf4]/80 bg-gradient-to-r from-[#40bcf4]/15 via-[#1a2731] to-[#1c2228] ring-1 ring-[#40bcf4]/30 shadow-lg shadow-[#40bcf4]/15 hover:border-[#40bcf4]"
                    : "border-[#2c3440] bg-[#1c2228] hover:border-slate-600"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <MoviePoster
                    src={movie.posterUrl}
                    alt={movie.title}
                    className={`h-40 w-28 shrink-0 rounded-lg border self-start ${
                      movie.inWatchlist
                        ? "border-[#40bcf4]/75 ring-2 ring-[#40bcf4]/75 shadow-md shadow-[#40bcf4]/20"
                        : "border-[#2c3440]"
                    }`}
                    iconClassName="h-7 w-7"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-white leading-tight">
                            {movie.title}
                          </h3>
                          {movie.releaseYear && (
                            <span className="text-sm font-medium text-slate-400">
                              {movie.releaseYear}
                            </span>
                          )}
                          {movie.inWatchlist && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#40bcf4] px-2.5 py-0.5 text-[11px] font-bold text-[#08131b] shadow-sm shadow-[#40bcf4]/25">
                              <Bookmark className="h-3 w-3 fill-current" />
                              Dans ma Watchlist
                            </span>
                          )}
                          {effectiveCult && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-500/30">
                              <Sparkles className="h-3 w-3" />
                              Culte
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                          {movie.director && (
                            <span className="font-medium text-slate-200">{movie.director}</span>
                          )}
                          {movie.durationMin && <span>{movie.durationMin} min</span>}
                          {movie.genres && <span>{movie.genres}</span>}
                        </div>
                      </div>

                      {/* Letterboxd badge */}
                      <a
                        href={lbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#00e054]/30 bg-[#00e054]/10 px-2.5 py-1 text-xs font-semibold text-[#00e054] hover:bg-[#00e054]/20"
                      >
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span>
                          {movie.letterboxdRating != null
                            ? `${movie.letterboxdRating.toFixed(2)} / 5`
                            : "Letterboxd"}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reasons.map((r) => (
                          <span
                            key={r}
                            className="rounded bg-[#14181c] px-2 py-0.5 text-[11px] text-amber-200/85 border border-amber-500/20"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Screenings grouped by day */}
                    <div className="mt-3 space-y-2 border-t border-[#2c3440] pt-3">
                      {[...byDate.entries()].map(([date, dayScreenings]) => {
                        const d = formatDayHeader(date);
                        return (
                          <div
                            key={date}
                            className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3"
                          >
                            <div className="w-36 shrink-0 pt-1 text-xs font-semibold text-slate-300">
                              {d.shortDay} {d.dayNum} {d.shortMonth}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {dayScreenings.map((s) => (
                                <div
                                  key={s.id}
                                  onClick={() => onSelectScreening(s)}
                                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#2c3440] bg-[#14181c] px-2.5 py-1 text-xs hover:border-slate-500 hover:bg-[#252d36] transition-colors"
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: s.cinema.color }}
                                  />
                                  <span className="font-bold tabular-nums text-white">
                                    {s.time}
                                  </span>
                                  <span className="text-slate-300">{s.cinema.shortName}</span>
                                  <span
                                    className={`rounded border px-1 py-0.2 text-[10px] font-semibold ${versionBadgeClass(
                                      s.version,
                                      s.isCineConcert
                                    )}`}
                                  >
                                    {formatVersionLabel(s.version, s.isCineConcert)}
                                  </span>
                                  {s.bookingUrl && (
                                    <a
                                      href={s.bookingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Réserver sur le site du cinéma"
                                      className="text-amber-400 hover:text-amber-300"
                                    >
                                      <Ticket className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  <GoogleCalButton screening={s} variant="icon" />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

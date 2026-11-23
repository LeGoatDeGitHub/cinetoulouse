import { Bookmark, ChevronLeft, ChevronRight, Sparkles, Star } from "lucide-react";
import type { ScreeningWithDetails } from "../../shared/types";
import { addDays, formatDayHeader, formatWeekRange, getTodayParis, getWeekDates } from "../lib/dates";
import { formatVersionLabel } from "../lib/gcal";
import { GoogleCalButton } from "./GoogleCalButton";
import { MoviePoster } from "./MoviePoster";
import { versionBadgeClass } from "./ScreeningModal";

interface Props {
  weekStart: string;
  onWeekStartChange: (nextMonday: string) => void;
  onJumpToday: () => void;
  screenings: ScreeningWithDetails[];
  loading: boolean;
  onSelectScreening: (s: ScreeningWithDetails) => void;
}

export function CalendarWeekView({
  weekStart,
  onWeekStartChange,
  onJumpToday,
  screenings,
  loading,
  onSelectScreening,
}: Props) {
  const days = getWeekDates(weekStart);
  const today = getTodayParis();

  const byDate = new Map<string, ScreeningWithDetails[]>();
  for (const d of days) byDate.set(d, []);
  for (const s of screenings) {
    const arr = byDate.get(s.date);
    if (arr) arr.push(s);
  }

  return (
    <div className="space-y-4">
      {/* Week toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onWeekStartChange(addDays(weekStart, -7))}
            className="rounded-lg border border-[#2c3440] bg-[#1c2228] p-2 text-slate-300 hover:border-slate-500 hover:text-white"
            aria-label="7 jours précédents"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onJumpToday}
            className="rounded-lg border border-[#2c3440] bg-[#1c2228] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#00e054]/50 hover:text-white"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={() => onWeekStartChange(addDays(weekStart, 7))}
            className="rounded-lg border border-[#2c3440] bg-[#1c2228] p-2 text-slate-300 hover:border-slate-500 hover:text-white"
            aria-label="7 jours suivants"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-2 text-base font-bold text-white sm:text-lg">
            {formatWeekRange(weekStart)}
          </h2>
        </div>

        {loading && (
          <span className="text-xs text-slate-400 animate-pulse">Chargement…</span>
        )}
      </div>

      {/* 7-column calendar grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const info = formatDayHeader(day);
          const isToday = day === today;
          const isPast = day < today;
          const dayItems = byDate.get(day) || [];
          const wlCount = dayItems.filter((s) => s.movie.inWatchlist).length;

          return (
            <div
              key={day}
              className={`flex min-h-[260px] flex-col rounded-xl border ${
                isToday
                  ? "border-[#00e054]/60 bg-[#1a2229]"
                  : "border-[#2c3440] bg-[#181e24]"
              } ${isPast ? "opacity-60" : ""}`}
            >
              {/* Day header */}
              <div
                className={`flex items-center justify-between border-b px-3 py-2 ${
                  isToday ? "border-[#00e054]/30 bg-[#00e054]/10" : "border-[#2c3440]"
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-xs font-semibold uppercase ${
                      isToday ? "text-[#00e054]" : "text-slate-400"
                    }`}
                  >
                    {info.shortDay}
                  </span>
                  <span
                    className={`text-base font-bold ${
                      isToday ? "text-white" : "text-slate-200"
                    }`}
                  >
                    {info.dayNum}
                  </span>
                  <span className="text-[11px] text-slate-500">{info.shortMonth}</span>
                </div>
                <div className="flex items-center gap-1">
                  {wlCount > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full bg-[#40bcf4] px-1.5 py-0.5 text-[10px] font-bold text-[#08131b]"
                      title={`${wlCount} séance${wlCount > 1 ? "s" : ""} de ta Watchlist`}
                    >
                      <Bookmark className="h-2.5 w-2.5 fill-current" />
                      {wlCount}
                    </span>
                  )}
                  {dayItems.length > 0 && (
                    <span className="rounded-full bg-[#2c3440] px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                      {dayItems.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Screenings list */}
              <div className="flex-1 space-y-2 p-2">
                {dayItems.length === 0 ? (
                  <div className="flex h-full min-h-[120px] items-center justify-center text-center text-[11px] text-slate-600">
                    Aucune séance
                  </div>
                ) : (
                  dayItems.map((s) => {
                    const isWl = s.movie.inWatchlist;
                    const verLabel =
                      s.version === "MUET"
                        ? "Muet"
                        : s.version === "UNKNOWN"
                          ? ""
                          : s.version;

                    return (
                      <div
                        key={s.id}
                        onClick={() => onSelectScreening(s)}
                        className={`group relative cursor-pointer overflow-hidden rounded-lg border p-2 transition-all ${
                          isWl
                            ? "border-[#40bcf4]/80 bg-gradient-to-br from-[#40bcf4]/18 via-[#192833] to-[#1c2228] ring-1 ring-[#40bcf4]/35 shadow-md shadow-[#40bcf4]/15 hover:border-[#40bcf4] hover:from-[#40bcf4]/25"
                            : "border-[#2c3440] bg-[#1c2228] hover:border-slate-500 hover:bg-[#232b33]"
                        }`}
                      >
                        <div
                          className="absolute bottom-0 left-0 top-0 w-1"
                          style={{ backgroundColor: s.cinema.color }}
                        />
                        <div className="pl-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold tabular-nums text-white">
                              {s.time}
                            </span>
                            <div className="flex items-center gap-1">
                              {verLabel && (
                                <span
                                  className={`rounded border px-1 py-0.2 text-[9px] font-bold uppercase leading-tight ${versionBadgeClass(
                                    s.version,
                                    s.isCineConcert
                                  )}`}
                                >
                                  {verLabel}
                                </span>
                              )}
                              <GoogleCalButton
                                screening={s}
                                variant="icon"
                                className="opacity-75 group-hover:opacity-100"
                              />
                            </div>
                          </div>

                          <div className="mt-1.5 flex gap-2">
                            <MoviePoster
                              src={s.movie.posterUrl}
                              alt={s.movie.title}
                              className={`h-[60px] w-10 shrink-0 rounded border ${
                                isWl
                                  ? "border-[#40bcf4]/70 ring-2 ring-[#40bcf4]/75 shadow-sm shadow-[#40bcf4]/25"
                                  : "border-white/10 shadow-sm"
                              }`}
                              iconClassName="h-4 w-4"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-2 text-xs font-semibold leading-snug text-slate-100 group-hover:text-white">
                                {s.movie.title}
                              </div>

                              <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-400">
                                <span className="truncate">{s.cinema.shortName}</span>
                                {s.movie.letterboxdRating != null && (
                                  <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-[#00e054]">
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                    {s.movie.letterboxdRating.toFixed(1)}
                                  </span>
                                )}
                              </div>

                              {(isWl ||
                                s.isCineConcert ||
                                s.effectiveCult ||
                                s.movie.releaseYear) && (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {isWl && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-[#40bcf4] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#08131b]">
                                      <Bookmark className="h-2.5 w-2.5 fill-current" />
                                      Watchlist
                                    </span>
                                  )}
                                  {s.movie.releaseYear && (
                                    <span className="text-[10px] text-slate-500">
                                      {s.movie.releaseYear}
                                    </span>
                                  )}
                                  {s.isCineConcert && (
                                    <span className="rounded bg-purple-500/20 px-1 py-0.2 text-[9px] font-medium text-purple-300">
                                      Ciné-concert
                                    </span>
                                  )}
                                  {s.effectiveCult && !s.isCineConcert && s.labels[0] && (
                                    <span className="inline-flex items-center gap-0.5 truncate max-w-[95px] rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-medium text-amber-300">
                                      <Sparkles className="h-2 w-2 shrink-0" />
                                      <span className="truncate">{s.labels[0]}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import type { ScreeningWithDetails } from "../../shared/types";
import {
  formatDayHeader,
  formatMonthTitle,
  getMonthGridDates,
  getTodayParis,
} from "../lib/dates";
import { formatVersionLabel } from "../lib/gcal";
import { GoogleCalButton } from "./GoogleCalButton";
import { MoviePoster } from "./MoviePoster";
import { versionBadgeClass } from "./ScreeningModal";

interface Props {
  year: number;
  monthIndex0: number;
  onMonthChange: (year: number, monthIndex0: number) => void;
  onJumpToday: () => void;
  screenings: ScreeningWithDetails[];
  loading: boolean;
  onSelectScreening: (s: ScreeningWithDetails) => void;
}

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function CalendarMonthView({
  year,
  monthIndex0,
  onMonthChange,
  onJumpToday,
  screenings,
  loading,
  onSelectScreening,
}: Props) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const { dates } = getMonthGridDates(year, monthIndex0);
  const today = getTodayParis();

  const byDate = new Map<string, ScreeningWithDetails[]>();
  for (const s of screenings) {
    const arr = byDate.get(s.date) || [];
    arr.push(s);
    byDate.set(s.date, arr);
  }

  const prevMonth = () => {
    if (monthIndex0 === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, monthIndex0 - 1);
  };

  const nextMonth = () => {
    if (monthIndex0 === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, monthIndex0 + 1);
  };

  const expandedItems = expandedDate ? byDate.get(expandedDate) || [] : [];

  return (
    <div className="space-y-4">
      {/* Month toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg border border-[#2c3440] bg-[#1c2228] p-2 text-slate-300 hover:border-slate-500 hover:text-white"
            aria-label="Mois précédent"
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
            onClick={nextMonth}
            className="rounded-lg border border-[#2c3440] bg-[#1c2228] p-2 text-slate-300 hover:border-slate-500 hover:text-white"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-2 text-base font-bold text-white sm:text-lg">
            {formatMonthTitle(year, monthIndex0)}
          </h2>
        </div>

        {loading && (
          <span className="text-xs text-slate-400 animate-pulse">Chargement…</span>
        )}
      </div>

      {/* Month grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[780px] overflow-hidden rounded-xl border border-[#2c3440] bg-[#181e24]">
          <div className="grid grid-cols-7 border-b border-[#2c3440] bg-[#14181c]">
            {WEEKDAY_HEADERS.map((h) => (
              <div
                key={h}
                className="px-2.5 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                {h}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-[#2c3440]">
            {dates.map((day) => {
              const dayMonth = Number(day.slice(5, 7)) - 1;
              const isCurrentMonth = dayMonth === monthIndex0;
              const isToday = day === today;
              const items = byDate.get(day) || [];
              const wlItems = items.filter((s) => s.movie.inWatchlist);
              const otherItems = items.filter((s) => !s.movie.inWatchlist);
              const visible = [...wlItems, ...otherItems].slice(0, 4);
              const overflow = items.length - visible.length;

              return (
                <div
                  key={day}
                  className={`min-h-[126px] p-1.5 ${
                    !isCurrentMonth ? "bg-[#13171b] opacity-45" : ""
                  } ${isToday ? "bg-[#00e054]/5 ring-1 ring-inset ring-[#00e054]/40" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isToday ? "bg-[#00e054] text-[#0c1218]" : "text-slate-300"
                      }`}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    <div className="flex items-center gap-1">
                      {wlItems.length > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-[#40bcf4] px-1.5 py-0.2 text-[9px] font-bold text-[#08131b]"
                          title={`${wlItems.length} séance${wlItems.length > 1 ? "s" : ""} Watchlist`}
                        >
                          <Bookmark className="h-2 w-2 fill-current" />
                          {wlItems.length}
                        </span>
                      )}
                      {items.length > 0 && (
                        <span className="text-[10px] text-slate-500">
                          {items.length} s.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {visible.map((s) => {
                      const isWl = s.movie.inWatchlist;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onSelectScreening(s)}
                          className={`flex w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-left text-[11px] transition-colors ${
                            isWl
                              ? "border-[#40bcf4]/75 bg-[#40bcf4]/20 font-semibold text-white shadow-sm shadow-[#40bcf4]/10 hover:bg-[#40bcf4]/30"
                              : "border-[#2c3440]/80 bg-[#1c2228] hover:bg-[#28313b]"
                          }`}
                        >
                          <MoviePoster
                            src={s.movie.posterUrl}
                            alt=""
                            className={`h-5 w-3.5 shrink-0 rounded-[2px] border ${
                              isWl ? "border-[#40bcf4]/80" : "border-white/10"
                            }`}
                            iconClassName="h-2.5 w-2.5"
                          />
                          {isWl ? (
                            <Bookmark className="h-2.5 w-2.5 shrink-0 fill-[#40bcf4] text-[#40bcf4]" />
                          ) : (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: s.cinema.color }}
                            />
                          )}
                          <span className="shrink-0 font-semibold tabular-nums text-slate-300">
                            {s.time}
                          </span>
                          <span className="truncate text-slate-100">{s.movie.title}</span>
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedDate(day)}
                        className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-[#00e054] hover:bg-[#00e054]/10"
                      >
                        + {overflow} autre{overflow > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail drawer modal */}
      {expandedDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setExpandedDate(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#2c3440] bg-[#1c2228] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {formatDayHeader(expandedDate).fullLabel} ({expandedItems.length} séances)
              </h3>
              <button
                type="button"
                onClick={() => setExpandedDate(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-[#2c3440] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              {expandedItems.map((s) => {
                const isWl = s.movie.inWatchlist;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setExpandedDate(null);
                      onSelectScreening(s);
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      isWl
                        ? "border-[#40bcf4]/75 bg-gradient-to-r from-[#40bcf4]/15 to-[#14181c] hover:border-[#40bcf4]"
                        : "border-[#2c3440] bg-[#14181c] hover:border-slate-500 hover:bg-[#252d36]"
                    }`}
                  >
                    <MoviePoster
                      src={s.movie.posterUrl}
                      alt={s.movie.title}
                      className={`h-[54px] w-9 shrink-0 rounded-md border ${
                        isWl
                          ? "border-[#40bcf4]/75 ring-2 ring-[#40bcf4]/70"
                          : "border-[#2c3440]"
                      }`}
                      iconClassName="h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: s.cinema.color }}
                        />
                        <span className="text-xs font-bold tabular-nums text-white">
                          {s.time}
                        </span>
                        <span className="truncate text-xs font-semibold text-slate-100">
                          {s.movie.title}
                        </span>
                        {isWl && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-[#40bcf4] px-1.5 py-0.5 text-[10px] font-bold text-[#08131b]">
                            <Bookmark className="h-2.5 w-2.5 fill-current" />
                            Watchlist
                          </span>
                        )}
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${versionBadgeClass(
                            s.version,
                            s.isCineConcert
                          )}`}
                        >
                          {formatVersionLabel(s.version, s.isCineConcert)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400 pl-4">
                        <span>{s.cinema.shortName}</span>
                        {s.movie.letterboxdRating != null && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[#00e054]">
                            <Star className="h-3 w-3 fill-current" />
                            {s.movie.letterboxdRating.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <GoogleCalButton screening={s} variant="compact" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

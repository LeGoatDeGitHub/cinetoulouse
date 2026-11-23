import { useEffect } from "react";
import { Bookmark, Clock, ExternalLink, MapPin, Sparkles, Star, Ticket, X } from "lucide-react";
import type { ScreeningWithDetails } from "../../shared/types";
import { formatDayHeader } from "../lib/dates";
import { formatVersionLabel } from "../lib/gcal";
import { GoogleCalButton } from "./GoogleCalButton";
import { MoviePoster } from "./MoviePoster";

interface Props {
  screening: ScreeningWithDetails | null;
  allMovieScreenings: ScreeningWithDetails[];
  onSelectScreening: (s: ScreeningWithDetails) => void;
  onClose: () => void;
}

export function versionBadgeClass(version: ScreeningWithDetails["version"], isCineConcert: boolean): string {
  if (version === "MUET" || isCineConcert) {
    return "bg-purple-500/20 text-purple-300 border-purple-500/40";
  }
  if (version === "VOSTFR") {
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  }
  if (version === "VF") {
    return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  }
  return "bg-slate-700/60 text-slate-300 border-slate-600";
}

export function ScreeningModal({
  screening,
  allMovieScreenings,
  onSelectScreening,
  onClose,
}: Props) {
  useEffect(() => {
    if (!screening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screening, onClose]);

  if (!screening) return null;

  const { movie, cinema } = screening;
  const dayInfo = formatDayHeader(screening.date);
  const versionText = formatVersionLabel(screening.version, screening.isCineConcert);
  const endHour = screening.endsAt.slice(11, 16);
  const lbUrl =
    movie.letterboxdUrl ||
    `https://letterboxd.com/search/${encodeURIComponent(movie.title)}/`;
  const otherScreenings = allMovieScreenings.filter((s) => s.id !== screening.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-[#1c2228] shadow-2xl ${
          movie.inWatchlist ? "border-[#40bcf4]/65" : "border-[#2c3440]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 z-10 rounded-lg bg-[#14181c]/80 p-1.5 text-slate-400 hover:bg-[#2c3440] hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-5 sm:p-6">
          {/* Movie Header */}
          <div className="flex flex-col gap-5 sm:flex-row">
            <MoviePoster
              src={movie.posterUrl}
              alt={movie.title}
              className={`h-48 w-32 shrink-0 rounded-lg border self-start ${
                movie.inWatchlist
                  ? "border-[#40bcf4]/75 ring-2 ring-[#40bcf4]/75 shadow-lg shadow-[#40bcf4]/20"
                  : "border-[#2c3440] shadow-lg"
              }`}
              iconClassName="h-8 w-8"
            />

            <div className="flex-1 pr-6">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {movie.inWatchlist && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#40bcf4] px-2.5 py-0.5 text-[11px] font-bold text-[#08131b] shadow-sm shadow-[#40bcf4]/25">
                    <Bookmark className="h-3 w-3 fill-current" />
                    Dans ma Watchlist
                  </span>
                )}
                {screening.effectiveCult && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-500/40">
                    <Sparkles className="h-3 w-3" />
                    Culte / Patrimoine
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${versionBadgeClass(
                    screening.version,
                    screening.isCineConcert
                  )}`}
                >
                  {versionText}
                </span>
              </div>

              <h2 className="text-xl font-bold text-white leading-tight">{movie.title}</h2>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="mt-0.5 text-xs italic text-slate-400">{movie.originalTitle}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                {movie.director && <span className="font-medium">{movie.director}</span>}
                {movie.releaseYear && <span>{movie.releaseYear}</span>}
                {movie.durationMin && <span>{movie.durationMin} min</span>}
                {movie.genres && <span className="text-slate-400">{movie.genres}</span>}
              </div>

              {/* Letterboxd box */}
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <a
                  href={lbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#00e054]/30 bg-[#00e054]/10 px-3 py-1.5 text-xs font-semibold text-[#00e054] hover:bg-[#00e054]/20 transition-colors"
                >
                  <Star className="h-3.5 w-3.5 fill-current" />
                  <span>
                    {movie.letterboxdRating != null
                      ? `Letterboxd ${movie.letterboxdRating.toFixed(2)} / 5`
                      : "Voir sur Letterboxd"}
                  </span>
                  {movie.letterboxdVotes && (
                    <span className="text-[11px] font-normal text-emerald-300/80">
                      ({movie.letterboxdVotes.toLocaleString("fr-FR")} votes)
                    </span>
                  )}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {screening.effectiveCultReasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {screening.effectiveCultReasons.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-[#14181c] px-2 py-0.5 text-[11px] text-amber-200/90 border border-amber-500/20"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {movie.synopsis && (
            <p className="mt-4 text-xs leading-relaxed text-slate-300 line-clamp-4">
              {movie.synopsis}
            </p>
          )}

          {/* Highlighted selected screening */}
          <div className="mt-5 rounded-xl border border-[#2c3440] bg-[#14181c] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: cinema.color }}
                  />
                  <span className="text-sm font-semibold text-white">{cinema.name}</span>
                  {screening.room && (
                    <span className="rounded bg-[#252d36] px-1.5 py-0.5 text-[11px] text-slate-300">
                      {screening.room}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5 font-medium text-white">
                    <Clock className="h-3.5 w-3.5 text-[#00e054]" />
                    {dayInfo.fullLabel} · {screening.time} – {endHour}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <MapPin className="h-3.5 w-3.5" />
                    {screening.isOffsite && screening.offsiteVenue
                      ? screening.offsiteVenue
                      : cinema.address}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <GoogleCalButton screening={screening} variant="button" />

              {screening.bookingUrl && (
                <a
                  href={screening.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#2c3440] bg-[#1c2228] px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white transition-colors"
                >
                  <Ticket className="h-4 w-4 text-amber-400" />
                  <span>Réserver / Fiche cinéma</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Other screenings of the same movie */}
          {otherScreenings.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Autres séances à Toulouse ({otherScreenings.length})
              </h3>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {otherScreenings.map((other) => {
                  const d = formatDayHeader(other.date);
                  return (
                    <div
                      key={other.id}
                      onClick={() => onSelectScreening(other)}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#2c3440]/80 bg-[#14181c]/70 px-3 py-2 text-xs hover:border-slate-500 hover:bg-[#252d36] transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: other.cinema.color }}
                        />
                        <span className="font-medium text-white">
                          {d.shortDay} {d.dayNum} {d.shortMonth} · {other.time}
                        </span>
                        <span className="truncate text-slate-300">{other.cinema.shortName}</span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${versionBadgeClass(
                            other.version,
                            other.isCineConcert
                          )}`}
                        >
                          {formatVersionLabel(other.version, other.isCineConcert)}
                        </span>
                      </div>
                      <GoogleCalButton screening={other} variant="compact" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

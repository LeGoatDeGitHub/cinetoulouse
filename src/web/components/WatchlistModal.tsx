import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Filter,
  Info,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { WatchlistStatus } from "../../shared/types";
import { clearWatchlist, importWatchlistCsv, syncWatchlist } from "../lib/api";
import { formatDayHeader } from "../lib/dates";
import { MoviePoster } from "./MoviePoster";

interface Props {
  open: boolean;
  status: WatchlistStatus | null;
  onClose: () => void;
  onStatusChange: (next: WatchlistStatus) => void;
  onFilterWatchlist: (showAllFilms: boolean) => void;
}

export function WatchlistModal({
  open,
  status,
  onClose,
  onStatusChange,
  onFilterWatchlist,
}: Props) {
  const [username, setUsername] = useState(status?.username ?? "");
  const [busyAction, setBusyAction] = useState<"sync" | "csv" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(status?.username ?? "");
    setError(null);
    setFeedback(null);
  }, [open, status?.username]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSync = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Indique ton pseudo Letterboxd.");
      return;
    }
    setBusyAction("sync");
    setError(null);
    setFeedback(null);
    try {
      const next = await syncWatchlist(username.trim());
      onStatusChange(next);
      setFeedback(
        `${next.totalCount} film${next.totalCount > 1 ? "s" : ""} synchronisé${next.totalCount > 1 ? "s" : ""} · ${next.matchedMovies.length} à l'affiche à Toulouse${next.truncated ? " (plafonné aux 50 premières pages)" : ""}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la synchronisation Letterboxd."
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCsvFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusyAction("csv");
    setError(null);
    setFeedback(null);
    try {
      const text = await file.text();
      const next = await importWatchlistCsv(text);
      onStatusChange(next);
      setFeedback(
        `Import CSV réussi : ${next.totalCount} film${next.totalCount > 1 ? "s" : ""} · ${next.matchedMovies.length} à l'affiche à Toulouse.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import CSV.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleClear = async () => {
    setBusyAction("clear");
    setError(null);
    setFeedback(null);
    try {
      const next = await clearWatchlist();
      setUsername("");
      onStatusChange(next);
      setFeedback("Watchlist déconnectée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    } finally {
      setBusyAction(null);
    }
  };

  const hasWatchlist = Boolean(status && status.totalCount > 0);
  const matchedMovies = status?.matchedMovies ?? [];
  const hasNonCultMatches = matchedMovies.some((m) => !m.isCult);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#40bcf4]/45 bg-[#1c2228] p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 rounded-lg bg-[#14181c]/80 p-1.5 text-slate-400 hover:bg-[#2c3440] hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 pr-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#40bcf4]/15 text-[#40bcf4] ring-1 ring-[#40bcf4]/40">
            <Bookmark className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Ma Watchlist Letterboxd</h2>
            <p className="text-xs text-slate-400">
              Filtre et repère instantanément les films de ta watchlist projetés à Toulouse.
            </p>
          </div>
        </div>

        {/* No API key required notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#40bcf4]/30 bg-[#40bcf4]/10 px-3.5 py-2.5 text-xs text-sky-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#40bcf4]" />
          <p className="leading-relaxed">
            <strong className="text-white">Aucune clé API requise :</strong> indique simplement ton
            pseudo Letterboxd si ta watchlist est publique, ou importe ton fichier{" "}
            <code className="rounded bg-[#14181c] px-1 py-0.5 text-[#40bcf4]">watchlist.csv</code>{" "}
            si ton compte est privé.
          </p>
        </div>

        {/* Public username sync form */}
        <form onSubmit={handleSync} className="mt-4 space-y-2.5">
          <label
            htmlFor="letterboxd-username"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
          >
            Synchroniser via pseudo public
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 items-center overflow-hidden rounded-lg border border-[#2c3440] bg-[#14181c] focus-within:border-[#40bcf4] focus-within:ring-1 focus-within:ring-[#40bcf4]/40">
              <span className="border-r border-[#2c3440] bg-[#181e24] px-3 py-2 text-xs text-slate-400 select-none">
                letterboxd.com/
              </span>
              <input
                id="letterboxd-username"
                name="letterboxdUsername"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ton-pseudo"
                disabled={busyAction !== null}
                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busyAction !== null}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#40bcf4] px-4 py-2 text-sm font-bold text-[#08131b] shadow-md shadow-[#40bcf4]/20 transition-colors hover:bg-[#66cbff] disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${busyAction === "sync" ? "animate-spin" : ""}`}
              />
              <span>{busyAction === "sync" ? "Synchro…" : "Synchroniser"}</span>
            </button>
          </div>
        </form>

        {/* CSV fallback */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2c3440] bg-[#14181c]/70 px-3.5 py-2.5">
          <div className="text-xs text-slate-400">
            <span className="font-medium text-slate-200">Watchlist privée ?</span>{" "}
            <span>Letterboxd → Settings → Data → Export your data → </span>
            <code className="text-slate-300">watchlist.csv</code>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2c3440] bg-[#1c2228] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#40bcf4]/60 hover:text-white disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5 text-[#40bcf4]" />
              <span>{busyAction === "csv" ? "Import…" : "Importer watchlist.csv"}</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {feedback && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#00e054]/40 bg-[#00e054]/10 px-3.5 py-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00e054]" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Active watchlist summary & Toulouse matches */}
        {hasWatchlist && status && (
          <div className="mt-5 border-t border-[#2c3440] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#40bcf4]/35 bg-[#14181c] px-4 py-3">
              <div className="space-y-0.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {status.source === "letterboxd" && status.username ? (
                    <a
                      href={`https://letterboxd.com/${status.username}/watchlist/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-[#40bcf4] hover:underline"
                    >
                      @{status.username}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-bold text-[#40bcf4]">Import CSV</span>
                  )}
                  <span className="text-slate-400">·</span>
                  <span className="font-semibold text-white">
                    {status.totalCount} film{status.totalCount > 1 ? "s" : ""}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-semibold text-[#00e054]">
                    {matchedMovies.length} à l’affiche à Toulouse
                  </span>
                </div>
                {status.lastSyncedAt && (
                  <p className="text-[11px] text-slate-500">
                    Synchronisée le{" "}
                    {new Date(status.lastSyncedAt).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {matchedMovies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onFilterWatchlist(hasNonCultMatches);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#40bcf4] px-3 py-1.5 text-xs font-bold text-[#08131b] hover:bg-[#66cbff]"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filtrer sur ma Watchlist</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#2c3440] bg-[#1c2228] px-2.5 py-1.5 text-xs text-slate-300 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Déconnecter</span>
                </button>
              </div>
            </div>

            {matchedMovies.length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Dans ta Watchlist et actuellement à Toulouse ({matchedMovies.length})
                </h3>
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {matchedMovies.map((m) => {
                    const nextDate = m.nextScreeningAt.slice(0, 10);
                    const nextTime = m.nextScreeningAt.slice(11, 16);
                    const dayInfo = formatDayHeader(nextDate);
                    return (
                      <div
                        key={m.movieId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#40bcf4]/40 bg-gradient-to-r from-[#40bcf4]/10 to-[#14181c] px-3 py-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <MoviePoster
                            src={m.posterUrl}
                            alt={m.title}
                            className="h-14 w-9 shrink-0 rounded border border-[#40bcf4]/50"
                            iconClassName="h-4 w-4"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-xs font-bold text-white">
                                {m.title}
                              </span>
                              {m.releaseYear && (
                                <span className="text-[11px] text-slate-400">
                                  ({m.releaseYear})
                                </span>
                              )}
                              {m.isCult && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-300">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Culte
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                              <span className="text-sky-200">
                                {dayInfo.shortDay} {dayInfo.dayNum} {dayInfo.shortMonth} ·{" "}
                                {nextTime}
                              </span>
                              <span>·</span>
                              <span className="truncate">{m.cinemas.join(", ")}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {m.letterboxdRating != null && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#00e054]">
                              <Star className="h-3 w-3 fill-current" />
                              {m.letterboxdRating.toFixed(1)}
                            </span>
                          )}
                          <span className="rounded-full bg-[#2c3440] px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                            {m.screeningsCount} séance{m.screeningsCount > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-center text-xs text-slate-400">
                Aucun film de ta Watchlist n’est programmé à Toulouse sur les prochains jours.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

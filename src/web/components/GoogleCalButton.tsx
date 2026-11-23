import { CalendarPlus } from "lucide-react";
import type { ScreeningWithDetails } from "../../shared/types";
import { buildGoogleCalendarUrl } from "../lib/gcal";

interface Props {
  screening: ScreeningWithDetails;
  variant?: "compact" | "button" | "icon";
  className?: string;
}

export function GoogleCalButton({ screening, variant = "button", className = "" }: Props) {
  const href = buildGoogleCalendarUrl(screening);

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Ajouter à Google Agenda"
        aria-label={`Ajouter ${screening.movie.title} à Google Agenda`}
        className={`inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-[#00e054]/15 hover:text-[#00e054] transition-colors ${className}`}
      >
        <CalendarPlus className="w-3.5 h-3.5" />
      </a>
    );
  }

  if (variant === "compact") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Ajouter à Google Agenda"
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-[#2c3440]/80 text-slate-200 hover:bg-[#00e054]/20 hover:text-[#00e054] border border-white/10 hover:border-[#00e054]/40 transition-colors ${className}`}
      >
        <CalendarPlus className="w-3 h-3 shrink-0" />
        <span>+Agenda</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold bg-[#00e054] text-[#0b1116] hover:bg-[#19f069] shadow-lg shadow-[#00e054]/10 transition-colors ${className}`}
    >
      <CalendarPlus className="w-4 h-4 shrink-0" />
      <span>Ajouter à Google Agenda</span>
    </a>
  );
}

import type { ScreeningWithDetails, Version } from "../../shared/types";

export function formatVersionLabel(version: Version, isCineConcert: boolean): string {
  if (version === "MUET" && isCineConcert) return "Muet · Ciné-concert";
  if (version === "MUET") return "Muet";
  if (isCineConcert) return `${version === "UNKNOWN" ? "Ciné-concert" : `${version} · Ciné-concert`}`;
  if (version === "VOSTFR") return "VOSTFR";
  if (version === "VF") return "VF";
  return "Version N/C";
}

function toGCalCompact(isoLocal: string): string {
  // "2026-11-23T19:40:00" -> "20261123T194000"
  return isoLocal.replace(/[-:]/g, "").slice(0, 15);
}

export function buildGoogleCalendarUrl(s: ScreeningWithDetails): string {
  const versionLabel = formatVersionLabel(s.version, s.isCineConcert);
  const title = `${s.movie.title} (${versionLabel}) — ${s.cinema.shortName}`;

  const dates = `${toGCalCompact(s.startsAt)}/${toGCalCompact(s.endsAt)}`;
  const location =
    s.isOffsite && s.offsiteVenue
      ? `${s.offsiteVenue} (Hors-les-murs — ${s.cinema.name})`
      : `${s.cinema.name}, ${s.cinema.address}`;

  const lines: string[] = [];
  lines.push(`🎬 ${s.movie.title}${s.movie.releaseYear ? ` (${s.movie.releaseYear})` : ""}`);
  if (s.movie.director) lines.push(`Réalisation : ${s.movie.director}`);
  lines.push(`Version : ${versionLabel}`);
  lines.push(`Lieu : ${s.cinema.name}${s.room ? ` (${s.room})` : ""}`);
  if (s.effectiveCultReasons.length > 0) {
    lines.push(`Sélection / Tags : ${s.effectiveCultReasons.join(" • ")}`);
  } else if (s.labels.length > 0) {
    lines.push(`Tags : ${s.labels.join(" • ")}`);
  }

  lines.push("");
  if (s.movie.letterboxdUrl) {
    const score =
      s.movie.letterboxdRating != null ? `★ ${s.movie.letterboxdRating.toFixed(2)}/5 — ` : "";
    lines.push(`Letterboxd : ${score}${s.movie.letterboxdUrl}`);
  } else {
    lines.push(
      `Letterboxd : https://letterboxd.com/search/${encodeURIComponent(s.movie.title)}/`
    );
  }

  if (s.bookingUrl) {
    lines.push(`Billetterie / Infos cinéma : ${s.bookingUrl}`);
  } else {
    lines.push(`Site du cinéma : ${s.cinema.websiteUrl}`);
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
    ctz: "Europe/Paris",
    location,
    details: lines.join("\n"),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

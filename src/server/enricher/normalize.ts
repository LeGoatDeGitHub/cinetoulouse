import {
  decodeHtmlEntities,
  getCurrentParisYear,
  stripHtml,
} from "../scrapers/utils";

const PREFIX_PATTERNS = [
  /^(?:la\s+s[ée]ance\s+cin[ée]\s+hits|cin[ée]\s+hits|back\s+to\s+basic|il\s+[ée]tait\s+une\s+fois|s[ée]ance\s+sp[ée]ciale|les\s+rendez-vous\s+de\s+la\s+pop|cin[ée]-gourmand|avant-premi[èe]re(?:\s*(?:&|et)\s*rencontre)?)\s*[:•\-–]\s*/i,
];

const SUFFIX_PATTERNS = [
  /\s*pr[ée]c[ée]d[ée]\s+du\s+court[- ]m[ée]trage.*$/i,
  /\s*[-–]\s*version\s+longue$/i,
  /\s*\(version\s+longue\)$/i,
  /\s*\((?:4k|restaur[ée]e?|vf|vostf?r?|vo|tamoule|hindi|pendjabi|malayalam|t[ée]lougou)\)$/i,
  /\s*[-–]\s*(?:cin[ée]ma|th[ée][âa]tre|salle|universit[ée]|le\s+metronum).*$/i,
];

export function cleanDisplayTitle(raw: string): string {
  return decodeHtmlEntities(stripHtml(raw))
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSearchTitle(raw: string): string {
  let t = cleanDisplayTitle(raw);
  for (const re of PREFIX_PATTERNS) {
    t = t.replace(re, "");
  }
  for (const re of SUFFIX_PATTERNS) {
    t = t.replace(re, "");
  }
  // If title has "French Title (Original Title)" and French part is >= 3 chars, keep base or extract both separately
  return t.replace(/\s+/g, " ").trim();
}

export function extractParentheticalTitle(raw: string): string | null {
  const m = cleanDisplayTitle(raw).match(/\(([^()]{3,60})\)\s*$/);
  if (!m) return null;
  const inner = m[1].trim();
  if (/^(?:vf|vost|vostfr|vo|4k|version longue|tamoule|hindi|restaur[ée]e?|\d{4})$/i.test(inner)) {
    return null;
  }
  return inner;
}

export function stripParentheticalTitle(raw: string): string {
  const cleaned = cleanSearchTitle(raw);
  const paren = extractParentheticalTitle(cleaned);
  if (!paren) return cleaned;
  return cleaned.replace(/\s*\([^()]+\)\s*$/, "").trim();
}

export function canonicalizeTitle(raw: string): string {
  return stripParentheticalTitle(raw)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isLiveBroadcastTitle(title: string, genres?: string | null): boolean {
  const haystack = `${title} ${genres ?? ""}`.toLowerCase();
  return /(?:com[ée]die[- ]fran[çc]aise|op[ée]ra\s+national\s+de\s+paris|metropolitan\s+opera|\(met\)|\bmet\b|royal\s+opera|ballet\s+au\s+cin[ée]ma|op[ée]ra\s+au\s+cin[ée]ma|th[ée][âa]tre\s+au\s+cin[ée]ma|\bbolcho[iï]\b)/i.test(
    haystack
  );
}

export interface CultEvaluation {
  isMovieCult: boolean;
  movieReasons: string[];
  isScreeningCultOverride: boolean;
  screeningCultReason: string | null;
}

export function evaluateCultSignals(params: {
  title: string;
  genres?: string | null;
  releaseYear?: number | null;
  cinemaId: string;
  labels?: string[];
  isCineConcert?: boolean;
  isCultOverride?: boolean;
  cultReasonOverride?: string | null;
  isLiveBroadcast?: boolean;
}): CultEvaluation {
  const isLive = params.isLiveBroadcast || isLiveBroadcastTitle(params.title, params.genres);
  if (isLive) {
    return {
      isMovieCult: false,
      movieReasons: [],
      isScreeningCultOverride: false,
      screeningCultReason: null,
    };
  }

  const movieReasons = new Set<string>();
  const labels = params.labels ?? [];
  const labelText = labels.join(" | ");
  const currentYear = getCurrentParisYear();
  const cultThresholdYear = currentYear - 3;

  if (params.releaseYear && params.releaseYear <= cultThresholdYear) {
    movieReasons.add(`Film de ${params.releaseYear}`);
  }
  if (/ugc culte/i.test(labelText)) {
    movieReasons.add("Sélection UGC Culte");
  }
  if (/pestacles/i.test(labelText)) {
    movieReasons.add("Les Pestacles UGC");
  }
  if (/patrimoine/i.test(labelText)) {
    movieReasons.add("Patrimoine Art & Essai");
  }
  if (/r[ée]pertoire/i.test(labelText)) {
    movieReasons.add("Répertoire Utopia");
  }
  if (/cin[ée]\s*hits|back\s*to\s*basic|r[ée]trospective|classique|il\s*[ée]tait\s*une\s*fois|rendez-vous\s*de\s*la\s*pop/i.test(labelText + " " + params.title)) {
    const matched = labels.find((l) =>
      /cin[ée]\s*hits|back\s*to\s*basic|r[ée]trospective|classique|il\s*[ée]tait\s*une\s*fois|rendez-vous\s*de\s*la\s*pop/i.test(l)
    );
    movieReasons.add(matched || "Séance Rétrospective / Culte");
  }

  let isScreeningCultOverride = Boolean(params.isCultOverride);
  let screeningCultReason: string | null = params.cultReasonOverride ?? null;

  if (params.cinemaId === "cinematheque") {
    isScreeningCultOverride = true;
    screeningCultReason = screeningCultReason || "La Cinémathèque de Toulouse";
  } else if (params.isCineConcert || /cin[ée]\s*-?\s*concert/i.test(labelText)) {
    isScreeningCultOverride = true;
    screeningCultReason = screeningCultReason || "Ciné-concert";
  } else if (/cin[ée]\s*-?\s*club/i.test(labelText)) {
    isScreeningCultOverride = true;
    screeningCultReason = screeningCultReason || "Ciné-club";
  }

  return {
    isMovieCult: movieReasons.size > 0,
    movieReasons: [...movieReasons],
    isScreeningCultOverride,
    screeningCultReason,
  };
}

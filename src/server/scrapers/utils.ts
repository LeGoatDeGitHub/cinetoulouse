import * as cheerio from "cheerio";

export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15000, retries = 2, headers, ...rest } = init;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          "User-Agent": DEFAULT_UA,
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
          ...headers,
        },
      });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<string> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () =>
    runWorker()
  );
  await Promise.all(workers);
  return results;
}

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#039;": "'",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&oelig;": "œ",
  "&OElig;": "Œ",
  "&laquo;": "«",
  "&raquo;": "»",
};

export function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input) return "";
  if (!input.includes("&")) return input.trim();
  const quick = input.replace(
    /&(amp|lt|gt|quot|apos|#039|rsquo|lsquo|rdquo|ldquo|nbsp|ndash|mdash|hellip|oelig|OElig|laquo|raquo);/g,
    (m) => NAMED_ENTITIES[m] ?? m
  );
  if (!quick.includes("&")) return quick.trim();
  return cheerio.load(`<span>${quick}</span>`).text().trim();
}

export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return cheerio.load(input).text().replace(/\s+/g, " ").trim();
}

/**
 * Returns YYYY-MM-DD in Europe/Paris timezone for today + offsetDays.
 */
export function getParisDateStr(offsetDays = 0): string {
  const now = new Date();
  const parisNowStr = now.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const [y, m, d] = parisNowStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Computes YYYY-MM-DDTHH:mm:00 end timestamp from startsAt and durationMin.
 */
export function computeEndsAt(startsAt: string, durationMin?: number | null): string {
  const mins = durationMin && durationMin > 0 ? durationMin : 110;
  const match = startsAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return startsAt;
  const [, ys, ms, ds, hs, minsStr] = match;
  const dt = new Date(
    Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(minsStr) + mins)
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00`;
}

const FR_MONTHS: Record<string, string> = {
  janvier: "01",
  "janv.": "01",
  janv: "01",
  fevrier: "02",
  février: "02",
  "fevr.": "02",
  "févr.": "02",
  fevr: "02",
  mars: "03",
  avril: "04",
  "avr.": "04",
  avr: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  "juil.": "07",
  juil: "07",
  aout: "08",
  août: "08",
  septembre: "09",
  "sept.": "09",
  sept: "09",
  octobre: "10",
  "oct.": "10",
  oct: "10",
  novembre: "11",
  "nov.": "11",
  nov: "11",
  decembre: "12",
  décembre: "12",
  "dec.": "12",
  "déc.": "12",
  dec: "12",
  déc: "12",
};

export function parseFrenchDate(text: string): string | null {
  const m = text
    .toLowerCase()
    .match(/(\d{1,2})\s+([a-zàâäéèêëïîôöùûüç.]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const monthKey = m[2].replace(/\.$/, "");
  const month = FR_MONTHS[m[2]] || FR_MONTHS[monthKey];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

export function extractYear(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return value >= 1888 && value <= 2035 ? value : null;
  }
  if (!value) return null;
  const m = String(value).match(/\b(18\d{2}|19\d{2}|20[0-3]\d)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1888 && y <= 2035 ? y : null;
}

export function getCurrentParisYear(): number {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).slice(0, 4));
}

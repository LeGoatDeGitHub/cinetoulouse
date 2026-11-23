export function getTodayParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function getMonthGridDates(year: number, monthIndex0: number): {
  gridStart: string;
  gridEnd: string;
  dates: string[];
} {
  const firstDay = new Date(Date.UTC(year, monthIndex0, 1));
  const firstStr = firstDay.toISOString().slice(0, 10);
  const gridStart = getMondayOfWeek(firstStr);
  const dates = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Trim trailing row if entire last week is in next month
  const last7 = dates.slice(35);
  const lastMonth = Number(last7[0].slice(5, 7)) - 1;
  const trimmed = lastMonth !== monthIndex0 ? dates.slice(0, 35) : dates;
  return {
    gridStart,
    gridEnd: trimmed[trimmed.length - 1],
    dates: trimmed,
  };
}

const SHORT_DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const FULL_DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const SHORT_MONTHS_FR = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export function formatDayHeader(dateStr: string): {
  shortDay: string;
  dayNum: string;
  shortMonth: string;
  fullLabel: string;
} {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  return {
    shortDay: SHORT_DAYS[dow],
    dayNum: String(d),
    shortMonth: SHORT_MONTHS_FR[m - 1],
    fullLabel: `${FULL_DAYS[dow]} ${d} ${MONTHS_FR[m - 1]} ${y}`,
  };
}

export function formatMonthTitle(year: number, monthIndex0: number): string {
  const name = MONTHS_FR[monthIndex0];
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

export function formatWeekRange(weekStart: string): string {
  const weekEnd = addDays(weekStart, 6);
  const [, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  if (sm === em) {
    return `${sd} – ${ed} ${MONTHS_FR[em - 1]} ${ey}`;
  }
  return `${sd} ${SHORT_MONTHS_FR[sm - 1]} – ${ed} ${SHORT_MONTHS_FR[em - 1]} ${ey}`;
}

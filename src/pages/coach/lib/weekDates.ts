/**
 * Pure date helpers for the coach training-slots week view.
 * Extracted from CoachTrainingSlotsScreen.tsx (§168).
 *
 * IMPORTANT : ces helpers utilisent tous l'heure locale (pas UTC) pour
 * rester cohérents avec le `new Date(iso + "T00:00:00")` pattern du
 * composant — `toIsoDate(getMonday(new Date()))` doit rendre le lundi
 * local, pas le lundi UTC.
 */

export const DAYS_FR = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** `"YYYY-MM-DD"` for today in the local timezone. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns a Date pointing to the Monday of the week containing `date`. */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon…6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** ISO 8601 week number (1–53). */
export function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / 86400000 -
        3 +
        ((jan4.getDay() + 6) % 7)) /
        7,
    )
  );
}

/** `DD/MM` in `fr-FR` locale. */
export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

/** `YYYY-MM-DD` from a Date, using local timezone (not UTC). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive day count between two ISO dates (`"2026-04-20"` → `"2026-04-22"` = 3). */
export function diffDaysInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).getTime();
  const end = new Date(ey, em - 1, ed).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

/** Inclusive list of ISO dates between two bounds. Returns `[]` if `end < start`. */
export function iterateDatesInclusive(
  startIso: string,
  endIso: string,
): string[] {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const out: string[] = [];
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const pad = (v: number) => String(v).padStart(2, "0");
  while (cur.getTime() <= end.getTime()) {
    out.push(
      `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

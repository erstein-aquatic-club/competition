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

// §211 — `getMonday` et `toIsoDate` proviennent désormais de src/lib/date.ts.
// `todayIso` corrige aussi le bug TZ (toISOString → UTC, décalait la date en
// soirée Europe/Paris).
import { getMonday, toISODate as toIsoDate } from "@/lib/date";
export { getMonday, toIsoDate };

/** `"YYYY-MM-DD"` pour aujourd'hui en timezone locale. */
export function todayIso(): string {
  return toIsoDate(new Date());
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

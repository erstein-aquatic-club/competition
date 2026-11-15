/**
 * swimPlanningShared.ts — Shared constants/helpers/types for the swim planning timeline.
 * Consumed by SwimPlanningDemo (coach / group view) and SwimPlanningTimeline
 * (shared presentational component, also used by future SwimmerPlanningPanel).
 */

// §211 — getMonday déplacé dans src/lib/date.ts. Re-export pour compat.
// WeekInfo + getISOWeekNumber déplacés dans src/lib/date.ts. Re-exports pour compat.
import {
  toISODate,
  type WeekInfo,
  getISOWeekNumber,
  getMonday,
} from "@/lib/date";
export { getMonday, getISOWeekNumber };
export type { WeekInfo };

export function generateWeeks(startMonday: Date, count: number): WeekInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(startMonday);
    monday.setDate(startMonday.getDate() + i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      monday,
      sunday,
      weekNumber: getISOWeekNumber(monday),
      // §296 — toISODate (local) au lieu de toISOString().split (UTC) — sinon
      // en heure d'été Paris, le lundi local devient le dimanche en UTC.
      weekKey: toISODate(monday),
    };
  });
}

export const DAY_ROWS = [
  { index: 0, label: "Lun" },
  { index: 1, label: "Mar" },
  { index: 2, label: "Mer" },
  { index: 3, label: "Jeu" },
  { index: 4, label: "Ven" },
  { index: 5, label: "Sam" },
  { index: 6, label: "Dim" },
] as const;

export function fmtDD_MM(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function isCurrentWeek(weekKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(weekKey + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return today >= monday && today <= sunday;
}

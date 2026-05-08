/**
 * swimPlanningShared.ts — Shared constants/helpers/types for the swim planning timeline.
 * Consumed by SwimPlanningDemo (coach / group view) and SwimPlanningTimeline
 * (shared presentational component, also used by future SwimmerPlanningPanel).
 */

export interface WeekInfo {
  monday: Date;
  sunday: Date;
  weekNumber: number;
  weekKey: string; // "2026-04-06"
}

export function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

// §211 — getMonday déplacé dans src/lib/date.ts. Re-export pour compat.
export { getMonday } from "@/lib/date";

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
      weekKey: monday.toISOString().split("T")[0],
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

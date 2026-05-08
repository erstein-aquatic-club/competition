import { format } from "date-fns";

export function formatSwimSessionDefaultTitle(date: Date) {
  return `Séance du ${format(date, "dd/MM/yyyy")} - Soir - Matin`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type PresenceSlots = Record<number, { AM?: boolean; PM?: boolean }>;

/**
 * Count unique training days between today and a competition date.
 * Includes days with assignments + days with presence defaults ON, minus absences.
 */
export function computeTrainingDaysRemaining(opts: {
  compDate: string;
  assignments: { assigned_date?: string }[] | undefined;
  absenceDates: Set<string>;
  presenceDefaults: PresenceSlots | null | undefined;
}): number {
  const todayISO = toISODate(new Date());
  const { compDate, assignments, absenceDates, presenceDefaults } = opts;

  const trainingDates = new Set<string>();

  // Days with assignments
  if (assignments) {
    for (const a of assignments) {
      const d = (a.assigned_date || "").slice(0, 10);
      if (d > todayISO && d < compDate) trainingDates.add(d);
    }
  }

  // Days with presence defaults ON (excl. absences)
  const cursor = new Date(todayISO + "T00:00:00");
  cursor.setDate(cursor.getDate() + 1);
  const compEnd = new Date(compDate + "T00:00:00");
  while (cursor < compEnd) {
    const iso = toISODate(cursor);
    if (!absenceDates.has(iso)) {
      const jsDay = cursor.getDay();
      const weekday = (jsDay + 6) % 7; // Monday=0
      if (Boolean(presenceDefaults?.[weekday]?.AM) || Boolean(presenceDefaults?.[weekday]?.PM)) {
        trainingDates.add(iso);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return trainingDates.size;
}

const DAY_ABBRS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function formatRelativeDate(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);

  if (diffMin < 60) return `il y a ${diffMin}m`;
  if (diffH < 24) return `il y a ${diffH}h`;

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toISODate(yesterdayDate);
  const dateStr = toISODate(date);

  if (dateStr === yesterdayStr) return "hier";

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return DAY_ABBRS[date.getDay()];

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

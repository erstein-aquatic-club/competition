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

/** Alias historique — préfère `toISODate`. */
export const formatLocalDateISO = toISODate;
/** Alias historique — préfère `toISODate`. */
export const formatDateIso = toISODate;

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Lundi (00:00 local) de la semaine ISO contenant `d`. */
export function getMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const jsDay = r.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  r.setDate(r.getDate() + diff);
  return r;
}

/** Dimanche (00:00 local) qui suit le lundi donné. */
export function getSunday(monday: Date): Date {
  return addDays(monday, 6);
}

/** ISO du lundi de la semaine contenant la date ISO `dateIso`. */
export function mondayIsoOf(dateIso: string): string {
  return toISODate(getMonday(new Date(dateIso + "T00:00:00")));
}

/**
 * Liste les ISOs des lundis présents dans l'intervalle [startDate, endDate].
 * Bornes incluses si elles tombent un lundi (sinon premier lundi >= startDate).
 */
export function getMondaysBetween(startDate: string, endDate: string): string[] {
  const start = getMonday(new Date(startDate + "T00:00:00"));
  const end = new Date(endDate + "T00:00:00");
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    out.push(toISODate(d));
  }
  return out;
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
  if (diffMs < 0) return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;

  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin}m`;
  if (diffH < 24) return `il y a ${diffH}h`;

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toISODate(yesterdayDate);
  const dateStr = toISODate(date);

  // Comparaison en heure locale — suppose client et serveur dans la même TZ
  if (dateStr === yesterdayStr) return "hier";

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return DAY_ABBRS[date.getDay()];

  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

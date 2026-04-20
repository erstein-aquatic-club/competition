import type { StrengthSessionTemplate, StrengthFolder } from "@/lib/api/types";
import {
  type WeekInfo,
  getISOWeekNumber,
  getMonday,
} from "@/components/coach/swim/swimPlanningShared";
import { type StrengthPhase, detectPhase } from "./strengthPhaseStyles";

export type { WeekInfo };
export type { StrengthPhase };

export interface WeekSession {
  dayIndex: number;
  dayLabel: string | null;
  session: StrengthSessionTemplate;
  cleanTitle: string;
}

export interface WeekInstance {
  week: WeekInfo;
  cycleId: number;
  cycleName: string;
  cycleShortLabel: string;
  phase: StrengthPhase;
  phaseName: string;
  dateRangeLabel: string | null;
  sessions: WeekSession[];
}

const DAY_ORDER: [RegExp, string][] = [
  [/^lun/i, "Lun"],
  [/^mar/i, "Mar"],
  [/^mer/i, "Mer"],
  [/^jeu/i, "Jeu"],
  [/^ven/i, "Ven"],
  [/^sam/i, "Sam"],
  [/^dim/i, "Dim"],
];

function getDayInfo(title: string | undefined | null): { index: number; label: string } | null {
  if (!title) return null;
  const t = title.trim();
  for (let i = 0; i < DAY_ORDER.length; i++) {
    const [pattern, label] = DAY_ORDER[i];
    if (pattern.test(t)) return { index: i, label };
  }
  return null;
}

function stripDayPrefix(title: string): string {
  return title
    .replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[—–\-:]\s*/i, "")
    .trim();
}

function sortByDay(sessions: StrengthSessionTemplate[]): StrengthSessionTemplate[] {
  return [...sessions].sort((a, b) => {
    const da = getDayInfo(a.title ?? a.name);
    const db = getDayInfo(b.title ?? b.name);
    if (da && db) return da.index - db.index;
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
}

/** Parse "S13" → [13,13] or "S13-S15" → [13,15]. Returns null if no S-number found. */
export function parseWeekRange(cycleName: string): [number, number] | null {
  const m = cycleName.match(/^S(\d+)(?:-S(\d+))?/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  return [start, end];
}

/** Build a WeekInfo for ISO week `sNum` of the appropriate year given `refDate`. */
export function weekInfoFromSNumber(sNum: number, refDate: Date): WeekInfo {
  const currentWeekNum = getISOWeekNumber(refDate);
  let year = refDate.getFullYear();
  // If this week number is far in the past (> 26 weeks behind current), assume next year
  if (sNum < currentWeekNum - 26) {
    year += 1;
  }

  // ISO rule: Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // 1=Mon..7=Sun
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
  week1Monday.setHours(0, 0, 0, 0);

  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (sNum - 1) * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    monday,
    sunday,
    weekNumber: sNum,
    weekKey: monday.toISOString().split("T")[0],
  };
}

/**
 * Expand strength plan cycles into one WeekInstance per ISO week covered.
 * Cycles with S-range "S13-S15" produce 3 identical WeekInstances (same sessions, different week).
 * Sorted chronologically by weekKey.
 */
export function buildWeekInstances(
  _rootFolder: StrengthFolder,
  cycles: StrengthFolder[],
  sessionsByFolder: Map<number, StrengthSessionTemplate[]>,
  refDate: Date = new Date(),
): WeekInstance[] {
  const sorted = [...cycles].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const currentWeekNum = getISOWeekNumber(refDate);
  const instances: WeekInstance[] = [];

  for (let idx = 0; idx < sorted.length; idx++) {
    const cycle = sorted[idx];
    const rawSessions = sessionsByFolder.get(cycle.id) ?? [];
    const filtered = rawSessions.filter((s) => (s.items?.length ?? 0) > 0);
    const daySorted = sortByDay(filtered);
    if (daySorted.length === 0) continue;

    const weekSessions: WeekSession[] = daySorted.map((s) => {
      const dayInfo = getDayInfo(s.title ?? s.name);
      return {
        dayIndex: dayInfo?.index ?? -1,
        dayLabel: dayInfo?.label ?? null,
        session: s,
        cleanTitle: stripDayPrefix(s.title ?? s.name ?? ""),
      };
    });

    const range = parseWeekRange(cycle.name);
    let weekInfos: WeekInfo[];

    if (range === null) {
      const fallbackSNum = currentWeekNum + idx;
      weekInfos = [weekInfoFromSNumber(fallbackSNum, refDate)];
    } else {
      const [start, end] = range;
      const nums: number[] = [];
      if (end >= start) {
        for (let n = start; n <= end; n++) nums.push(n);
      } else {
        // Wrap-around (e.g. S52-S02)
        for (let n = start; n <= 53; n++) nums.push(n);
        for (let n = 1; n <= end; n++) nums.push(n);
      }
      weekInfos = nums.map((n) => weekInfoFromSNumber(n, refDate));
    }

    const cycleShortLabel = cycle.name.match(/^(S\d+(?:-S\d+)?)/)?.[1] ?? "";
    const phaseName = cycle.name
      .replace(/^S\d+(?:-S\d+)?\s*[—–\-]\s*/, "")
      .replace(/\s*\(.*\)$/, "")
      .trim();
    const dateRangeMatch = cycle.name.match(/\((.+?)\)/);
    const dateRangeLabel = dateRangeMatch ? dateRangeMatch[1] : null;

    for (const week of weekInfos) {
      instances.push({
        week,
        cycleId: cycle.id,
        cycleName: cycle.name,
        cycleShortLabel,
        phase: detectPhase(cycle.name),
        phaseName: phaseName || cycle.name,
        dateRangeLabel,
        sessions: weekSessions,
      });
    }
  }

  instances.sort((a, b) => a.week.weekKey.localeCompare(b.week.weekKey));
  return instances;
}

import { useCallback, useMemo } from "react";
import type { Session } from "@/lib/api";
import {
  toISODate,
  weekdayMondayIndex,
  type AttendanceOverrides,
  type PlannedSession,
  type PresenceDefaults,
  type SlotKey,
} from "./internal";

interface Params {
  gridDates: Date[];
  sessions: Session[] | undefined;
  presenceDefaults: PresenceDefaults;
  attendanceOverrideBySessionId: AttendanceOverrides;
  getSessionsForISO: (iso: string) => PlannedSession[];
  getLogForSession: (sessionId: string) => Session | undefined;
}

export type SessionStatus = {
  status: "present" | "absent" | "not_expected";
  expected: boolean;
  expectedByDefault: boolean;
};

export type DayCompletion = {
  completed: number;
  total: number;
  slots: Array<{
    slotKey: SlotKey;
    expected: boolean;
    completed: boolean;
    absent: boolean;
    slotTime?: string;
  }>;
};

/**
 * Derives per-session presence status and the aggregated monthly grid
 * completion map. Pure, memoised.
 */
export function useCompletionStatus({
  gridDates,
  sessions,
  presenceDefaults,
  attendanceOverrideBySessionId,
  getSessionsForISO,
  getLogForSession,
}: Params) {
  const getSessionStatus = useCallback(
    (session: PlannedSession, dateObj: Date): SessionStatus => {
      const weekday = weekdayMondayIndex(dateObj);
      const expectedByDefault = Boolean(presenceDefaults?.[weekday]?.[session.slotKey]);
      const override = attendanceOverrideBySessionId[session.id];

      if (override === "present") return { status: "present", expected: true, expectedByDefault };
      if (override === "absent") return { status: "absent", expected: true, expectedByDefault };

      if (expectedByDefault) return { status: "present", expected: true, expectedByDefault };

      return { status: "not_expected", expected: false, expectedByDefault };
    },
    [attendanceOverrideBySessionId, presenceDefaults],
  );

  const completionByISO = useMemo(() => {
    const map: Record<string, DayCompletion> = {};

    // Pre-index logs by ISO date so the orphan pass below is O(1) per cell.
    const logsByIso = new Map<string, Session[]>();
    for (const s of (Array.isArray(sessions) ? sessions : [])) {
      const iso = String(s?.date ?? "").slice(0, 10);
      if (!iso) continue;
      if (!logsByIso.has(iso)) logsByIso.set(iso, []);
      logsByIso.get(iso)!.push(s);
    }

    for (const d of gridDates) {
      const iso = toISODate(d);
      const planned = getSessionsForISO(iso);

      let total = 0;
      let completed = 0;
      const slots: DayCompletion["slots"] = [];
      const usedLogIds = new Set<number>();

      for (const s of planned) {
        const st = getSessionStatus(s, d);
        const log = getLogForSession(s.id);
        const hasLog = log != null && !usedLogIds.has(log.id);
        if (hasLog) usedLogIds.add(log.id);

        if (!st.expected) {
          if (hasLog) {
            total += 1;
            completed += 1;
            slots.push({ slotKey: s.slotKey, expected: true, completed: true, absent: false, slotTime: s.slotTime });
          } else {
            slots.push({ slotKey: s.slotKey, expected: false, completed: false, absent: false, slotTime: s.slotTime });
          }
          continue;
        }
        total += 1;

        const isAbsent = st.status === "absent";
        if (hasLog) completed += 1;

        slots.push({ slotKey: s.slotKey, expected: true, completed: hasLog, absent: isAbsent, slotTime: s.slotTime });
      }

      // Orphan logs: the swimmer logged a session outside any planned slot
      // (extra training day, slot not in their personalised schedule). Count
      // them as completed so the calendar dot reflects reality — aligned with
      // SuiviSemaine which always surfaces every log.
      const dayLogs = logsByIso.get(iso);
      if (dayLogs && dayLogs.length > 0) {
        for (const log of dayLogs) {
          if (typeof log?.id !== "number" || usedLogIds.has(log.id)) continue;
          usedLogIds.add(log.id);
          const slotKey: SlotKey = log?.slot === "Soir" ? "PM" : "AM";
          total += 1;
          completed += 1;
          slots.push({ slotKey, expected: true, completed: true, absent: false });
        }
      }

      map[iso] = { completed, total, slots };
    }

    return map;
  }, [sessions, gridDates, getSessionsForISO, getSessionStatus, getLogForSession]);

  return { getSessionStatus, completionByISO };
}

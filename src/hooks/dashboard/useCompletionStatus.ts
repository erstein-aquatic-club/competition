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

      map[iso] = { completed, total, slots };
    }

    return map;
  }, [gridDates, getSessionsForISO, getSessionStatus, getLogForSession]);

  return { getSessionStatus, completionByISO };
}

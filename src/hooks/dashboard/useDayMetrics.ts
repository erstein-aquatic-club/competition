import { useMemo } from "react";
import type { Session } from "@/lib/api";
import {
  fmtKm,
  metersToKm,
  toISODate,
  weekdayMondayIndex,
  type AttendanceOverrides,
  type PlannedSession,
  type PresenceDefaults,
  type SlotKey,
} from "./internal";
import type { SessionStatus } from "./useCompletionStatus";

interface Params {
  sessions: Session[] | undefined;
  sessionsForSelectedDay: PlannedSession[];
  selectedDate: Date;
  presenceDefaults: PresenceDefaults;
  attendanceOverrideBySessionId: AttendanceOverrides;
  getSessionStatus: (session: PlannedSession, dateObj: Date) => SessionStatus;
  getLogForSession: (sessionId: string) => Session | undefined;
}

/**
 * Derives formatted km totals for the current day and the whole history.
 * Pure, memoised — isolates these expensive reductions from draft state.
 */
export function useDayMetrics({
  sessions,
  sessionsForSelectedDay,
  selectedDate,
  presenceDefaults,
  attendanceOverrideBySessionId,
  getSessionStatus,
  getLogForSession,
}: Params) {
  const globalKm = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : [];
    let sumMeters = 0;

    for (const s of list) {
      const iso = String(s?.date ?? "").slice(0, 10);
      const slotKey: SlotKey = s?.slot === "Soir" ? "PM" : "AM";
      const sid = `${iso}__${slotKey}`;

      if (attendanceOverrideBySessionId[sid] === "absent") continue;

      const weekday = weekdayMondayIndex(new Date(iso));
      const expected =
        Boolean(presenceDefaults?.[weekday]?.[slotKey]) ||
        attendanceOverrideBySessionId[sid] === "present";
      if (!expected) continue;

      if (Number.isFinite(Number(s?.distance))) sumMeters += Number(s.distance);
    }

    return fmtKm(metersToKm(sumMeters));
  }, [sessions, attendanceOverrideBySessionId, presenceDefaults]);

  const dayKm = useMemo(() => {
    const planned = sessionsForSelectedDay;
    let sumMeters = 0;
    const matchedLogIds = new Set<number>();

    for (const p of planned) {
      const st = getSessionStatus(p, selectedDate);
      if (!st.expected) continue;
      if (st.status === "absent") continue;

      const log = getLogForSession(p.id);
      if (log && Number.isFinite(Number(log?.distance))) {
        sumMeters += Number(log.distance);
        if (typeof log.id === "number") matchedLogIds.add(log.id);
      }
    }

    // Orphan logs: physical sessions the swimmer logged outside their planned
    // slots (e.g. an extra training not covered by their personalised
    // schedule). Without this pass dayKm would silently drop that distance.
    const selectedISO = toISODate(selectedDate);
    const list = Array.isArray(sessions) ? sessions : [];
    for (const s of list) {
      if (typeof s?.id !== "number" || matchedLogIds.has(s.id)) continue;
      const iso = String(s?.date ?? "").slice(0, 10);
      if (iso !== selectedISO) continue;
      if (Number.isFinite(Number(s?.distance))) sumMeters += Number(s.distance);
    }

    return fmtKm(metersToKm(sumMeters));
  }, [sessions, sessionsForSelectedDay, getSessionStatus, selectedDate, getLogForSession]);

  return { dayKm, globalKm };
}

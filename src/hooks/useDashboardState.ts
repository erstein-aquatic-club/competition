import { useEffect, useMemo, useState, useTransition } from "react";
import type { Session, Assignment } from "@/lib/api";
import type { SwimmerTrainingSlot } from "@/lib/api/types";
import {
  addDays,
  assignmentPlannedKm,
  initPresenceDefaults,
  pickAssignmentSlotKey,
  safeJsonParse,
  safeLinesFromText,
  startOfMonth,
  toISODate,
  weekdayMondayIndex,
  type AttendanceOverrides,
  type PlannedSession,
  type PresenceDefaults,
  type SlotKey,
} from "./dashboard/internal";
import { useDashboardSessions } from "./dashboard/useDashboardSessions";
import { useCompletionStatus } from "./dashboard/useCompletionStatus";
import { useDayMetrics } from "./dashboard/useDayMetrics";
import { useFeedbackDraft } from "./dashboard/useFeedbackDraft";

// Re-export types consumers may import via this module.
export type {
  DraftState,
  PlannedSession,
  PresenceDefaults,
  AttendanceOverrides,
  SlotKey,
} from "./dashboard/internal";

interface UseDashboardStateProps {
  sessions: Session[] | undefined;
  assignments: Assignment[] | undefined;
  userId: number | null | undefined;
  user: string | null;
  swimmerSlots?: SwimmerTrainingSlot[] | undefined;
}

/**
 * Thin façade that composes four specialised dashboard hooks. Keeps the
 * public API identical to the pre-refactor monolith so that Dashboard.tsx
 * and FeedbackDrawer.tsx do not need to change.
 */
export function useDashboardState({ sessions, assignments, userId, user, swimmerSlots }: UseDashboardStateProps) {
  // --- Local persisted settings ---
  const storagePrefix = `swim-dashboard-v2:${userId ?? user ?? "anon"}`;
  const storagePresenceKey = `${storagePrefix}:presenceDefaults`;
  const storageAttendanceKey = `${storagePrefix}:attendanceOverrides`;
  const storageStableKey = `${storagePrefix}:stableFields`;

  const [presenceDefaults, setPresenceDefaults] = useState<PresenceDefaults>(() => initPresenceDefaults());
  const [attendanceOverrideBySessionId, setAttendanceOverrideBySessionId] = useState<AttendanceOverrides>({});
  const [stableDurationMin, setStableDurationMin] = useState<number>(90);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedPresence = safeJsonParse<PresenceDefaults>(window.localStorage.getItem(storagePresenceKey));
    if (savedPresence) setPresenceDefaults(savedPresence);
    const savedAttendance = safeJsonParse<AttendanceOverrides>(window.localStorage.getItem(storageAttendanceKey));
    if (savedAttendance) setAttendanceOverrideBySessionId(savedAttendance);
    const savedStable = safeJsonParse<{ duration?: number }>(window.localStorage.getItem(storageStableKey));
    if (savedStable?.duration && Number.isFinite(savedStable.duration) && savedStable.duration >= 30 && savedStable.duration <= 240) {
      setStableDurationMin(savedStable.duration);
    }
  }, [storagePresenceKey, storageAttendanceKey, storageStableKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storagePresenceKey, JSON.stringify(presenceDefaults));
  }, [presenceDefaults, storagePresenceKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageAttendanceKey, JSON.stringify(attendanceOverrideBySessionId));
  }, [attendanceOverrideBySessionId, storageAttendanceKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageStableKey, JSON.stringify({ duration: stableDurationMin }));
  }, [stableDurationMin, storageStableKey]);

  // --- UI state ---
  const today = useMemo(() => new Date(), []);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedISO, setSelectedISO] = useState(() => toISODate(new Date()));

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [autoCloseArmed, setAutoCloseArmed] = useState(false);

  const [isPending, startTransition] = useTransition();

  // --- Sub-hooks ---
  const { assignmentsByIso, logsBySessionId, getLogForSession, getSessionsForISO } = useDashboardSessions({
    sessions,
    assignments,
    userId,
    swimmerSlots,
  });

  const monthStart = useMemo(() => startOfMonth(monthCursor), [monthCursor]);

  const gridDates = useMemo(() => {
    const startIndex = weekdayMondayIndex(monthStart);
    const gridStart = addDays(monthStart, -startIndex);
    const dates: Date[] = [];
    for (let i = 0; i < 42; i++) dates.push(addDays(gridStart, i));
    return dates;
  }, [monthStart]);

  const { getSessionStatus, completionByISO } = useCompletionStatus({
    gridDates,
    presenceDefaults,
    attendanceOverrideBySessionId,
    getSessionsForISO,
    getLogForSession,
  });

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedISO.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedISO]);

  const sessionsForSelectedDay = useMemo(
    () => getSessionsForISO(selectedISO),
    [getSessionsForISO, selectedISO],
  );

  const otherGroupSessions = useMemo((): PlannedSession[] => {
    const dayAssignments = assignmentsByIso.get(selectedISO) ?? [];
    if (dayAssignments.length === 0) return [];
    const matchedIds = new Set(
      sessionsForSelectedDay.filter((s) => s.assignmentId).map((s) => s.assignmentId),
    );
    const unmatched = dayAssignments.filter((a) => !matchedIds.has(a.id));
    return unmatched.map((a) => {
      const aRecord = a as unknown as Record<string, unknown>;
      const aSlotKey: SlotKey = pickAssignmentSlotKey(aRecord, 0);
      return {
        id: `${selectedISO}__group_${a.id}`,
        iso: selectedISO,
        slotKey: aSlotKey,
        title: String(a.title ?? "Séance groupe"),
        km: assignmentPlannedKm(aRecord),
        details: safeLinesFromText(a.description),
        assignmentId: typeof a.id === "number" ? a.id : Number(a.id) || undefined,
        isEmpty: false,
        assignmentSource: "group" as const,
      };
    });
  }, [selectedISO, assignmentsByIso, sessionsForSelectedDay]);

  const selectedDayStatus = completionByISO[selectedISO] || {
    completed: 0,
    total: 2,
    slots: [
      { slotKey: "AM" as const, expected: true, completed: false, absent: false },
      { slotKey: "PM" as const, expected: true, completed: false, absent: false },
    ],
  };

  const { dayKm, globalKm } = useDayMetrics({
    sessions,
    sessionsForSelectedDay,
    selectedDate,
    presenceDefaults,
    attendanceOverrideBySessionId,
    getSessionStatus,
    getLogForSession,
  });

  const { draftState, setDraftState } = useFeedbackDraft({
    activeSessionId,
    sessionsForSelectedDay,
    assignments,
    getLogForSession,
  });

  // Reset view state when dock icon is tapped while already on this page
  useEffect(() => {
    const reset = () => {
      setDrawerOpen(false);
      setSettingsOpen(false);
      setInfoOpen(false);
      setActiveSessionId(null);
      setDetailsOpen(false);
      setSelectedDayIndex(null);
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  // Auto-close drawer once day becomes fully completed
  useEffect(() => {
    if (!drawerOpen) return;
    if (!autoCloseArmed) return;
    if (selectedDayStatus.total > 0 && selectedDayStatus.completed >= selectedDayStatus.total) {
      setDrawerOpen(false);
      setActiveSessionId(null);
      setDetailsOpen(false);
      setAutoCloseArmed(false);
    }
  }, [drawerOpen, autoCloseArmed, selectedDayStatus.completed, selectedDayStatus.total]);

  return {
    // State
    today,
    monthCursor,
    selectedISO,
    drawerOpen,
    settingsOpen,
    infoOpen,
    activeSessionId,
    detailsOpen,
    selectedDayIndex,
    isPending,
    presenceDefaults,
    attendanceOverrideBySessionId,
    stableDurationMin,
    draftState,

    // Computed
    gridDates,
    completionByISO,
    selectedDate,
    sessionsForSelectedDay,
    otherGroupSessions,
    selectedDayStatus,
    globalKm,
    dayKm,
    logsBySessionId,
    getLogForSession,

    // Actions
    setMonthCursor,
    setSelectedISO,
    setDrawerOpen,
    setSettingsOpen,
    setInfoOpen,
    setActiveSessionId,
    setDetailsOpen,
    setSelectedDayIndex,
    setPresenceDefaults,
    setAttendanceOverrideBySessionId,
    setStableDurationMin,
    setDraftState,
    setAutoCloseArmed,
    startTransition,
    getSessionStatus,
    getSessionsForISO,
  };
}

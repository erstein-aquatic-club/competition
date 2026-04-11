import { useState, useMemo, useCallback, useTransition, useEffect, useRef } from "react";
import type { Session, Assignment, SwimExerciseLogInput } from "@/lib/api";
import type { ResolvedSlotAssignment } from "@/lib/api/types";

type SlotKey = "AM" | "PM";
type IndicatorKey = "difficulty" | "fatigue_end" | "performance" | "engagement";

type StrokeDraft = { NL: string; DOS: string; BR: string; PAP: string; QN: string };
const emptyStrokeDraft: StrokeDraft = { NL: "", DOS: "", BR: "", PAP: "", QN: "" };

type DraftState = Record<IndicatorKey, number | null> & {
  comment: string;
  distanceMeters: number | null;
  showStrokeDetail: boolean;
  strokes: StrokeDraft;
  exerciseLogs: SwimExerciseLogInput[];
};

type PlannedSession = {
  id: string;
  iso: string;
  slotKey: SlotKey;
  title: string;
  km: number | null;
  details: string[];
  assignmentId?: number;
  isEmpty: boolean;
  // Phase B: optional enrichment fields
  slotTime?: string;
  slotLocation?: string;
  assignmentSource?: 'individual' | 'subgroup' | 'group' | 'none';
  alternatives?: Array<{
    assignmentId: number;
    title: string;
    km: number | null;
    subgroupName?: string;
  }>;
  swimmerSlotId?: string;
};

type PresenceDefaults = Record<number, Record<SlotKey, boolean>>;
type AttendanceOverride = "present" | "absent";
type AttendanceOverrides = Record<string, AttendanceOverride>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function weekdayMondayIndex(d: Date) {
  const js = d.getDay();
  return (js + 6) % 7;
}

function metersToKm(m: number | string | null | undefined) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 1000) * 100) / 100;
}

function kmToMeters(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000);
}

function safeLinesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const raw = String(text)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  return raw.flatMap((line) => {
    const cleaned = line.replace(/^[•\\-–—]\\s*/, "").trim();
    return cleaned ? [cleaned] : [];
  });
}

function extractDistanceKmFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = String(text);
  const m = t.match(/(\\d+(?:[\\.,]\\d+)?)\\s*(km|m)\\b/i);
  if (!m) return null;
  const val = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(val)) return null;
  if (m[2].toLowerCase() === "m") return metersToKm(val);
  return val;
}

function pickAssignmentSlotKey(a: Record<string, unknown>, fallbackIdx: number): SlotKey {
  const direct =
    a?.slot ??
    a?.session_slot ??
    a?.assigned_slot ??
    a?.time_slot ??
    a?.timeOfDay ??
    a?.slot_key ??
    a?.slotKey;

  const norm = String(direct || "").toLowerCase();
  if (norm.includes("mat") || norm.includes("morning") || norm === "am") return "AM";
  if (norm.includes("soir") || norm.includes("evening") || norm === "pm") return "PM";

  const hay = `${a?.title ?? ""} ${a?.description ?? ""}`.toLowerCase();
  if (hay.includes("matin") || hay.includes(" am ") || hay.includes("(am)")) return "AM";
  if (hay.includes("soir") || hay.includes(" pm ") || hay.includes("(pm)")) return "PM";

  return fallbackIdx === 0 ? "AM" : "PM";
}

function assignmentIso(a: Record<string, unknown>): string | null {
  const raw = a?.assigned_date ?? a?.date ?? a?.day ?? a?.scheduled_for ?? a?.scheduledAt ?? null;
  if (!raw) return null;
  const s = String(raw);
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  return /\d{4}-\d{2}-\d{2}/.test(iso) ? iso : null;
}

function assignmentPlannedKm(a: Record<string, unknown>): number | null {
  // First, try to calculate from swim session items (most accurate)
  if (Array.isArray(a?.items)) {
    let totalMeters = 0;
    for (const item of a.items as any[]) {
      const dist = Number(item?.distance);
      if (!Number.isFinite(dist) || dist <= 0) continue;

      // Check for repetitions in raw_payload (exercise_repetitions or block_repetitions)
      const payload = item?.raw_payload as Record<string, any> | null | undefined;
      const exerciseReps = Number(payload?.exercise_repetitions);
      const blockReps = Number(payload?.block_repetitions);

      const reps = Number.isFinite(exerciseReps) && exerciseReps > 0 ? exerciseReps : 1;
      const blockMultiplier = Number.isFinite(blockReps) && blockReps > 0 ? blockReps : 1;

      totalMeters += dist * reps * blockMultiplier;
    }
    if (totalMeters > 0) {
      return metersToKm(totalMeters);
    }
  }

  // Fallback: check direct fields
  const meters =
    a?.distance_meters ??
    a?.distanceMeters ??
    a?.meters ??
    a?.planned_meters ??
    a?.plannedMeters ??
    a?.distance ??
    null;

  if (meters != null && Number.isFinite(Number(meters))) {
    const n = Number(meters);
    if (n > 0 && n <= 50) return n;
    return metersToKm(n);
  }

  const km =
    a?.km ??
    a?.distance_km ??
    a?.distanceKm ??
    a?.planned_km ??
    a?.plannedKm ??
    null;

  if (km != null && Number.isFinite(Number(km))) return Number(km);

  const fromText = extractDistanceKmFromText(`${a?.title ?? ""} ${a?.description ?? ""}`);
  if (fromText != null) return fromText;

  return null;
}

function assignmentPlannedStrokes(items: any[] | null | undefined): Record<string, number> | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  // Map stroke names to stroke codes
  const strokeMap: Record<string, string> = {
    crawl: "NL",
    dos: "DOS",
    brasse: "BR",
    pap: "PAP",
    "4n": "QN",
  };

  const strokes: Record<string, number> = {
    NL: 0,
    DOS: 0,
    BR: 0,
    PAP: 0,
    QN: 0,
  };

  for (const item of items) {
    const distance = Number(item?.distance);
    if (!Number.isFinite(distance) || distance <= 0) continue;

    const payload = item?.raw_payload as Record<string, any> | null | undefined;

    // Calculate total distance with repetitions
    const exerciseReps = Number(payload?.exercise_repetitions);
    const blockReps = Number(payload?.block_repetitions);
    const reps = Number.isFinite(exerciseReps) && exerciseReps > 0 ? exerciseReps : 1;
    const blockMultiplier = Number.isFinite(blockReps) && blockReps > 0 ? blockReps : 1;
    const totalDistance = distance * reps * blockMultiplier;

    const exerciseStroke = payload?.exercise_stroke ?? payload?.stroke ?? "crawl";
    const strokeCode = strokeMap[String(exerciseStroke).toLowerCase()];

    if (strokeCode) {
      strokes[strokeCode] += totalDistance;
    } else {
      // Unknown stroke: distribute proportionally across all strokes or default to crawl
      strokes.NL += totalDistance;
    }
  }

  // Check if any strokes have distance
  const hasStrokes = Object.values(strokes).some((d) => d > 0);
  return hasStrokes ? strokes : null;
}

function fmtKm(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const str = String(rounded);
  return str.endsWith(".0") ? str.slice(0, -2) : str;
}

function initPresenceDefaults(): PresenceDefaults {
  const init: PresenceDefaults = {};
  for (let i = 0; i < 7; i++) init[i] = { AM: true, PM: true };
  return init;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

interface UseDashboardStateProps {
  sessions: Session[] | undefined;
  assignments: Assignment[] | undefined;
  userId: number | null | undefined;
  user: string | null;
}

export function useDashboardState({ sessions, assignments, userId, user }: UseDashboardStateProps) {
  // --- Local settings (client-side only, no backend change) ---
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

  // --- Backend data shaping ---
  const swimAssignments = useMemo(() => {
    const list = Array.isArray(assignments) ? assignments : [];
    return list.filter((a) => a?.session_type === "swim");
  }, [assignments]);

  const assignmentsByIso = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of swimAssignments) {
      const iso = assignmentIso(a as unknown as Record<string, unknown>);
      if (!iso) continue;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(a);
    }
    for (const [iso, list] of map.entries()) {
      list.sort((x: Assignment, y: Assignment) => Number(x?.id ?? 0) - Number(y?.id ?? 0));
      map.set(iso, list);
    }
    return map;
  }, [swimAssignments]);

  const logsBySessionId = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : [];
    const map: Record<string, Session> = {};
    for (const s of list) {
      const iso = String(s?.date ?? "").slice(0, 10);
      const slot: SlotKey = s?.slot === "Soir" ? "PM" : "AM";
      map[`${iso}__${slot}`] = s;
    }
    return map;
  }, [sessions]);

  const sessionsCacheRef = useRef<Map<string, PlannedSession[]>>(new Map());
  useEffect(() => {
    sessionsCacheRef.current.clear();
  }, [assignmentsByIso]);

  const getSessionsForISO = useCallback(
    (iso: string): PlannedSession[] => {
      const cache = sessionsCacheRef.current;
      if (cache.has(iso)) return cache.get(iso)!;

      const list: PlannedSession[] = [
        {
          id: `${iso}__AM`,
          iso,
          slotKey: "AM",
          title: "Séance vide",
          km: null,
          details: [],
          isEmpty: true,
        },
        {
          id: `${iso}__PM`,
          iso,
          slotKey: "PM",
          title: "Séance vide",
          km: null,
          details: [],
          isEmpty: true,
        },
      ];

      const dayAssignments = (assignmentsByIso.get(iso) ?? [])
        .slice()
        .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      const usedSlots = new Set<SlotKey>();

      dayAssignments.forEach((a, idx: number) => {
        const aRecord = a as unknown as Record<string, unknown>;
        const slotKey = pickAssignmentSlotKey(aRecord, idx);
        if (usedSlots.has(slotKey)) return;

        const slotIndex = slotKey === "AM" ? 0 : 1;
        const plannedKm = assignmentPlannedKm(aRecord);
        const details = Array.isArray(aRecord?.details) ? (aRecord.details as string[]).map(String) : safeLinesFromText(a?.description);

        list[slotIndex] = {
          id: `${iso}__${slotKey}`,
          iso,
          slotKey,
          title: String(a?.title ?? "Séance coach"),
          km: plannedKm,
          details,
          assignmentId: typeof a?.id === "number" ? a.id : Number(a?.id) || undefined,
          isEmpty: false,
        };

        usedSlots.add(slotKey);
      });

      cache.set(iso, list);
      return list;
    },
    [assignmentsByIso]
  );

  const getSessionStatus = useCallback(
    (session: PlannedSession, dateObj: Date) => {
      const weekday = weekdayMondayIndex(dateObj);
      const expectedByDefault = Boolean(presenceDefaults?.[weekday]?.[session.slotKey]);
      const override = attendanceOverrideBySessionId[session.id];

      if (override === "present") return { status: "present" as const, expected: true, expectedByDefault };
      if (override === "absent") return { status: "absent" as const, expected: true, expectedByDefault };

      if (expectedByDefault) return { status: "present" as const, expected: true, expectedByDefault };

      return { status: "not_expected" as const, expected: false, expectedByDefault };
    },
    [attendanceOverrideBySessionId, presenceDefaults]
  );

  const monthStart = useMemo(() => startOfMonth(monthCursor), [monthCursor]);

  const gridDates = useMemo(() => {
    const startIndex = weekdayMondayIndex(monthStart);
    const gridStart = addDays(monthStart, -startIndex);

    const dates: Date[] = [];
    for (let i = 0; i < 42; i++) dates.push(addDays(gridStart, i));
    return dates;
  }, [monthStart]);

  const completionByISO = useMemo(() => {
    const map: Record<string, { completed: number; total: number; slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean }> }> = {};

    for (const d of gridDates) {
      const iso = toISODate(d);
      const planned = getSessionsForISO(iso);

      let total = 0;
      let completed = 0;
      const slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean }> = [];

      for (const s of planned) {
        const st = getSessionStatus(s, d);
        if (!st.expected) {
          const hasLogAnyway = Boolean(logsBySessionId[s.id]);
          if (hasLogAnyway) {
            total += 1;
            completed += 1;
            slots.push({ slotKey: s.slotKey, expected: true, completed: true, absent: false });
          } else {
            slots.push({ slotKey: s.slotKey, expected: false, completed: false, absent: false });
          }
          continue;
        }
        total += 1;

        const hasLog = Boolean(logsBySessionId[s.id]);
        const isAbsent = st.status === "absent";
        if (hasLog) completed += 1;

        slots.push({ slotKey: s.slotKey, expected: true, completed: hasLog, absent: isAbsent });
      }

      map[iso] = { completed, total, slots };
    }

    return map;
  }, [gridDates, getSessionsForISO, getSessionStatus, logsBySessionId]);

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedISO.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedISO]);

  const sessionsForSelectedDay = useMemo(() => getSessionsForISO(selectedISO), [getSessionsForISO, selectedISO]);

  const selectedDayStatus = completionByISO[selectedISO] || { completed: 0, total: 2, slots: [{ slotKey: "AM" as const, expected: true, completed: false, absent: false }, { slotKey: "PM" as const, expected: true, completed: false, absent: false }] };

  const globalKm = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : [];
    let sumMeters = 0;

    for (const s of list) {
      const iso = String(s?.date ?? "").slice(0, 10);
      const slotKey: SlotKey = s?.slot === "Soir" ? "PM" : "AM";
      const sid = `${iso}__${slotKey}`;

      if (attendanceOverrideBySessionId[sid] === "absent") continue;

      const weekday = weekdayMondayIndex(new Date(iso));
      const expected = Boolean(presenceDefaults?.[weekday]?.[slotKey]) || attendanceOverrideBySessionId[sid] === "present";
      if (!expected) continue;

      if (Number.isFinite(Number(s?.distance))) sumMeters += Number(s.distance);
    }

    return fmtKm(metersToKm(sumMeters));
  }, [sessions, attendanceOverrideBySessionId, presenceDefaults]);

  const dayKm = useMemo(() => {
    const planned = sessionsForSelectedDay;
    let sumMeters = 0;

    for (const p of planned) {
      const st = getSessionStatus(p, selectedDate);
      if (!st.expected) continue;
      if (st.status === "absent") continue;

      const log = logsBySessionId[p.id];
      if (log && Number.isFinite(Number(log?.distance))) sumMeters += Number(log.distance);
    }

    return fmtKm(metersToKm(sumMeters));
  }, [sessionsForSelectedDay, getSessionStatus, selectedDate, logsBySessionId]);

  const activeLog = useMemo(() => {
    if (!activeSessionId) return null;
    return logsBySessionId[activeSessionId] || null;
  }, [activeSessionId, logsBySessionId]);

  const feedbackDraft = useMemo<DraftState>(() => {
    const base: Partial<Session> = activeLog || {};
    const sd = base?.stroke_distances;
    const strokes: StrokeDraft = sd
      ? { NL: sd.NL ? String(sd.NL) : "", DOS: sd.DOS ? String(sd.DOS) : "", BR: sd.BR ? String(sd.BR) : "", PAP: sd.PAP ? String(sd.PAP) : "", QN: sd.QN ? String(sd.QN) : "" }
      : emptyStrokeDraft;
    return {
      difficulty: base?.effort ?? null,
      fatigue_end: base?.fatigue ?? base?.feeling ?? null,
      performance: base?.performance ?? base?.feeling ?? null,
      engagement: base?.engagement ?? base?.feeling ?? null,
      comment: String(base?.comments ?? ""),
      distanceMeters: Number.isFinite(Number(base?.distance)) ? Number(base.distance) : null,
      showStrokeDetail: !!(sd && Object.values(sd).some((v) => v && v > 0)),
      strokes,
      exerciseLogs: [],
    };
  }, [activeLog]);

  const [draftState, setDraftState] = useState<DraftState>(() => ({
    difficulty: null,
    fatigue_end: null,
    performance: null,
    engagement: null,
    comment: "",
    distanceMeters: null,
    showStrokeDetail: false,
    strokes: emptyStrokeDraft,
    exerciseLogs: [],
  }));

  // Auto-sync draft state with active session
  useEffect(() => {
    const activeSession = sessionsForSelectedDay.find((s) => s.id === activeSessionId);
    if (activeSession) {
      const plannedMeters = activeSession.km != null ? kmToMeters(activeSession.km) : 5000;

      // Get planned strokes from assignment items
      let plannedStrokes: StrokeDraft = emptyStrokeDraft;
      if (activeSession.assignmentId) {
        const assignment = (assignments ?? []).find((a) => a.id === activeSession.assignmentId);
        if (assignment?.items) {
          const strokeDistances = assignmentPlannedStrokes(assignment.items);
          if (strokeDistances) {
            plannedStrokes = {
              NL: String(strokeDistances.NL || ""),
              DOS: String(strokeDistances.DOS || ""),
              BR: String(strokeDistances.BR || ""),
              PAP: String(strokeDistances.PAP || ""),
              QN: String(strokeDistances.QN || ""),
            };
          }
        }
      }

      // Check if feedbackDraft already has strokes (existing log)
      const hasExistingStrokes = Object.values(feedbackDraft.strokes).some((v) => v && Number(v) > 0);

      setDraftState((prev) => ({
        ...prev,
        ...feedbackDraft,
        distanceMeters: feedbackDraft.distanceMeters == null ? plannedMeters : feedbackDraft.distanceMeters,
        strokes: hasExistingStrokes ? feedbackDraft.strokes : plannedStrokes,
        showStrokeDetail: hasExistingStrokes || Object.values(plannedStrokes).some((v) => v && Number(v) > 0),
      }));
      return;
    }
    setDraftState((prev) => ({ ...prev, ...feedbackDraft }));
  }, [feedbackDraft, activeSessionId, sessionsForSelectedDay, assignments]);

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
    selectedDayStatus,
    globalKm,
    dayKm,
    logsBySessionId,

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

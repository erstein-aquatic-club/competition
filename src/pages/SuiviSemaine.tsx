/**
 * SuiviSemaine — Weekly timeline view for swimmers.
 *
 * Shows a day-by-day breakdown of the current (or past) week with:
 * - Logged swim feedback and completed strength runs
 * - Missed sessions (no feedback yet) with contextual CTA
 * - Absent sessions with undo capability
 * - Wellness CTA banner when today's check is not logged
 */

import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  XCircle,
  Undo2,
  MapPin,
  Clock,
  Droplets,
  Heart,
  Dumbbell,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Session, PlannedAbsence, Assignment } from "@/lib/api";
import type { ResolvedSlotAssignment } from "@/lib/api/types";
import type { LocalStrengthRun, SetLogEntry } from "@/lib/types";
import { resolveSwimmerAssignmentsBatch } from "@/lib/api/assignments";
import { getWellnessForDate } from "@/lib/api/wellness";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { computeAvgDifficulty } from "@/lib/strengthHistoryUtils";
import { PageHeader } from "@/components/shared/PageHeader";
import { WellnessForm } from "@/components/wellness/WellnessForm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ── Helpers ──────────────────────────────────────────────────

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Monday-based week start for a given date */
function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function formatLocalDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isToday(d: Date): boolean {
  return formatLocalDateISO(d) === formatLocalDateISO(new Date());
}

function isFuture(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy > today;
}

const DAY_NAMES_FR = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const m = monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const s = sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${m} — ${s}`;
}

/** Derive AM/PM slot key from a time string like "17:00" */
function slotKeyFromTime(time: string): SlotKey {
  const hour = parseInt(time.split(":")[0], 10);
  return hour < 12 ? "AM" : "PM";
}

/** Normalize session.slot ("Matin"/"Soir"/"AM"/"PM") to "AM"/"PM" */
function normalizeSlot(slot: string): SlotKey {
  const lower = slot.toLowerCase();
  if (lower === "matin" || lower === "am") return "AM";
  return "PM";
}

export function formatClockTime(raw: string): string {
  const [hours = "0", minutes = "0"] = String(raw).split(":");
  const hh = String(Number.parseInt(hours, 10) || 0).padStart(2, "0");
  const mm = String(Number.parseInt(minutes, 10) || 0).padStart(2, "0");
  return `${hh}h${mm}`;
}

export function formatSlotTime(raw?: string): string | null {
  if (!raw) return null;
  const [start, end] = String(raw).split("-");
  if (!end) return formatClockTime(raw);
  return `${formatClockTime(start)} - ${formatClockTime(end)}`;
}

function slotSortValue(raw?: string): number {
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const [start] = String(raw).split("-");
  const [hours = "0", minutes = "0"] = start.split(":");
  return (Number.parseInt(hours, 10) || 0) * 60 + (Number.parseInt(minutes, 10) || 0);
}

type SessionKind = "swim" | "strength";
type SlotKey = "AM" | "PM";

export function inferSessionKind(params: {
  /** Explicit type coming from the training_slot / swimmer_training_slot row */
  slotSessionType?: SessionKind | null;
  /** Explicit type coming from the assignment row */
  assignmentType?: SessionKind | null;
  /** Legacy fallback — only used if neither slot nor assignment expose a type */
  location?: string | null;
}): SessionKind {
  // Slot type is the source of truth (set by the coach in the drawer).
  if (params.slotSessionType === "swim" || params.slotSessionType === "strength") {
    return params.slotSessionType;
  }
  if (params.assignmentType === "swim" || params.assignmentType === "strength") {
    return params.assignmentType;
  }
  // Legacy fallback for any row that predates the session_type migration.
  const location = params.location?.toLowerCase() ?? "";
  if (
    location.includes("salle") ||
    location.includes("muscu") ||
    location.includes("gym") ||
    location.includes("ppg")
  ) {
    return "strength";
  }
  return "swim";
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

export function findFallbackAssignmentForSlot(
  assignments: Assignment[],
  params: {
    slotKey: SlotKey;
    userId?: number | null;
    usedAssignmentIds?: Set<number>;
  },
): Assignment | undefined {
  const used = params.usedAssignmentIds ?? new Set<number>();
  const slotScheduledSlot = params.slotKey === "AM" ? "morning" : "evening";

  const individualMatch = assignments.find((assignment, idx) =>
    !used.has(assignment.id) &&
    assignment.target_user_id === params.userId &&
    pickAssignmentSlotKey(assignment as unknown as Record<string, unknown>, idx) === params.slotKey,
  ) ?? assignments.find((assignment) =>
    !used.has(assignment.id) &&
    assignment.target_user_id === params.userId,
  );
  if (individualMatch) return individualMatch;

  return assignments.find((assignment, idx) =>
    !used.has(assignment.id) &&
    !assignment.target_user_id &&
    (
      assignment.assigned_slot === slotScheduledSlot ||
      pickAssignmentSlotKey(assignment as unknown as Record<string, unknown>, idx) === params.slotKey
    ),
  );
}

const HARD_SCALE = [
  "Tres facile",
  "Plutot facile",
  "Modere",
  "Plutot dur",
  "Tres dur",
];

const GOOD_SCALE = [
  "Tres mauvaise",
  "Plutot mauvaise",
  "Moyenne",
  "Plutot bonne",
  "Excellente",
];

const FATIGUE_SCALE = [
  "Tres frais",
  "Plutot frais",
  "Normal",
  "Fatigue",
  "Epuise",
];

type IndicatorMeta = {
  key: string;
  shortLabel: string;
  fullLabel: string;
  mode: "hard" | "good";
  descriptions: string[];
};

const SWIM_INDICATORS: IndicatorMeta[] = [
  { key: "effort", shortLabel: "Diff.", fullLabel: "Difficulte", mode: "hard", descriptions: HARD_SCALE },
  { key: "feeling", shortLabel: "Fat.", fullLabel: "Fatigue fin", mode: "hard", descriptions: FATIGUE_SCALE },
  { key: "performance", shortLabel: "Perf.", fullLabel: "Performance percue", mode: "good", descriptions: GOOD_SCALE },
  { key: "engagement", shortLabel: "Eng.", fullLabel: "Engagement", mode: "good", descriptions: GOOD_SCALE },
];

const STRENGTH_INDICATORS: IndicatorMeta[] = [
  { key: "difficulty", shortLabel: "Diff.", fullLabel: "Difficulte seance", mode: "hard", descriptions: HARD_SCALE },
  { key: "fatigue", shortLabel: "Fat.", fullLabel: "Fatigue fin", mode: "hard", descriptions: FATIGUE_SCALE },
];

export function describeIndicatorValue(meta: IndicatorMeta, value: number | null | undefined): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) return null;
  const description = meta.descriptions[numeric - 1] ?? "";
  return `${meta.fullLabel} ${numeric}/5 - ${description}`;
}

function normalizeRunScaleValue(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) return null;
  return numeric;
}

function getStrengthRunLogs(run: LocalStrengthRun): SetLogEntry[] {
  return (run.strength_set_logs ?? run.logs ?? []) as SetLogEntry[];
}

export function getStrengthRunDifficulty(run: LocalStrengthRun): number | null {
  const fromLogs = computeAvgDifficulty(getStrengthRunLogs(run));
  if (fromLogs > 0) return fromLogs;
  const rawPayload = run.raw_payload as Record<string, unknown> | null | undefined;
  return normalizeRunScaleValue(rawPayload?.difficulty ?? run.feeling);
}

export function getStrengthRunIndicatorValue(
  run: LocalStrengthRun | undefined,
  key: string,
): number | null {
  if (!run) return null;
  if (key === "difficulty") {
    return getStrengthRunDifficulty(run);
  }
  if (key === "fatigue") {
    const rawPayload = run.raw_payload as Record<string, unknown> | null | undefined;
    return normalizeRunScaleValue(run.fatigue ?? rawPayload?.fatigue);
  }
  return null;
}

function getStrengthRunDateValue(run: LocalStrengthRun): string | null {
  return run.completed_at || run.started_at || run.date || run.created_at || null;
}

function getStrengthRunDateISO(run: LocalStrengthRun): string | null {
  const raw = getStrengthRunDateValue(run);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalDateISO(parsed);
}

function getStrengthRunSlotKey(run: LocalStrengthRun): "AM" | "PM" | null {
  const raw = run.completed_at || run.started_at || run.created_at || null;
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours() < 12 ? "AM" : "PM";
}

export function findStrengthRunForSlot(
  runs: LocalStrengthRun[],
  params: {
    iso: string;
    slotKey: "AM" | "PM";
    assignmentId?: number;
  },
): LocalStrengthRun | undefined {
  if (params.assignmentId) {
    const assignmentMatch = runs.find((run) => Number(run.assignment_id) === params.assignmentId);
    if (assignmentMatch) return assignmentMatch;
  }

  const dateMatches = runs.filter((run) => getStrengthRunDateISO(run) === params.iso);
  if (dateMatches.length === 0) return undefined;

  const slotMatches = dateMatches.filter((run) => getStrengthRunSlotKey(run) === params.slotKey);
  if (slotMatches.length > 0) return slotMatches[0];

  return dateMatches.length === 1 ? dateMatches[0] : undefined;
}

// ── Indicator colors ─────────────────────────────────────────

function indicatorColor(mode: "hard" | "good", value: number | null | undefined): string {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 1 || v > 5) return "bg-muted text-muted-foreground";
  const effective = mode === "hard" ? 6 - v : v;
  if (effective >= 4) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (effective >= 3) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

// ── Types ────────────────────────────────────────────────────

type CardType = "logged" | "missed" | "absent";

interface TimelineCard {
  type: CardType;
  kind: SessionKind;
  date: Date;
  iso: string;
  slotKey: "AM" | "PM";
  slotTime?: string;
  slotLocation?: string;
  title: string;
  km: number | null;
  session?: Session;
  strengthRun?: LocalStrengthRun;
  absenceReason?: string | null;
  swimmerSlotId?: string;
  assignmentId?: number;
  assignmentSource?: "individual" | "subgroup" | "group" | "none";
}

// ── Component ────────────────────────────────────────────────

export default function SuiviSemaine() {
  const [, navigate] = useLocation();
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = useMemo(() => addDays(getMonday(new Date()), weekOffset * 7), [weekOffset]);
  const weekDates = useMemo<Date[]>(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  );
  const weekISOs = useMemo<string[]>(
    () => weekDates.map(formatLocalDateISO),
    [weekDates],
  );

  // Wellness sheet
  const [wellnessOpen, setWellnessOpen] = useState(false);

  // Expanded session cards
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────

  // Swimmer slots
  const { data: swimmerSlots = [] } = useQuery({
    queryKey: ["swimmer-slots", userId],
    queryFn: () => api.getSwimmerSlots(userId!),
    enabled: !!userId,
  });

  // Resolved assignments for the week
  const { data: assignmentsMap } = useQuery({
    queryKey: ["swimmer-assignments-batch", userId, weekISOs[0]],
    queryFn: () => resolveSwimmerAssignmentsBatch(userId!, weekISOs),
    enabled: !!userId && weekISOs.length > 0,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", userId, "week-view"],
    queryFn: () => api.getAssignments(user ?? "", userId),
    enabled: !!userId && !!user,
  });

  // Swim sessions (ressentis)
  const { data: allSessions = [] } = useQuery({
    queryKey: ["sessions", userId],
    queryFn: () => api.getSessions(user!, userId),
    enabled: !!user,
  });

  // Strength history (real muscu runs only)
  const { data: strengthHistory } = useQuery({
    queryKey: ["strength-history-week", userId, weekISOs[0], weekISOs[6]],
    queryFn: () =>
      api.getStrengthHistory(user ?? "", {
        athleteId: userId,
        from: weekISOs[0],
        to: weekISOs[6],
        status: "completed",
        limit: 200,
      }),
    enabled: !!userId && !!user && weekISOs.length === 7,
    staleTime: 60_000,
  });

  // Absences
  const { data: myAbsences = [] } = useQuery({
    queryKey: ["my-absences"],
    queryFn: () => api.getMyPlannedAbsences(),
    enabled: !!userId,
  });

  // Today's wellness
  const todayISO = formatLocalDateISO(new Date());
  const { data: todayWellness } = useQuery({
    queryKey: ["wellness", userId, todayISO],
    queryFn: () => getWellnessForDate(userId!, todayISO),
    enabled: !!userId,
  });

  // ── Mutations ──────────────────────────────────────────────

  const absenceMutation = useMutation({
    mutationFn: ({ date, reason }: { date: string; reason?: string }) =>
      api.setPlannedAbsence(date, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-absences"] });
      toast({ title: "Absence enregistree" });
    },
  });

  const removeAbsenceMutation = useMutation({
    mutationFn: (date: string) => api.removePlannedAbsence(date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-absences"] });
      toast({ title: "Absence annulee" });
    },
  });

  // ── Build timeline cards ───────────────────────────────────

  const absencesByDate = useMemo(() => {
    const map = new Map<string, PlannedAbsence>();
    for (const a of myAbsences) map.set(a.date, a);
    return map;
  }, [myAbsences]);

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      const iso = assignmentIso(assignment as unknown as Record<string, unknown>);
      if (!iso || !weekISOs.includes(iso)) continue;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(assignment);
    }
    return map;
  }, [assignments, weekISOs]);

  const swimSessionsByAssignmentId = useMemo(() => {
    const map = new Map<number, Session>();
    for (const s of allSessions) {
      if (!weekISOs.includes(s.date)) continue;
      if (typeof s.assignment_id === "number" && Number.isFinite(s.assignment_id) && !map.has(s.assignment_id)) {
        map.set(s.assignment_id, s);
      }
    }
    return map;
  }, [allSessions, weekISOs]);

  const swimSessionsByDateSlot = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of allSessions) {
      if (!weekISOs.includes(s.date)) continue;
      const key = `${s.date}_${normalizeSlot(s.slot)}`;
      if (!map.has(key)) map.set(key, s);
    }
    return map;
  }, [allSessions, weekISOs]);

  const completedStrengthRuns = useMemo(
    () => strengthHistory?.runs ?? [],
    [strengthHistory],
  );

  const findSwimSession = useCallback((params: {
    iso: string;
    slotKey: "AM" | "PM";
    assignmentId?: number;
  }): Session | undefined => {
    if (params.assignmentId && swimSessionsByAssignmentId.has(params.assignmentId)) {
      return swimSessionsByAssignmentId.get(params.assignmentId);
    }
    return swimSessionsByDateSlot.get(`${params.iso}_${params.slotKey}`);
  }, [swimSessionsByAssignmentId, swimSessionsByDateSlot]);

  const findStrengthRun = useCallback((params: {
    iso: string;
    slotKey: "AM" | "PM";
    assignmentId?: number;
  }): LocalStrengthRun | undefined => {
    return findStrengthRunForSlot(completedStrengthRuns, params);
  }, [completedStrengthRuns]);

  const cards = useMemo<TimelineCard[]>(() => {
    const result: TimelineCard[] = [];

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const date = weekDates[dayIdx];
      const iso = weekISOs[dayIdx];
      const dayOfWeek = dayIdx + 1; // 1=Monday
      const absence = absencesByDate.get(iso);
      const dayAssignments = assignmentsByDate.get(iso) ?? [];
      const swimAssignments = dayAssignments.filter((assignment) => assignment.session_type === "swim");
      const usedAssignmentIds = new Set<number>();
      // Track which strength runs have been consumed by slot-based cards so
      // we can render any orphan run (logged without a matching slot) at the
      // end of the day loop.
      const consumedStrengthRunIds = new Set<number>();
      const markRunConsumed = (run: LocalStrengthRun | undefined) => {
        if (run?.id != null) consumedStrengthRunIds.add(run.id);
      };

      // Get resolved assignments for this date
      const resolved: ResolvedSlotAssignment[] = assignmentsMap?.get(iso) ?? [];

      if (resolved.length === 0) {
        const daySlots = swimmerSlots.filter((s) => s.day_of_week === dayOfWeek);
        for (const slot of daySlots) {
          const kind = inferSessionKind({
            slotSessionType: slot.session_type,
            location: slot.location,
          });
          const slotKey = slotKeyFromTime(slot.start_time);
          const fallbackAssignment = kind === "swim"
            ? findFallbackAssignmentForSlot(swimAssignments, { slotKey, userId, usedAssignmentIds })
            : undefined;
          const swimSession = kind === "swim"
            ? findSwimSession({ iso, slotKey, assignmentId: fallbackAssignment?.id })
            : undefined;
          const strengthRun = kind === "strength"
            ? findStrengthRun({ iso, slotKey })
            : undefined;
          markRunConsumed(strengthRun);
          const plannedAssignment = fallbackAssignment;

          if (plannedAssignment) {
            usedAssignmentIds.add(plannedAssignment.id);
          }

          if (swimSession || strengthRun) {
            result.push({
              type: "logged",
              kind,
              date,
              iso,
              slotKey,
              slotTime: `${slot.start_time}-${slot.end_time}`,
              slotLocation: slot.location,
              title: plannedAssignment?.title || (kind === "strength" ? "Seance musculation" : "Entrainement"),
              km: swimSession?.distance && swimSession.distance > 0 ? swimSession.distance : null,
              session: swimSession,
              strengthRun,
              swimmerSlotId: slot.id,
              assignmentId: plannedAssignment?.id,
              assignmentSource: plannedAssignment
                ? (plannedAssignment.target_user_id === userId ? "individual" : "group")
                : undefined,
            });
            continue;
          }

          // Créneau muscu sans assignation : on rend quand même pour
          // garder le slot visible dans la semaine.
          const shouldRenderWithoutAssignment = !plannedAssignment && kind === "strength";
          if (!plannedAssignment && !shouldRenderWithoutAssignment) continue;

          const fallbackTitle = plannedAssignment?.title
            ?? (kind === "strength" ? "Seance musculation" : "Entrainement");
          const assignmentSource: "individual" | "group" = plannedAssignment
            ? (plannedAssignment.target_user_id === userId ? "individual" : "group")
            : "group";

          if (absence) {
            result.push({
              type: "absent",
              kind,
              date,
              iso,
              slotKey,
              slotTime: `${slot.start_time}-${slot.end_time}`,
              slotLocation: slot.location,
              title: fallbackTitle,
              km: null,
              absenceReason: absence.reason,
              swimmerSlotId: slot.id,
              assignmentId: plannedAssignment?.id,
              assignmentSource,
            });
          } else if (!isFuture(date)) {
            result.push({
              type: "missed",
              kind,
              date,
              iso,
              slotKey,
              slotTime: `${slot.start_time}-${slot.end_time}`,
              slotLocation: slot.location,
              title: fallbackTitle,
              km: null,
              swimmerSlotId: slot.id,
              assignmentId: plannedAssignment?.id,
              assignmentSource,
            });
          }
        }
        continue;
      }

      for (const r of resolved) {
        const slotKey = slotKeyFromTime(r.slotTime.split("-")[0]);
        const kind = inferSessionKind({
          slotSessionType: r.slotSessionType,
          assignmentType: r.assignment?.session_type ?? null,
          location: r.slotLocation,
        });
        // Le résolveur peut matcher une assignation dont le type diverge du
        // slot (ex: une séance natation sur un créneau muscu de même horaire).
        // On ignore l'assignation dans ce cas pour éviter d'afficher un titre
        // de nage sur une carte muscu (et vice-versa).
        const slotAssignment =
          r.assignment && r.assignment.session_type === kind ? r.assignment : null;
        const slotAssignmentId = slotAssignment ? r.assignmentId : null;
        const fallbackAssignment = !slotAssignment && kind === "swim"
          ? findFallbackAssignmentForSlot(swimAssignments, { slotKey, userId, usedAssignmentIds })
          : undefined;
        const plannedAssignment = slotAssignment ?? fallbackAssignment;
        if (slotAssignmentId) {
          usedAssignmentIds.add(slotAssignmentId);
        } else if (fallbackAssignment) {
          usedAssignmentIds.add(fallbackAssignment.id);
        }
        const swimSession = kind === "swim"
          ? findSwimSession({ iso, slotKey, assignmentId: slotAssignmentId ?? fallbackAssignment?.id })
          : undefined;
        const strengthRun = kind === "strength"
          ? findStrengthRun({ iso, slotKey, assignmentId: slotAssignmentId ?? undefined })
          : undefined;
        markRunConsumed(strengthRun);
        const title = plannedAssignment?.title || (kind === "strength" ? "Seance musculation" : "Entrainement");

        if (swimSession || strengthRun) {
          result.push({
            type: "logged",
            kind,
            date,
            iso,
            slotKey,
            slotTime: r.slotTime,
            slotLocation: r.slotLocation,
            title,
            km: swimSession?.distance && swimSession.distance > 0 ? swimSession.distance : null,
            session: swimSession,
            strengthRun,
            swimmerSlotId: r.swimmerSlotId,
            assignmentId: slotAssignmentId ?? fallbackAssignment?.id ?? undefined,
            assignmentSource: plannedAssignment
              ? (slotAssignment ? r.source : (plannedAssignment.target_user_id === userId ? "individual" : "group"))
              : undefined,
          });
        } else {
          // Pour un créneau muscu sans assignation dédiée, on ne veut pas
          // perdre le créneau — le slot est un engagement en soi, on rend
          // quand même la carte missed/absent avec le titre fallback.
          // Pour la natation, on garde l'ancien comportement (besoin d'une
          // assignation pour éviter d'inonder la vue de créneaux vides).
          const shouldRenderWithoutAssignment =
            !plannedAssignment && kind === "strength";
          if (!plannedAssignment && !shouldRenderWithoutAssignment) {
            continue;
          }
          const assignmentSource: "individual" | "group" = plannedAssignment
            ? (plannedAssignment.target_user_id === userId ? "individual" : "group")
            : "group";
          if (absence) {
            result.push({
              type: "absent",
              kind,
              date,
              iso,
              slotKey,
              slotTime: r.slotTime,
              slotLocation: r.slotLocation,
              title,
              km: null,
              absenceReason: absence.reason,
              swimmerSlotId: r.swimmerSlotId,
              assignmentId: slotAssignmentId ?? fallbackAssignment?.id ?? undefined,
              assignmentSource,
            });
          } else if (!isFuture(date)) {
            result.push({
              type: "missed",
              kind,
              date,
              iso,
              slotKey,
              slotTime: r.slotTime,
              slotLocation: r.slotLocation,
              title,
              km: null,
              swimmerSlotId: r.swimmerSlotId,
              assignmentId: slotAssignmentId ?? fallbackAssignment?.id ?? undefined,
              assignmentSource,
            });
          }
        }
      }

      // ── Orphan strength runs ──────────────────────────────
      // A swimmer can log a muscu session on a day where no strength slot
      // is scheduled (improvised workout, open-gym session, etc.). These
      // runs were not consumed by any slot-based card above, so we append
      // one logged card per orphan run on this day.
      for (const run of completedStrengthRuns) {
        if (run.id != null && consumedStrengthRunIds.has(run.id)) continue;
        if (getStrengthRunDateISO(run) !== iso) continue;
        const runSlotKey = getStrengthRunSlotKey(run) ?? "AM";
        result.push({
          type: "logged",
          kind: "strength",
          date,
          iso,
          slotKey: runSlotKey,
          slotTime: undefined,
          slotLocation: undefined,
          title: "Seance musculation",
          km: null,
          session: undefined,
          strengthRun: run,
          swimmerSlotId: undefined,
          assignmentId: run.assignment_id ?? undefined,
          assignmentSource: undefined,
        });
        if (run.id != null) consumedStrengthRunIds.add(run.id);
      }
    }

    return result;
  }, [
    weekDates,
    weekISOs,
    assignmentsMap,
    assignmentsByDate,
    swimmerSlots,
    absencesByDate,
    findStrengthRun,
    findSwimSession,
    completedStrengthRuns,
    userId,
  ]);

  // ── Group cards by day ─────────────────────────────────────

  const cardsByDay = useMemo(() => {
    const grouped = new Map<string, TimelineCard[]>();
    for (const card of cards) {
      const key = card.iso;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(card);
    }
    for (const [key, list] of grouped.entries()) {
      grouped.set(
        key,
        list.slice().sort((a, b) => {
          const byTime = slotSortValue(a.slotTime) - slotSortValue(b.slotTime);
          if (byTime !== 0) return byTime;
          return a.kind.localeCompare(b.kind);
        }),
      );
    }
    return grouped;
  }, [cards]);

  // ── Navigate to feedback/detail screen ─────────────────────

  const openFeedback = useCallback(
    (card: TimelineCard) => {
      if (card.kind === "strength") {
        navigate("/strength");
        return;
      }
      navigate(`/natation?date=${card.iso}`);
    },
    [navigate],
  );

  // ── Wellness banner visibility ─────────────────────────────

  const showWellnessBanner = weekOffset === 0 && !todayWellness && !!userId;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl overflow-x-hidden px-4 pb-28">
      <PageHeader
        title="Ma semaine"
        backHref="/suivi"
        backLabel="Mon suivi"
      />

      {/* Week navigator */}
      <div className="flex items-center justify-between py-3">
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition hover:bg-muted active:scale-95"
          aria-label="Semaine precedente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {formatWeekRange(monday)}
          </p>
          {weekOffset === 0 && (
            <p className="text-[10px] text-muted-foreground">Cette semaine</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition hover:bg-muted active:scale-95 disabled:opacity-30"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Wellness CTA banner */}
      {showWellnessBanner && (
        <button
          type="button"
          onClick={() => setWellnessOpen(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 transition hover:bg-primary/10 active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-foreground">Comment te sens-tu ce matin ?</p>
            <p className="text-[11px] text-muted-foreground">Remplis ton check bien-etre du jour</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* Timeline */}
      <div className="space-y-1">
        {weekDates.map((date, dayIdx) => {
          const iso = weekISOs[dayIdx];
          const dayCards = cardsByDay.get(iso) ?? [];
          const dayName = DAY_NAMES_FR[dayIdx];
          const today = isToday(date);
          const future = isFuture(date);

          return (
            <div key={iso}>
              {/* Day separator */}
              <div className={cn(
                "mt-2 flex items-center gap-2 py-2",
                today && "text-primary",
                future && "opacity-50",
              )}>
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wide",
                  today ? "text-primary" : "text-muted-foreground",
                )}>
                  {dayName}
                </span>
                <span className={cn(
                  "text-xs",
                  today ? "font-semibold text-primary" : "text-muted-foreground",
                )}>
                  {formatDateShort(date)}
                </span>
                {today && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Cards or empty state */}
              {dayCards.length === 0 && !future ? (
                <p className="py-1 pl-1 text-[11px] text-muted-foreground">
                  Pas de créneau
                </p>
              ) : dayCards.length === 0 && future ? null : (
                <div className="space-y-2">
                  {dayCards.map((card) => {
                    const cardKey = `${card.iso}_${card.kind}_${card.swimmerSlotId ?? card.assignmentId ?? card.slotTime ?? "x"}`;
                    const isExpanded = expandedKey === cardKey;

                    if (card.type === "logged") {
                      return (
                        <LoggedCard
                          key={cardKey}
                          card={card}
                          expanded={isExpanded}
                          onToggle={() => setExpandedKey(isExpanded ? null : cardKey)}
                        />
                      );
                    }

                    if (card.type === "absent") {
                      return (
                        <AbsentCard
                          key={cardKey}
                          card={card}
                          onUndo={() => removeAbsenceMutation.mutate(card.iso)}
                        />
                      );
                    }

                    return (
                      <MissedCard
                        key={cardKey}
                        card={card}
                        onTap={() => openFeedback(card)}
                        onMarkAbsent={() =>
                          absenceMutation.mutate({ date: card.iso })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Wellness Sheet */}
      <Sheet open={wellnessOpen} onOpenChange={setWellnessOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Bien-etre du jour</SheetTitle>
          </SheetHeader>
          <div className="pt-2">
            {userId && (
              <WellnessForm
                userId={userId}
                date={todayISO}
                onSaved={() => {
                  setWellnessOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["wellness", userId, todayISO] });
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function IndicatorPill({
  meta,
  value,
  active,
  onToggle,
}: {
  meta: IndicatorMeta;
  value: number | null | undefined;
  active: boolean;
  onToggle: () => void;
}) {
  const tooltip = describeIndicatorValue(meta, value);

  return (
    <span className="relative group">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold",
          "cursor-pointer",
          indicatorColor(meta.mode, value),
        )}
        aria-label={tooltip ?? meta.fullLabel}
        title={tooltip ?? meta.fullLabel}
      >
        {value ?? "\u2014"}
      </button>
      {tooltip && (
        <span
          className={cn(
            "pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[9px] font-semibold text-background transition-opacity",
            "opacity-0 group-hover:opacity-100",
            active && "opacity-100",
          )}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}

function LoggedCard({
  card,
  expanded,
  onToggle,
}: {
  card: TimelineCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const isStrength = card.kind === "strength";
  const session = card.session;
  const strengthRun = card.strengthRun;
  const indicators = isStrength ? STRENGTH_INDICATORS : SWIM_INDICATORS;
  const comments = isStrength ? strengthRun?.comments : session?.comments;
  const hasExpandableContent = Boolean(comments || session?.coach_notes);

  return (
    <button
      type="button"
      onClick={() => {
        setActiveTooltip(null);
        onToggle();
      }}
      className={cn(
        "w-full rounded-2xl border border-l-4 p-3 text-left transition-all",
        isStrength
          ? "border-amber-200/70 border-l-amber-500 bg-amber-50/40 hover:border-amber-300 dark:border-amber-900/40 dark:border-l-amber-500 dark:bg-amber-950/10"
          : "border-border border-l-blue-500 bg-blue-50/30 hover:border-blue-300 dark:border-blue-900/40 dark:border-l-blue-500 dark:bg-blue-950/10",
      )}
    >
      {/* Top row: slot info */}
      <div className="mb-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            isStrength
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
          )}
        >
          {isStrength ? <Dumbbell className="h-3 w-3" /> : <Droplets className="h-3 w-3" />}
          {isStrength ? "Muscu" : "Natation"}
        </span>
        {card.slotTime && (
          <span className="flex shrink-0 items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatSlotTime(card.slotTime)}
          </span>
        )}
        {card.slotLocation && (
          <span className="flex min-w-0 items-center gap-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{card.slotLocation}</span>
          </span>
        )}
      </div>

      {/* Title + session facts + indicators */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-foreground">{card.title}</span>
          {!isStrength && session && session.distance > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {session.distance}m
            </span>
          )}
          {isStrength && strengthRun?.duration && strengthRun.duration > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {strengthRun.duration} min
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {indicators.map((indicator) => {
            const value = isStrength
              ? getStrengthRunIndicatorValue(strengthRun, indicator.key)
              : (session?.[indicator.key as keyof Session] as number | null | undefined);
            const tooltipId = `${card.iso}-${card.assignmentId ?? card.swimmerSlotId ?? "x"}-${indicator.key}`;
            return (
              <IndicatorPill
                key={indicator.key}
                meta={indicator}
                value={value}
                active={activeTooltip === tooltipId}
                onToggle={() => setActiveTooltip(activeTooltip === tooltipId ? null : tooltipId)}
              />
            );
          })}
        </div>
      </div>

      {/* Expandable details */}
      {hasExpandableContent && (
        <div className="mt-1 flex justify-end">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      )}

      {expanded && hasExpandableContent && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          {comments && (
            <p className="whitespace-pre-wrap text-xs text-foreground">{comments}</p>
          )}
          {session?.coach_notes && (
            <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 p-2 dark:bg-blue-950/20">
              <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Note du coach</p>
              <p className="text-xs text-blue-800 dark:text-blue-300">{session.coach_notes}</p>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function MissedCard({
  card,
  onTap,
  onMarkAbsent,
}: {
  card: TimelineCard;
  onTap: () => void;
  onMarkAbsent: () => void;
}) {
  const isStrength = card.kind === "strength";

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-l-4 border-dashed p-3 opacity-80",
        isStrength
          ? "border-amber-200/80 border-l-amber-500 bg-amber-50/30 dark:border-amber-900/40 dark:border-l-amber-500 dark:bg-amber-950/10"
          : "border-border border-l-blue-500 bg-blue-50/20 dark:border-blue-900/40 dark:border-l-blue-500 dark:bg-blue-950/10",
      )}
    >
      {/* Slot info */}
      <div className="mb-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            isStrength
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
          )}
        >
          {isStrength ? <Dumbbell className="h-3 w-3" /> : <Droplets className="h-3 w-3" />}
          {isStrength ? "Muscu" : "Natation"}
        </span>
        {card.slotTime && (
          <span className="flex shrink-0 items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatSlotTime(card.slotTime)}
          </span>
        )}
        {card.slotLocation && (
          <span className="flex min-w-0 items-center gap-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{card.slotLocation}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{card.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isStrength ? "Pas de bilan muscu" : "Pas de ressenti"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMarkAbsent();
            }}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-muted active:scale-95"
          >
            <XCircle className="h-3 w-3" />
            Absent
          </button>
          <button
            type="button"
            onClick={onTap}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition active:scale-95",
              isStrength
                ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {isStrength ? <Dumbbell className="h-3 w-3" /> : <Droplets className="h-3 w-3" />}
            {isStrength ? "Ouvrir" : "Saisir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AbsentCard({
  card,
  onUndo,
}: {
  card: TimelineCard;
  onUndo: () => void;
}) {
  const isStrength = card.kind === "strength";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl border border-l-4 bg-muted/30 p-2.5",
        isStrength
          ? "border-border border-l-amber-500"
          : "border-border border-l-blue-500",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {card.slotTime && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatSlotTime(card.slotTime)}
            </span>
          )}
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
              isStrength
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
            )}
          >
            {isStrength ? "Muscu" : "Natation"}
          </span>
          <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Absent
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] font-medium text-foreground">{card.title}</p>
        {card.absenceReason && (
          <span className="text-[10px] text-muted-foreground">{card.absenceReason}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card transition hover:bg-muted active:scale-95"
        aria-label="Annuler absence"
      >
        <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

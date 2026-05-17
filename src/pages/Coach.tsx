import { Suspense, useEffect, useMemo, useState } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  getUnassignedSlots30d,
  getTrainingSlots,
  getSlotAssignments,
  getSlotOverrides,
  getSwimmerComments,
  getSwimCatalog,
  getStrengthSessions,
  getAthletes,
  getAllAssignments,
  getAssignments,
  getGroups,
  getCoachKpis,
  withTimeout,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useMySwimmerIds, filterByAssignment } from "@/hooks/useMySwimmerIds";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Gauge,
  MessageSquareText,
  ShieldCheck,
  Sunrise,
  Sunset,
  Trophy,
  UserCheck,
  Users,
  UsersRound,
  Timer,
  Waves,
} from "lucide-react";
import {
  HomeSkeleton,
  CalendarSkeleton,
  ListSkeleton,
} from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  formatRelativeDate,
  getMonday as getMondayOfWeek,
  getSunday as getSundayOfWeek,
  toISODate as formatDateIso,
  mondayIsoOf as mondayIsoOfDate,
} from "@/lib/date";
import { PendingApprovals } from "@/components/shared/PendingApprovals";
import { buildCoachHash, parseCoachHashLocation, type CoachSection } from "./coach/coachRouteState";

// Route guard: only sync routeState when the current hash path is exactly "/coach".
// Sub-paths like "/coach/swim-planning" or sibling routes ("/profile", "/records-admin")
// must not drive Coach's local routeState, otherwise the [routeState] effect replaces
// the hash back to "#/coach" and swallows the navigation.
const isCoachRouteHash = (hash: string): boolean => {
  const [path] = hash.replace(/^#/, "").split("?");
  return path === "/coach";
};
// Migration vers lazyWithRetry (§120) — gère les chunks périmés après deploy PWA.
const CoachSwimmersOverview = lazyWithRetry(() => import("./coach/CoachSwimmersOverview"));
const CoachGroupsScreen = lazyWithRetry(() => import("./coach/CoachGroupsScreen"));
const CoachCompetitionsScreen = lazyWithRetry(() => import("./coach/CoachCompetitionsScreen"));
const CoachSwimmerDetail = lazyWithRetry(() => import("./coach/CoachSwimmerDetail"));
const CoachWeekView = lazyWithRetry(() => import("./coach/CoachWeekView"));
const CoachLibrary = lazyWithRetry(() => import("./coach/CoachLibrary"));
const CoachComms = lazyWithRetry(() => import("./coach/CoachComms"));
const CoachChronoScreen = lazyWithRetry(() => import("./coach/CoachChronoScreen"));
const CoachChronoHistoryScreen = lazyWithRetry(() => import("./coach/CoachChronoHistoryScreen"));
const CoachMySwimmersScreen = lazyWithRetry(() => import("./coach/CoachMySwimmersScreen"));
const CoachCommentsScreen = lazyWithRetry(() => import("./coach/CoachCommentsScreen"));
const CoachPaceCalculatorScreen = lazyWithRetry(() => import("./coach/CoachPaceCalculatorScreen"));
import CoachChallengesSection from "@/components/coach/CoachChallengesSection";
type KpiLookbackPeriod = 7 | 30 | 365;

type CoachAthleteOption = {
  id: number | null;
  display_name: string;
  group_label?: string | null;
  avatar_url?: string | null;
};

type CoachHomeProps = {
  onNavigate: (section: CoachSection) => void;
  onOpenRecordsClub: () => void;
  onOpenRecordsAdmin: () => void;
  onOpenSwimPlanning: () => void;
  onOpenStrengthPlanning: () => void;
  onOpenStrengthAssessment: () => void;
  onOpenMyStrength: () => void;
  onOpenMyRecords: () => void;
  onOpenAthlete: (athlete: CoachAthleteOption) => void;
  onOpenWeekAt: (weekDate: string) => void;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null; avatar_url?: string | null }>;
  athletesLoading: boolean;
  kpiLoading: boolean;
  fatigueAlerts: Array<{
    athleteName: string;
    rating: number;
    average: number;
    sampleCount: number;
    level: "high" | "max";
  }>;
  groups: Array<{ id: number; name: string; member_count?: number | null; is_temporary?: boolean; is_active?: boolean; parent_group_id?: number | null }>;
};

// ── Minimal section divider label ──────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pb-0.5">
      <span className="text-[11px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
        {children}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ── "Ma semaine" cell state: one half-day for one day ──────────────────────
type CellState = "none" | "empty" | "partial" | "full";
type CellInfo = { state: CellState; total: number; assigned: number };

function SlotCell({ info, isToday }: { info: CellInfo; isToday: boolean }) {
  const { state, total, assigned } = info;
  const ringClass = isToday ? "ring-1 ring-primary/30 ring-offset-1 ring-offset-card" : "";

  if (state === "none") {
    return (
      <div className="flex h-9 items-center justify-center">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/20" aria-hidden />
        <span className="sr-only">Aucun créneau</span>
      </div>
    );
  }

  if (state === "full") {
    const showCount = total > 1;
    return (
      <div className="flex h-9 items-center justify-center">
        <div
          className={[
            "flex h-7 w-7 items-center justify-center rounded-[10px] bg-status-success text-white shadow-sm shadow-status-success/30",
            ringClass,
          ].join(" ")}
          aria-label={showCount ? `${assigned} séances assignées` : "Séance assignée"}
        >
          {showCount ? (
            <span className="text-[10px] font-black tabular-nums leading-none">{assigned}</span>
          ) : (
            <Check className="h-3.5 w-3.5 stroke-[3]" />
          )}
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex h-9 items-center justify-center">
        <div
          className={[
            "relative flex h-7 w-7 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-status-warning bg-status-warning-bg",
            ringClass,
          ].join(" ")}
          aria-label={`${total} créneau${total > 1 ? "x" : ""} sans séance`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-warning opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-warning" />
          </span>
        </div>
      </div>
    );
  }

  // partial: some slots assigned, some empty
  return (
    <div className="flex h-9 items-center justify-center">
      <div
        className={[
          "relative flex h-7 w-7 items-center justify-center rounded-[10px] bg-status-success text-white shadow-sm shadow-status-success/30",
          ringClass,
        ].join(" ")}
        aria-label={`${assigned} sur ${total} séances assignées`}
      >
        <span className="text-[11px] font-black tabular-nums leading-none">
          {assigned}/{total}
        </span>
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-status-warning ring-2 ring-card" />
      </div>
    </div>
  );
}

const RECENT_ATHLETES_KEY = "eac-recent-coach-athletes";
const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"] as const;
const FATIGUE_ALERT_MIN_SAMPLES = 2;
const FATIGUE_ALERT_HIGH_THRESHOLD = 4.2;
const FATIGUE_ALERT_MAX_THRESHOLD = 4.7;

// §198 QW6 — formatRelativeTime local supprimé, on utilise formatRelativeDate
// (de src/lib/date.ts, §196) qui ajoute hier/lun./jj/mm pour lisibilité accrue.
// §211 — getMondayOfWeek/getSundayOfWeek/formatDateIso/mondayIsoOfDate déplacés
// dans src/lib/date.ts (helpers canoniques getMonday/getSunday/toISODate/mondayIsoOf).

// ── CoachHome — "Ma semaine" dashboard ────────────────────────────────────
const CoachHome = ({
  onNavigate,
  onOpenRecordsClub,
  onOpenRecordsAdmin,
  onOpenSwimPlanning,
  onOpenStrengthPlanning,
  onOpenStrengthAssessment,
  onOpenMyStrength,
  onOpenMyRecords,
  onOpenAthlete,
  onOpenWeekAt,
  athletes,
  athletesLoading,
  kpiLoading,
  fatigueAlerts,
  groups,
}: CoachHomeProps) => {
  const userName = useAuth((s) => s.user);
  const coachUserId = useAuth((s) => s.userId);
  const firstName = userName?.split(" ")[0] ?? "Coach";

  // §272 — Détection de la séance muscu perso du coach pour aujourd'hui.
  // Miroir du SwimmerHome : assignments strength scopées sur le coachUserId.
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { data: myStrengthAssignments = [] } = useQuery({
    queryKey: ["coach-my-strength-assignments", coachUserId],
    queryFn: () =>
      getAssignments(userName ?? "", coachUserId, { assignmentType: "strength" }),
    enabled: !!coachUserId,
    staleTime: 60_000,
  });
  const todayStrengthAssignment = useMemo(() => {
    return (
      (myStrengthAssignments ?? []).find((a) => {
        const iso = String(a?.assigned_date ?? "").slice(0, 10);
        return iso === todayIso;
      }) ?? null
    );
  }, [myStrengthAssignments, todayIso]);

  const now = useMemo(() => new Date(), []);
  const monday = useMemo(() => getMondayOfWeek(now), [now]);
  const sunday = useMemo(() => getSundayOfWeek(monday), [monday]);
  const mondayLabel = monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  // Today's index in ISO week (0=Mon..6=Sun)
  const todayIndex = useMemo(() => {
    const jsDay = now.getDay(); // 0=Sun
    return jsDay === 0 ? 6 : jsDay - 1;
  }, [now]);

  // ── Section "Créneaux à compléter (30j)" ──────────────────────
  const { data: unassignedSlots = [], isLoading: unassignedLoading } = useQuery({
    queryKey: ["unassigned-slots-30d"],
    queryFn: () => getUnassignedSlots30d(),
  });

  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

  const unassignedByWeek = useMemo(() => {
    const weekGroups = new Map<string, typeof unassignedSlots>();
    for (const slot of unassignedSlots) {
      const mon = mondayIsoOfDate(slot.scheduled_date);
      const list = weekGroups.get(mon) ?? [];
      list.push(slot);
      weekGroups.set(mon, list);
    }
    return Array.from(weekGroups.entries());
  }, [unassignedSlots]);

  const DOW_LABELS_SHORT = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] as const;
  function formatSlotDateLabel(dateIso: string): string {
    const d = new Date(dateIso + "T00:00:00");
    const jsDay = d.getDay();
    const dowIdx = jsDay === 0 ? 6 : jsDay - 1;
    const month = d.toLocaleDateString("fr-FR", { month: "short" });
    return `${DOW_LABELS_SHORT[dowIdx]} ${d.getDate()} ${month}`;
  }
  function formatSlotTimeLabel(start: string, end: string): string {
    return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
  }
  function formatWeekLabel(mondayIso: string): string {
    const d = new Date(mondayIso + "T00:00:00");
    return `Semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  }

  // ── Section B: Slot data ────────────────────────────────────
  const { data: slots = [] } = useQuery({
    queryKey: ["training-slots"],
    queryFn: () => getTrainingSlots(),
  });

  const { data: slotAssignments = [] } = useQuery({
    queryKey: ["slot-assignments-week", formatDateIso(monday), formatDateIso(sunday)],
    queryFn: () =>
      getSlotAssignments({
        from: formatDateIso(monday),
        to: formatDateIso(sunday),
        includeCompleted: true,
      }),
  });

  const { data: slotOverrides = [] } = useQuery({
    queryKey: ["slot-overrides-week", formatDateIso(monday)],
    queryFn: () => getSlotOverrides({ fromDate: formatDateIso(monday) }),
  });

  // Build 7×2 grid: morning/afternoon per day, tracking assigned vs. empty slots.
  // The coach sees at a glance which half-day slots are unplanned for their groups.
  const weekGrid = useMemo(() => {
    const mondayIso = formatDateIso(monday);
    const sundayIso = formatDateIso(sunday);

    // Slot instances cancelled for a specific date this week (via overrides).
    // Key format: `${slot_id}|${YYYY-MM-DD}`.
    const cancelledSlotInstances = new Set<string>();
    for (const ov of slotOverrides) {
      if (
        ov.status === "cancelled" &&
        ov.override_date >= mondayIso &&
        ov.override_date <= sundayIso
      ) {
        cancelledSlotInstances.add(`${ov.slot_id}|${ov.override_date}`);
      }
    }

    // Only swim slots count — strength sessions are handled separately.
    // One-off slots are kept only if their scheduled_date is in this week.
    const weekSlots = slots.filter((s) => {
      if (s.session_type !== "swim") return false;
      if (!s.scheduled_date) return true;
      return s.scheduled_date >= mondayIso && s.scheduled_date <= sundayIso;
    });

    // Normalize day_of_week to 0=Mon..6=Sun. DB uses ISO 1-7
    // (CoachTrainingSlotsScreen.tsx:848 — `jsDay === 0 ? 7 : jsDay`).
    const dayIdx = (dow: number) =>
      dow >= 1 && dow <= 7 ? dow - 1 : dow;

    // Half-day bucketing — matches useSlotCalendar.getSlotScheduleBucket.
    const slotHalf = (slot: typeof weekSlots[number]) =>
      parseInt(slot.start_time.split(":")[0] ?? "0", 10) < 13 ? 0 : 1;

    // ISO date for a slot's weekly instance (one-offs keep their own date).
    const slotDateIso = (slot: typeof weekSlots[number]) => {
      if (slot.scheduled_date) return slot.scheduled_date;
      const d = new Date(monday);
      d.setDate(monday.getDate() + dayIdx(slot.day_of_week));
      return formatDateIso(d);
    };

    const isSlotCancelled = (slot: typeof weekSlots[number]) =>
      cancelledSlotInstances.has(`${slot.id}|${slotDateIso(slot)}`);

    // Active instances this week (cancelled-via-override excluded).
    const activeSlots = weekSlots.filter((s) => !isSlotCancelled(s));

    // Mark slot IDs that have at least one non-cancelled assignment.
    // The getSlotAssignments query is already bounded to this week, so a
    // slot-id match is enough — we don't need a scheduled_date tiebreaker.
    // Fallback: assignments without training_slot_id but with scheduled_date
    // + scheduled_slot light up every slot matching that (day, half-day).
    const slotHasSession = new Set<string>();
    for (const a of slotAssignments) {
      if (a.status === "cancelled") continue;
      if (a.training_slot_id) {
        slotHasSession.add(a.training_slot_id);
        continue;
      }
      if (a.scheduled_date && a.scheduled_slot) {
        const jsDay = new Date(a.scheduled_date + "T00:00:00").getDay();
        const dow = jsDay === 0 ? 6 : jsDay - 1;
        const targetHalf = a.scheduled_slot === "morning" ? 0 : 1;
        for (const slot of activeSlots) {
          if (dayIdx(slot.day_of_week) === dow && slotHalf(slot) === targetHalf) {
            slotHasSession.add(slot.id);
          }
        }
      }
    }

    // 7 days × 2 halves (0 = matin, 1 = aprèm)
    const matrix: Array<[CellInfo, CellInfo]> = Array.from({ length: 7 }, () => [
      { state: "none", total: 0, assigned: 0 },
      { state: "none", total: 0, assigned: 0 },
    ]);

    for (const slot of activeSlots) {
      const rowIdx = dayIdx(slot.day_of_week);
      if (rowIdx < 0 || rowIdx > 6) continue;
      const cell = matrix[rowIdx][slotHalf(slot)];
      cell.total += 1;
      if (slotHasSession.has(slot.id)) cell.assigned += 1;
    }

    for (const row of matrix) {
      for (const cell of row) {
        if (cell.total === 0) cell.state = "none";
        else if (cell.assigned === 0) cell.state = "empty";
        else if (cell.assigned >= cell.total) cell.state = "full";
        else cell.state = "partial";
      }
    }

    const morning = matrix.map((row) => row[0]);
    const afternoon = matrix.map((row) => row[1]);
    // Sum from the matrix so the footer can never diverge from the tiles.
    let totalSlots = 0;
    let assignedSlots = 0;
    for (const row of matrix) {
      for (const cell of row) {
        totalSlots += cell.total;
        assignedSlots += cell.assigned;
      }
    }
    const emptyCount = totalSlots - assignedSlots;

    return { morning, afternoon, totalSlots, assignedSlots, emptyCount };
  }, [slots, slotAssignments, slotOverrides, monday, sunday]);

  // ── Section C: Fatigue alerts (max 3) ──────────────────────
  const topAlerts = useMemo(() => fatigueAlerts.slice(0, 3), [fatigueAlerts]);
  const hasMaxFatigueAlert = useMemo(
    () => topAlerts.some((alert) => alert.level === "max"),
    [topAlerts],
  );

  // ── Section C-bis: Recent swimmer comments (48h) ──────────
  const { data: recentComments } = useQuery({
    queryKey: ["coach-comments-recent-48h", coachUserId],
    queryFn: async () => {
      if (!coachUserId) return { comments: [] as any[], unreadCount: 0 };
      const all = await getSwimmerComments(coachUserId, { limit: 20 });
      const since = Date.now() - 48 * 60 * 60 * 1000;
      const recent = all.filter((c) => new Date(c.created_at).getTime() >= since);
      const unreadCount = recent.filter((c) => !c.is_read).length;
      return { comments: recent.slice(0, 3), unreadCount };
    },
    enabled: !!coachUserId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Section D: Quick access ────────────────────────────────
  const quickAccess = useMemo(
    () => [
      { label: "Planif. Nage", icon: Waves, action: onOpenSwimPlanning, color: "text-cyan-500", bg: "bg-cyan-100 dark:bg-cyan-900/30" },
      { label: "Planif. Muscu", icon: Dumbbell, action: onOpenStrengthPlanning, color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/30" },
      { label: "Bilan muscu", icon: ClipboardCheck, action: onOpenStrengthAssessment, color: "text-fuchsia-500", bg: "bg-fuchsia-100 dark:bg-fuchsia-900/30" },
      { label: "Echéances", icon: CalendarDays, action: () => onNavigate("competitions"), color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/30" },
      { label: "Groupes", icon: UsersRound, action: () => onNavigate("groups"), color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
      { label: "Mes nageurs", icon: UserCheck, action: () => onNavigate("my-swimmers"), color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/30" },
      { label: "Allures équipe", icon: Gauge, action: () => onNavigate("pace-calculator"), color: "text-cyan-600", bg: "bg-cyan-100 dark:bg-cyan-900/30" },
      { label: "Comms", icon: BellRing, action: () => onNavigate("comms"), color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Records", icon: Trophy, action: onOpenRecordsClub, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30" },
      { label: "Chronos", icon: Timer, action: () => onNavigate("chrono-history"), color: "text-rose-500", bg: "bg-rose-100 dark:bg-rose-900/30" },
      { label: "Admin rec.", icon: ShieldCheck, action: onOpenRecordsAdmin, color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-900/30" },
    ],
    [onNavigate, onOpenRecordsClub, onOpenRecordsAdmin, onOpenSwimPlanning, onOpenStrengthPlanning, onOpenStrengthAssessment],
  );

  // ── Section E: Recent athletes ─────────────────────────────
  const recentAthletes = useMemo(() => {
    try {
      const raw = localStorage.getItem(RECENT_ATHLETES_KEY);
      if (!raw) return [];
      const ids: number[] = JSON.parse(raw);
      return ids
        .map((id) => athletes.find((a) => a.id === id))
        .filter(Boolean) as typeof athletes;
    } catch {
      return [];
    }
  }, [athletes]);

  return (
    <div className="space-y-5 pb-24">
      {/* ── Section A: Header ── */}
      <section className="pt-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Bonjour {firstName}
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Semaine du {mondayLabel}
        </p>
      </section>

      {/* ── Pending approvals banner ── */}
      <PendingApprovals compact />

      {/* ── Section B: Ma semaine — matrice matin/aprèm × 7 jours ── */}
      <section className="space-y-2.5">
        <SectionLabel>Ma semaine</SectionLabel>

        <button
          type="button"
          onClick={() => onNavigate("week")}
          className="block w-full rounded-2xl border bg-card p-4 text-left transition-colors active:bg-muted"
        >
          <div
            className="grid items-center gap-y-1.5"
            style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}
          >
            {/* Header row: day letter + date + today marker */}
            <div aria-hidden />
            {DAY_LABELS.map((label, i) => {
              const dayDate = new Date(monday);
              dayDate.setDate(monday.getDate() + i);
              const isToday = i === todayIndex;
              return (
                <div
                  key={`h-${i}`}
                  className="flex flex-col items-center gap-0.5 pb-1 leading-none"
                >
                  <span
                    className={[
                      "text-[11px] font-black uppercase tracking-eyebrow-lg",
                      isToday ? "text-primary" : "text-muted-foreground/60",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                  <span
                    className={[
                      "text-[11px] tabular-nums",
                      isToday ? "font-black text-primary" : "font-semibold text-muted-foreground/50",
                    ].join(" ")}
                  >
                    {dayDate.getDate()}
                  </span>
                  <span
                    className={[
                      "h-[2px] w-4 rounded-full",
                      isToday ? "bg-primary" : "bg-transparent",
                    ].join(" ")}
                    aria-hidden
                  />
                </div>
              );
            })}

            {/* Matin row label */}
            <div className="flex items-center justify-end gap-1 pr-1.5 whitespace-nowrap">
              <Sunrise className="h-3 w-3 shrink-0 text-amber-500/80" />
              <span className="text-[11px] font-black uppercase tracking-eyebrow-sm text-muted-foreground">
                Matin
              </span>
            </div>
            {weekGrid.morning.map((cell, i) => (
              <SlotCell key={`m-${i}`} info={cell} isToday={i === todayIndex} />
            ))}

            {/* Aprèm row label */}
            <div className="flex items-center justify-end gap-1 pr-1.5 whitespace-nowrap">
              <Sunset className="h-3 w-3 shrink-0 text-rose-400/90" />
              <span className="text-[11px] font-black uppercase tracking-eyebrow-sm text-muted-foreground">
                Aprèm
              </span>
            </div>
            {weekGrid.afternoon.map((cell, i) => (
              <SlotCell key={`a-${i}`} info={cell} isToday={i === todayIndex} />
            ))}
          </div>

          {/* Footer — stats + verdict */}
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black tabular-nums leading-none">
                {weekGrid.assignedSlots}
              </span>
              <span className="text-[10px] uppercase tracking-eyebrow text-muted-foreground/70">
                / {weekGrid.totalSlots} créneaux planifiés
              </span>
            </div>
            {weekGrid.totalSlots === 0 ? (
              <span className="text-[11px] italic text-muted-foreground">
                Aucun créneau configuré
              </span>
            ) : weekGrid.emptyCount > 0 ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-status-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                {weekGrid.emptyCount} à compléter
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-status-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Semaine complète
              </span>
            )}
          </div>
        </button>
      </section>

      {/* ── Section B-bis: Créneaux à compléter (30j) ── */}
      <section className="space-y-2.5">
        <SectionLabel>Créneaux à compléter</SectionLabel>

        {unassignedLoading ? (
          <div className="rounded-2xl border bg-card p-4">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
        ) : unassignedSlots.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl border border-status-success/30 bg-status-success-bg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />
            <span className="text-[12px] font-semibold text-status-success">
              Tous les créneaux des 30 derniers jours sont assignés
            </span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-status-warning/30 bg-status-warning-bg">
            <button
              type="button"
              onClick={() => setUnassignedExpanded((v) => !v)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-status-warning/10"
              aria-expanded={unassignedExpanded}
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-status-warning" />
              <span className="flex-1 text-[13px] font-semibold text-status-warning">
                {unassignedSlots.length} créneau{unassignedSlots.length > 1 ? "x" : ""} à compléter
                <span className="ml-1 text-[11px] font-normal text-status-warning/80">
                  (30 derniers jours)
                </span>
              </span>
              <ChevronRight
                className={[
                  "h-4 w-4 shrink-0 text-status-warning transition-transform",
                  unassignedExpanded ? "rotate-90" : "",
                ].join(" ")}
              />
            </button>

            {unassignedExpanded && (
              <div className="border-t border-status-warning/20">
                {unassignedByWeek.map(([mondayIso, weekSlots]) => (
                  <div key={mondayIso}>
                    <div className="bg-status-warning/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-eyebrow text-status-warning/70">
                      {formatWeekLabel(mondayIso)}
                    </div>
                    <div className="divide-y divide-status-warning/20">
                      {weekSlots.map((slot) => (
                        <button
                          key={`${slot.slot_id}-${slot.scheduled_date}`}
                          type="button"
                          onClick={() => onOpenWeekAt(mondayIso)}
                          className="flex w-full items-center gap-3 bg-white/60 px-4 py-2.5 text-left transition-colors active:bg-white/90 dark:bg-black/10 dark:active:bg-black/20"
                        >
                          <span className="text-[12px] font-semibold text-foreground min-w-[5.5rem]">
                            {formatSlotDateLabel(slot.scheduled_date)}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {formatSlotTimeLabel(slot.start_time, slot.end_time)}
                          </span>
                          {slot.location && (
                            <span className="truncate text-[11px] text-muted-foreground/80">
                              · {slot.location}
                            </span>
                          )}
                          <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section C: Alertes (conditional) ── */}
      {topAlerts.length > 0 && !kpiLoading && (
        <section className="space-y-2.5">
          <SectionLabel>Alertes</SectionLabel>

          <div className={[
            "space-y-1.5 rounded-2xl border p-3",
            hasMaxFatigueAlert
              ? "border-status-error/30 bg-status-error-bg"
              : "border-status-warning/30 bg-status-warning-bg",
          ].join(" ")}>
            {topAlerts.map((alert) => {
              const athlete = athletes.find((a) => a.display_name === alert.athleteName);
              const isMaxAlert = alert.level === "max";
              return (
                <button
                  key={alert.athleteName}
                  type="button"
                  onClick={() => {
                    if (athlete) onOpenAthlete(athlete);
                    else onNavigate("swimmers");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/70 dark:bg-black/20 px-3.5 py-2.5 text-left transition-colors active:bg-white/90"
                >
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span
                      className={[
                        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                        isMaxAlert ? "bg-status-error" : "bg-status-warning",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "relative inline-flex h-3 w-3 rounded-full",
                        isMaxAlert ? "bg-status-error" : "bg-status-warning",
                      ].join(" ")}
                    />
                  </span>
                  <span
                    className={[
                      "flex-1 text-sm font-semibold",
                      isMaxAlert ? "text-status-error" : "text-status-warning",
                    ].join(" ")}
                  >
                    {alert.athleteName}
                  </span>
                  <span
                    className={[
                      "text-[11px] font-black uppercase tracking-widest",
                      isMaxAlert ? "text-status-error" : "text-status-warning",
                    ].join(" ")}
                  >
                    {isMaxAlert ? "Fatigue max" : "Fatigue élevée"}
                  </span>
                  <span
                    className={[
                      "text-[10px] font-bold tabular-nums",
                      isMaxAlert ? "text-status-error" : "text-status-warning",
                    ].join(" ")}
                  >
                    {alert.average.toFixed(1)}/5
                  </span>
                  <ChevronRight
                    className={[
                      "h-3.5 w-3.5",
                      isMaxAlert ? "text-status-error" : "text-status-warning",
                    ].join(" ")}
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section C-bis: Commentaires nageurs (48h) ── */}
      {(recentComments?.comments?.length ?? 0) > 0 && (
        <section className="space-y-2.5">
          <SectionLabel>Commentaires</SectionLabel>

          <button
            type="button"
            onClick={() => onNavigate("comments")}
            className="w-full rounded-2xl border border-violet-200 bg-violet-50/70 p-3 text-left transition-colors active:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/25"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
                  <MessageSquareText className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <span className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                  Commentaires nageurs
                </span>
              </div>
              {(recentComments?.unreadCount ?? 0) > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                  {recentComments!.unreadCount}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              {recentComments!.comments.map((c: any) => (
                <div
                  key={c.session_id}
                  className="flex items-start gap-2 rounded-xl bg-white/70 dark:bg-black/20 px-3 py-2"
                >
                  {!c.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {c.athlete_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatRelativeDate(c.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {c.comments}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 text-center mt-2">
              Voir tous les commentaires
            </p>
          </button>
        </section>
      )}

      {/* ── Section D: Accès rapides ── */}
      <section className="space-y-2.5">
        <SectionLabel>Accès rapides</SectionLabel>

        <div className="grid grid-cols-3 gap-2">
          {quickAccess.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-2 py-3.5 text-center transition-colors active:bg-muted"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <span className="text-[11px] font-semibold leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Section E: Challenges d'équipe ── */}
      <section className="space-y-2.5">
        <SectionLabel>Challenges</SectionLabel>
        <div className="rounded-2xl border bg-card p-4">
          <CoachChallengesSection groups={groups} />
        </div>
      </section>

      {/* ── Section E-bis: Mon entraînement (§271, étendu §272) ── */}
      <section className="space-y-2.5">
        <SectionLabel>Mon entraînement</SectionLabel>

        {/* Carte principale : séance du jour ou accès muscu libre */}
        <button
          type="button"
          onClick={onOpenMyStrength}
          className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors active:bg-muted"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {todayStrengthAssignment ? (
              <>
                <p className="truncate text-sm font-semibold">
                  {String(todayStrengthAssignment.title ?? "Séance musculation")}
                </p>
                <p className="truncate text-[11px] font-medium text-violet-700 dark:text-violet-300">
                  Aujourd'hui — Démarrer ma séance
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Ma muscu perso</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Lancer une séance libre depuis la biblio
                </p>
              </>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {/* Lien secondaire : édition 1RM via /records?tab=1rm */}
        <button
          type="button"
          onClick={onOpenMyRecords}
          className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-2.5 text-left transition-colors active:bg-muted"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Mes records muscu</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Régler / mettre à jour mes 1RM
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </section>

      {/* ── Section F: Nageurs récents ── */}
      <section className="space-y-2.5">
        <SectionLabel>Nageurs récents</SectionLabel>

        {athletesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-18 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : recentAthletes.length === 0 ? (
          <EmptyState compact icon={<Users />} title="Aucun nageur consulté récemment" />
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="divide-y divide-border/60">
              {recentAthletes.slice(0, 3).map((athlete) => {
                const initials = athlete.display_name.charAt(0).toUpperCase();
                return (
                  <button
                    key={athlete.id ?? athlete.display_name}
                    type="button"
                    onClick={() => onOpenAthlete(athlete)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted"
                  >
                    {athlete.avatar_url ? (
                      <img
                        src={athlete.avatar_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover border border-border"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{athlete.display_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {athlete.group_label || "Sans groupe"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

// ── Data helpers ───────────────────────────────────────────────────────────
const getDateOnly = (value: Date) => value.toISOString().split("T")[0];
// §222 — getRunTimestamp/getRunFatigueValue retirés : la fenêtre temporelle
// et la source de fatigue sont gérées côté SQL par get_coach_kpis (RPC).
const normalizeFatigueValue = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num <= 5) {
    return Math.min(5, Math.max(1, num));
  }
  if (num <= 10) {
    return Math.min(5, Math.max(1, num / 2));
  }
  return null;
};

const buildFatigueRating = (values: number[]) => {
  const normalizedValues = values
    .map((value) => normalizeFatigueValue(value))
    .filter((value): value is number => value != null);
  if (!normalizedValues.length) return null;
  const average = normalizedValues.reduce((sum, value) => sum + value, 0) / normalizedValues.length;
  const rating = Math.min(5, Math.max(1, Math.round(average)));
  return { average, rating, sampleCount: normalizedValues.length };
};

// ── Coach (outer router component — unchanged) ─────────────────────────────
export default function Coach() {
  const role = useAuth((state) => state.role);
  const setSelectedAthlete = useAuth((state) => state.setSelectedAthlete);
  const [, navigate] = useLocation();
  const [routeState, setRouteState] = useState(() => parseCoachHashLocation(window.location.hash));
  const activeSection = routeState.section;
  const kpiPeriod: KpiLookbackPeriod = 7;
  const [selectedCoachAthlete, setSelectedCoachAthlete] = useState<CoachAthleteOption | null>(null);

  // Keep local route state aligned with browser hash changes and deep links.
  useEffect(() => {
    const syncFromHash = () => {
      // Ignore hashchanges that leave /coach — otherwise navigating to
      // /profile, /records-admin, /coach/swim-planning… would re-fire the
      // [routeState] effect below and replaceState back to "#/coach".
      if (!isCoachRouteHash(window.location.hash)) return;
      setRouteState(parseCoachHashLocation(window.location.hash));
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // Sync local route state → URL (replaceState to avoid extra history entries)
  useEffect(() => {
    if (!isCoachRouteHash(window.location.hash)) return;
    const target = buildCoachHash(routeState, window.location.hash);
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [routeState]);

  // Reset to home when nav icon is tapped while already on /coach
  useEffect(() => {
    const reset = () => {
      setRouteState({ section: "home" });
      setSelectedCoachAthlete(null);
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  // Switch section when bottom nav triggers a section change
  useEffect(() => {
    const onSection = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as CoachSection;
      setRouteState((current) => ({
        section,
        tab: section === "comms" ? current.tab : undefined,
        athleteId: section === "comms" ? current.athleteId : null,
      }));
      setSelectedCoachAthlete(null);
    };
    window.addEventListener("nav:section", onSection);
    return () => window.removeEventListener("nav:section", onSection);
  }, []);

  const coachAccess = role === "coach" || role === "admin";
  const shouldLoadCatalogs = activeSection === "home" || activeSection === "week";
  const shouldLoadAthletes =
    activeSection === "home" ||
    activeSection === "comms" ||
    activeSection === "swimmers" ||
    activeSection === "athlete" ||
    activeSection === "week" ||
    activeSection === "groups" ||
    activeSection === "chrono" ||
    activeSection === "my-swimmers" ||
    activeSection === "pace-calculator";
  const shouldLoadGroups =
    activeSection === "home" ||
    activeSection === "week" ||
    activeSection === "comms" ||
    activeSection === "groups";

  // Queries
  const { data: swimSessions } = useQuery({
    queryKey: ["swim_catalog"],
    queryFn: () => getSwimCatalog(),
    enabled: coachAccess && shouldLoadCatalogs,
  });
  const { data: strengthSessions } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => getStrengthSessions(),
    enabled: coachAccess && shouldLoadCatalogs,
  });
  const { data: athletes = [], isLoading: athletesLoading } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    enabled: coachAccess && shouldLoadAthletes,
  });

  // §265 — Toast "ça prend du temps…" si athletes (gate du coach hub) +
  // coach-kpis (waterfall finale §247) traînent >5 s. Capture le pire cas
  // Slow 3G + Supabase lent simultanés.
  const coachHomeLoading = athletesLoading;
  const { showSlowToast: showCoachSlowToast } = useDelayedLoading(coachHomeLoading);
  useEffect(() => {
    if (showCoachSlowToast) {
      toast("Ça prend du temps…", { description: "Le réseau semble lent. On continue d'essayer." });
    }
  }, [showCoachSlowToast, toast]);

  const { swimmerIds } = useMySwimmerIds();
  const myAthletes = useMemo(
    () => filterByAssignment(athletes, swimmerIds),
    [athletes, swimmerIds],
  );

  const isAdmin = role === "admin";

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["all-assignments"],
    queryFn: () => getAllAssignments(),
    enabled: isAdmin,
  });

  const { data: coachesList = [] } = useQuery<{ id: number; display_name: string }[]>({
    queryKey: ["coaches-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, display_name")
        .in("role", ["coach", "admin"]);
      return (data ?? []) as { id: number; display_name: string }[];
    },
    enabled: isAdmin,
  });

  const topAthletes = useMemo(() => myAthletes.slice(0, 5), [myAthletes]);
  const topAthleteKey = useMemo(
    () => topAthletes.map((athlete) => athlete.id ?? athlete.display_name).join("|"),
    [topAthletes],
  );
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
    enabled: coachAccess && shouldLoadGroups,
  });
  // §222 — Refacto C : 2N requêtes REST (sessions + strength) → 1 RPC.
  // Le RPC `get_coach_kpis` retourne les valeurs brutes de fatigue par
  // athlète sur la fenêtre demandée. La logique seuils + sort + filter
  // (FATIGUE_ALERT_MIN_SAMPLES, FATIGUE_ALERT_HIGH_THRESHOLD,
  // FATIGUE_ALERT_MAX_THRESHOLD) reste côté client via buildFatigueRating.
  const coachKpisQuery = useQuery({
    queryKey: ["coach-kpis", kpiPeriod, topAthleteKey],
    enabled: coachAccess && activeSection === "home" && topAthletes.length > 0,
    queryFn: async () => {
      const lookbackDays = kpiPeriod;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);
      const fromDate = getDateOnly(startDate);
      const toDate = getDateOnly(new Date());

      const athleteIds = topAthletes
        .map((a) => a.id)
        .filter((id): id is number => typeof id === "number");

      const fatigueByAthlete = await withTimeout(
        getCoachKpis(athleteIds, fromDate, toDate),
        8_000,
        "coach.kpis",
      );

      const fatigueAlerts = topAthletes
        .map((athlete) => {
          if (athlete.id == null) return null;
          const values = fatigueByAthlete.get(athlete.id) ?? [];
          const rating = buildFatigueRating(values);
          if (!rating) return null;
          if (rating.sampleCount < FATIGUE_ALERT_MIN_SAMPLES) return null;
          if (rating.average < FATIGUE_ALERT_HIGH_THRESHOLD) return null;
          return {
            athleteName: athlete.display_name,
            rating: rating.rating,
            average: rating.average,
            sampleCount: rating.sampleCount,
            level:
              rating.average >= FATIGUE_ALERT_MAX_THRESHOLD
                ? ("max" as const)
                : ("high" as const),
          };
        })
        .filter((alert): alert is NonNullable<typeof alert> => alert !== null)
        .sort((a, b) => {
          if (b.average !== a.average) return b.average - a.average;
          return b.sampleCount - a.sampleCount;
        });

      return { fatigueAlerts };
    },
  });

  const handleOpenAthlete = (athlete: CoachAthleteOption) => {
    setSelectedAthlete({ id: athlete.id ?? null, name: athlete.display_name });
    if (athlete.id == null) {
      navigate("/suivi/progression");
      return;
    }
    // Persist recent athletes for "Nageurs récents" section
    try {
      const recent: number[] = JSON.parse(localStorage.getItem(RECENT_ATHLETES_KEY) || "[]");
      const updated = [athlete.id, ...recent.filter((id) => id !== athlete.id)].slice(0, 3);
      localStorage.setItem(RECENT_ATHLETES_KEY, JSON.stringify(updated));
    } catch { /* ignore storage errors */ }
    setSelectedCoachAthlete(athlete);
    setRouteState({ section: "athlete" });
  };

  if (!coachAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-in fade-in motion-reduce:animate-none">
        <Card className="w-full max-w-sm shadow-xl border-t-4 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Accès Coach
            </CardTitle>
            <CardDescription>Cette section est réservée aux coachs et administrateurs.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Connectez-vous avec un compte autorisé pour accéder aux outils de gestion.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeSection === "home" ? (
        <CoachHome
          onNavigate={(section) => setRouteState({ section })}
          onOpenRecordsClub={() => navigate("/records-club")}
          onOpenRecordsAdmin={() => navigate("/records-admin")}
          onOpenSwimPlanning={() => navigate("/coach/swim-planning")}
          onOpenStrengthPlanning={() => navigate("/coach/strength-planning")}
          onOpenStrengthAssessment={() => navigate("/coach/strength-assessment")}
          onOpenMyStrength={() => navigate("/strength")}
          onOpenMyRecords={() => navigate("/records?tab=1rm")}
          onOpenAthlete={handleOpenAthlete}
          onOpenWeekAt={(weekDate) => setRouteState({ section: "week", weekDate })}
          athletes={myAthletes}
          athletesLoading={athletesLoading}
          kpiLoading={coachKpisQuery.isLoading}
          fatigueAlerts={coachKpisQuery.data?.fatigueAlerts ?? []}
          groups={groups}
        />
      ) : null}

      {activeSection === "week" ? (
        <Suspense fallback={<CalendarSkeleton />}>
          <CoachWeekView
            groups={groups}
            initialWeekDate={routeState.weekDate}
          />
        </Suspense>
      ) : null}

      {activeSection === "library" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachLibrary />
        </Suspense>
      ) : null}

      {activeSection === "swimmers" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachSwimmersOverview
            athletes={myAthletes}
            athletesLoading={athletesLoading}
            onOpenAthlete={handleOpenAthlete}
            isAdmin={isAdmin}
            coachesList={coachesList}
            allAssignments={allAssignments}
          />
        </Suspense>
      ) : null}

      {activeSection === "athlete" ? (
        <Suspense fallback={<HomeSkeleton />}>
          <CoachSwimmerDetail
            athleteId={selectedCoachAthlete?.id ?? null}
            athleteName={selectedCoachAthlete?.display_name ?? null}
            onBack={() => setRouteState({ section: "swimmers" })}
          />
        </Suspense>
      ) : null}

      {activeSection === "groups" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachGroupsScreen
            onBack={() => setRouteState({ section: "home" })}
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        </Suspense>
      ) : null}

      {activeSection === "competitions" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachCompetitionsScreen
            onBack={() => setRouteState({ section: "home" })}
          />
        </Suspense>
      ) : null}

      {activeSection === "comms" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachComms
            athletes={myAthletes}
            groups={groups}
            athletesLoading={athletesLoading}
            initialTab={routeState.tab}
            initialAthleteId={routeState.athleteId}
          />
        </Suspense>
      ) : null}

      {activeSection === "chrono" ? (
        <Suspense fallback={<CalendarSkeleton />}>
          <CoachChronoScreen athletes={myAthletes} allAthletes={athletes} />
        </Suspense>
      ) : null}

      {activeSection === "chrono-history" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachChronoHistoryScreen
            onBack={() => setRouteState({ section: "home" })}
          />
        </Suspense>
      ) : null}

      {activeSection === "my-swimmers" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachMySwimmersScreen
            athletes={athletes}
            athletesLoading={athletesLoading}
            onBack={() => setRouteState({ section: "home" })}
          />
        </Suspense>
      ) : null}

      {activeSection === "comments" ? (
        <Suspense fallback={<ListSkeleton />}>
          <CoachCommentsScreen
            onBack={() => setRouteState({ section: "home" })}
            onOpenAthlete={handleOpenAthlete}
          />
        </Suspense>
      ) : null}

      {activeSection === "pace-calculator" ? (
        <Suspense fallback={<HomeSkeleton />}>
          <CoachPaceCalculatorScreen
            athletes={athletes}
            allAthletes={athletes}
            onBack={() => setRouteState({ section: "home" })}
          />
        </Suspense>
      ) : null}

    </div>
  );
}

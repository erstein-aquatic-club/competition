import React, { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { computeTrainingDaysRemaining } from "@/lib/date";
import { useQuery } from "@tanstack/react-query";
import {
  getSessions,
  getAssignments,
  getCompetitions,
  getMyCompetitionIds,
  getMyPlannedAbsences,
  getSwimmerSlots,
  withTimeout,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DashboardCalendar } from "@/components/dashboard/DashboardCalendar";
import { DashboardFeedbackContainer } from "@/components/dashboard/DashboardFeedbackContainer";
import { InlineBanner } from "@/components/shared/InlineBanner";
import {
  Settings2,
  Waves,
  Minus,
  Plus,
  AlertCircle,
  Trophy,
  FileText,
  ChevronRight,
  Sun,
  Moon,
  Clock,
} from "lucide-react";
import { ChallengeProgressBar } from "@/components/shared/ChallengeProgressBar";
import { getActiveChallenges } from "@/lib/api/challenges";
import { fetchUserGroupIds } from "@/lib/api/client";
import { useStrengthPlanByISO } from "@/hooks/useStrengthPlanByISO";

/**
 * Dashboard (swim) — UI based on maquette_accueil_calendrier_nageur_vite_react.jsx
 * - Refactored into modular components for maintainability
 * - Backend logic unchanged: Sessions (ressentis + distance) saved via syncSession / updateSession
 * - Coach assignments fetched via getAssignments
 * - 2 placeholders per day (Matin/Soir), tagged as "vides" if no assignment exists
 * - Presence/absence toggles stored client-side (localStorage)
 */

const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WEEKDAYS_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

const SLOTS = [
  { key: "AM" as const, label: "Matin" },
  { key: "PM" as const, label: "Soir" },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Shared inner content for the Dashboard page header (mobile fixed + desktop inline). */
function DashboardHeaderContent({
  globalKm,
  onSettings,
  onRecords,
}: {
  globalKm: string;
  onSettings: () => void;
  onRecords: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary text-primary-foreground">
          <Waves className="h-3.5 w-3.5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Accueil</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-xs font-mono font-semibold text-muted-foreground tabular-nums">{globalKm} km</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRecords}
          className="min-h-11 md:min-h-9 rounded-xl border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
          aria-label="Mes records"
        >
          <Trophy className="mr-1 h-3.5 w-3.5" />
          Records
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSettings}
          className="min-h-11 md:min-h-9 rounded-xl border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
          aria-label="Présence hebdo"
        >
          <Settings2 className="mr-1 h-3.5 w-3.5" />
          Hebdo
        </Button>
      </div>
    </>
  );
}

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);

  const [, navigate] = useLocation();

  // Get Supabase auth UUID for swim exercise logs.
  // We re-read on `onAuthStateChange` (not just `[user]`) because the
  // display name can stay identical across a TOKEN_REFRESHED while the
  // underlying session.user.id is technically the same — but more
  // importantly because a SIGNED_OUT/SIGNED_IN cycle (cross-tab logout,
  // password reset) keeps the same display name briefly while the UUID
  // rotates. The previous `[user]` dependency missed those cycles.
  const [authUuid, setAuthUuid] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthUuid(data.session?.user?.id ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!cancelled) setAuthUuid(session?.user?.id ?? null);
      },
    );
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // §260 — withTimeout 8s sur les 2 queryFn qui bloquent le 1er paint Dashboard.
  // Combiné au retry exponentiel §244 (`isTransientError` reconnaît "timeout"),
  // garantit max 27s end-to-end vs blocking ad infinitum sur EDGE/captive portal.
  const { data: sessions, isLoading: sessionsLoading, error: sessionsError, refetch: refetchSessions } = useQuery({
    queryKey: ["sessions", userId ?? user],
    queryFn: () => withTimeout(getSessions(user!, userId), 8_000, "dashboard.sessions"),
    enabled: !!user,
  });

  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["assignments", userId ?? user],
    queryFn: () => withTimeout(getAssignments(user!, userId), 8_000, "dashboard.assignments"),
    enabled: !!user,
  });

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: myCompetitionIds } = useQuery({
    queryKey: ["my-competition-ids"],
    queryFn: () => getMyCompetitionIds(),
  });

  const visibleCompetitions = useMemo(() => {
    // If no assignments exist at all, show all competitions (backward compat)
    if (!myCompetitionIds || myCompetitionIds.length === 0) return competitions;
    return competitions.filter((c) => myCompetitionIds.includes(c.id));
  }, [competitions, myCompetitionIds]);

  const { data: myAbsences = [] } = useQuery({
    queryKey: ["my-planned-absences"],
    queryFn: () => getMyPlannedAbsences(),
  });

  const absenceDates = useMemo(() => {
    return new Set(myAbsences.map((a) => a.date));
  }, [myAbsences]);

  // ── Active challenges ──────────────────────────────────────
  const { data: userGroupIds } = useQuery({
    queryKey: ["user-group-ids", userId],
    queryFn: () => fetchUserGroupIds(userId),
    enabled: !!userId,
  });

  // ── Strength plan → calendar feed ───────────────────────────
  // The plan (strength_planning_slots + per-athlete overrides) is the
  // single source of truth for muscu sessions. Without this, the calendar
  // showed "Repos" for days where the swimmer actually had a strength
  // session scheduled — they discovered it only by tapping into Strength.
  const { strengthByISO, resolvedByISO: strengthResolvedByISO } =
    useStrengthPlanByISO(userId, userGroupIds?.[0] ?? null);

  const { data: activeChallenges = [] } = useQuery({
    queryKey: ["active-challenges", userGroupIds],
    queryFn: () => getActiveChallenges(userGroupIds?.[0] ?? null),
    enabled: userGroupIds !== undefined,
  });

  const isLoading = sessionsLoading || assignmentsLoading;
  const error = sessionsError || assignmentsError;

  // §265 — Toast "ça prend du temps…" si le chargement initial dépasse 5 s.
  // Combiné au retry exponentiel §244 et au timeout 8s §256, donne un signal
  // UX au lieu d'un skeleton silencieux sur réseau lent.
  const { toast } = useToast();
  const { showSlowToast } = useDelayedLoading(isLoading);
  useEffect(() => {
    if (showSlowToast) {
      toast({
        title: "Ça prend du temps…",
        description: "Le réseau semble lent. On continue d'essayer.",
      });
    }
  }, [showSlowToast, toast]);

  const refetch = () => {
    refetchSessions();
    refetchAssignments();
  };

  const { data: swimmerSlots } = useQuery({
    queryKey: ['swimmer-slots', userId],
    queryFn: () => getSwimmerSlots(userId!),
    enabled: !!userId,
  });

  const state = useDashboardState({ sessions, assignments, userId, user, swimmerSlots });

  const {
    today,
    monthCursor,
    selectedISO,
    drawerOpen,
    settingsOpen,
    activeSessionId,
    detailsOpen,
    selectedDayIndex,
    isPending,
    presenceDefaults,
    stableDurationMin,
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
    setMonthCursor,
    setSelectedISO,
    setDrawerOpen,
    setSettingsOpen,
    setActiveSessionId,
    setDetailsOpen,
    setSelectedDayIndex,
    setPresenceDefaults,
    setAttendanceOverrideBySessionId,
    setStableDurationMin,
    setAutoCloseArmed,
    getSessionStatus,
  } = state;

  // Competition dates for calendar markers + date→competitionId lookup
  const { competitionDates, competitionByDate } = useMemo(() => {
    const dates = new Set<string>();
    const byDate = new Map<string, string>();
    for (const c of visibleCompetitions) {
      if (!c.date) continue;
      const start = c.date.slice(0, 10);
      const end = c.end_date ? c.end_date.slice(0, 10) : start;
      // Add all dates from start to end (inclusive)
      let current = start;
      while (current <= end) {
        dates.add(current);
        if (!byDate.has(current)) byDate.set(current, c.id);
        // Increment date by 1 day
        const d = new Date(current + "T00:00:00");
        d.setDate(d.getDate() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        current = `${y}-${m}-${day}`;
      }
    }
    return { competitionDates: dates, competitionByDate: byDate };
  }, [visibleCompetitions]);

  // Next upcoming competition
  const nextCompetition = useMemo(() => {
    const todayISO = toISODate(new Date());
    const upcoming = visibleCompetitions
      .filter((c) => c.date && c.date.slice(0, 10) >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [visibleCompetitions]);

  const daysUntilNextCompetition = useMemo(() => {
    if (!nextCompetition) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(nextCompetition.date.slice(0, 10) + "T00:00:00");
    const diff = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [nextCompetition]);

  const trainingDaysRemaining = useMemo(() => {
    if (!nextCompetition) return null;
    return computeTrainingDaysRemaining({
      compDate: nextCompetition.date.slice(0, 10),
      assignments,
      absenceDates,
      presenceDefaults,
    });
  }, [nextCompetition, assignments, absenceDates, presenceDefaults]);

  const openDay = useCallback(
    (iso: string) => {
      // If this is a competition day, navigate to competition detail
      const compId = competitionByDate.get(iso);
      if (compId) {
        navigate(`/competition/${compId}`);
        return;
      }

      setSelectedISO(iso);
      setDrawerOpen(true);
      setActiveSessionId(null);
      setDetailsOpen(false);

      const st = completionByISO[iso] || { completed: 0, total: 2, slots: [{ slotKey: "AM" as const, expected: true, completed: false, absent: false }, { slotKey: "PM" as const, expected: true, completed: false, absent: false }] };
      setAutoCloseArmed(st.total > 0 && st.completed < st.total);
    },
    [competitionByDate, navigate, completionByISO, setSelectedISO, setDrawerOpen, setActiveSessionId, setDetailsOpen, setAutoCloseArmed]
  );

  const closeDay = useCallback(() => {
    setDrawerOpen(false);
    setActiveSessionId(null);
    setDetailsOpen(false);
    setAutoCloseArmed(false);
    setSelectedDayIndex(null);
  }, [setDrawerOpen, setActiveSessionId, setDetailsOpen, setAutoCloseArmed, setSelectedDayIndex]);

  const prevMonth = useCallback(() => {
    setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, [setMonthCursor]);

  const nextMonth = useCallback(() => {
    setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, [setMonthCursor]);

  const jumpToday = useCallback(() => {
    const t = new Date();
    setMonthCursor(startOfMonth(t));
    openDay(toISODate(t));
  }, [openDay, setMonthCursor]);

  // Auto-open today's drawer when navigated from SwimmerHome with ?open=today
  const autoOpenDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (autoOpenDoneRef.current) return;
    if (!window.location.hash.includes("open=today")) return;
    autoOpenDoneRef.current = true;
    const cleanHash = window.location.hash.replace(/[?&]open=today/, "") || "#/natation";
    window.history.replaceState(null, "", window.location.pathname + cleanHash);
    const t = new Date();
    setMonthCursor(startOfMonth(t));
    openDay(toISODate(t));
  }, [openDay, setMonthCursor]);

  const openSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setDetailsOpen(false);
  }, [setActiveSessionId, setDetailsOpen]);

  // §216 — handler stable + slices mémoisées pour préserver le React.memo
  // de DashboardFeedbackContainer. Sans ça, l'inline arrow + les deux
  // .find()/.get() inline créent de nouvelles refs à chaque render parent
  // et le memo du container ne sert à rien (l'audit de quality review l'a
  // attrapé : "Inline arrows defeat React.memo on DashboardFeedbackContainer").
  const onOpenStrengthSession = useCallback((slotId: string) => {
    try {
      sessionStorage.setItem(
        "eac_pending_strength_focus_slot_id",
        String(slotId),
      );
    } catch {
      /* private mode / quota → fall back to plain navigation */
    }
    navigate("/strength");
  }, [navigate]);

  const absenceReason = useMemo(
    () => myAbsences.find((a) => a.date === selectedISO)?.reason ?? null,
    [myAbsences, selectedISO],
  );

  const strengthSessionsForSelectedDay = useMemo(
    () => strengthResolvedByISO.get(selectedISO) ?? [],
    [strengthResolvedByISO, selectedISO],
  );

  const isAbsent = useMemo(
    () => absenceDates.has(selectedISO),
    [absenceDates, selectedISO],
  );

  const toggleDefaultPresence = useCallback((weekdayIdx: number, slotKey: SlotKey) => {
    setPresenceDefaults((prev) => ({
      ...prev,
      [weekdayIdx]: { ...prev[weekdayIdx], [slotKey]: !prev[weekdayIdx][slotKey] },
    }));
  }, [setPresenceDefaults]);

  // Keyboard navigation for drawer
  useEffect(() => {
    if (!drawerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "Escape") {
        e.preventDefault();
        closeDay();
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (sessionsForSelectedDay.length > 0 && !activeSessionId) {
          openSession(sessionsForSelectedDay[0].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDay, sessionsForSelectedDay, activeSessionId, openSession]);

  // Keyboard navigation for calendar
  const handleCalendarKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      const navKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "];
      if (!navKeys.includes(e.key)) return;

      e.preventDefault();

      if (e.key === "Enter" || e.key === " ") {
        const iso = toISODate(gridDates[currentIndex]);
        openDay(iso);
        return;
      }

      let nextIndex = currentIndex;
      if (e.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
      if (e.key === "ArrowRight") nextIndex = Math.min(gridDates.length - 1, currentIndex + 1);
      if (e.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 7);
      if (e.key === "ArrowDown") nextIndex = Math.min(gridDates.length - 1, currentIndex + 7);

      setSelectedDayIndex(nextIndex);
      setSelectedISO(toISODate(gridDates[nextIndex]));

      setTimeout(() => {
        const cells = document.querySelectorAll('[data-calendar-cell="true"]');
        if (cells[nextIndex]) {
          (cells[nextIndex] as HTMLElement).focus();
        }
      }, 0);
    },
    [gridDates, openDay, setSelectedDayIndex, setSelectedISO]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="sm:hidden fixed top-0 left-0 right-0 z-overlay border-b border-primary/15 bg-background/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/20 animate-pulse" />
              <div className="flex flex-col gap-1">
                <div className="h-4 w-12 rounded bg-muted animate-pulse" />
                <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-primary/5 animate-pulse" />
              <div className="h-9 w-9 rounded-xl bg-primary/5 animate-pulse" />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-14 pb-5 sm:py-8">
          <div className="mt-4 rounded-3xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border">
              <div className="flex items-center gap-1">
                <div className="h-9 w-9 rounded-2xl bg-muted animate-pulse" />
                <div className="h-9 w-9 rounded-2xl bg-muted animate-pulse" />
              </div>
              <div className="h-6 w-32 rounded bg-muted animate-pulse" />
              <div className="h-9 w-9 rounded-2xl bg-muted animate-pulse" />
            </div>
            <div className="p-3 sm:p-5">
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={`wh-${i}`} className="px-0.5 pb-1 flex justify-center">
                    <div className="h-3 w-4 rounded bg-muted animate-pulse" />
                  </div>
                ))}
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={`cs-${i}`} className="aspect-square rounded-2xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Mobile: fixed top header */}
      <div className="sm:hidden fixed top-0 left-0 right-0 z-overlay border-b border-primary/15 bg-background/90 backdrop-blur-md">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <DashboardHeaderContent
            globalKm={globalKm}
            onSettings={() => setSettingsOpen(true)}
            onRecords={() => navigate("/records")}
          />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-14 pb-5 sm:py-8">
        {/* Desktop: inline header in content flow */}
        <div className="hidden sm:flex items-center justify-between">
          <DashboardHeaderContent
            globalKm={globalKm}
            onSettings={() => setSettingsOpen(true)}
            onRecords={() => navigate("/records")}
          />
        </div>

        {/* Next competition banner */}
        <InlineBanner
          variant="warning"
          icon={<Trophy />}
          label={nextCompetition?.name}
          badge={daysUntilNextCompetition === 0 ? "Aujourd'hui" : `J-${daysUntilNextCompetition}`}
          sublabel={nextCompetition?.location}
          subbadge={
            trainingDaysRemaining != null && trainingDaysRemaining > 0
              ? `${trainingDaysRemaining} séance${trainingDaysRemaining > 1 ? "s" : ""}`
              : undefined
          }
          visible={!!nextCompetition && daysUntilNextCompetition != null}
          onClick={nextCompetition ? () => navigate(`/competition/${nextCompetition.id}`) : undefined}
          className="mt-2"
        />

        {/* Active challenges */}
        {activeChallenges.length > 0 && (
          <div className="mt-2 space-y-2">
            {activeChallenges.map((ch) => (
              <ChallengeProgressBar key={ch.id} challenge={ch} />
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3 mt-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Erreur de chargement</p>
              <p className="text-xs text-muted-foreground mt-0.5">Impossible de récupérer vos données. Vérifiez votre connexion.</p>
            </div>
            <Button size="sm" variant="outline" onClick={refetch}>Réessayer</Button>
          </div>
        )}

        {/* Calendar */}
        <DashboardCalendar
          monthCursor={monthCursor}
          selectedDayStatus={selectedDayStatus}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onJumpToday={jumpToday}
          gridDates={gridDates}
          completionByISO={completionByISO}
          strengthByISO={strengthByISO}
          competitionDates={competitionDates}
          absenceDates={absenceDates}
          selectedISO={selectedISO}
          selectedDayIndex={selectedDayIndex}
          today={today}
          onDayClick={openDay}
          onKeyDown={handleCalendarKeyDown}
        />

        {/* Link to swim notes page */}
        {authUuid && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate("/swim-notes")}
              className="flex w-full items-center justify-between rounded-2xl border border-dashed border-border/80 bg-background px-3 py-2.5 text-left transition hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    Notes techniques
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    Repères détaillés par exercice
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Settings Dialog — compact weekly grid */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-[calc(100vw-32px)] sm:max-w-[360px] rounded-2xl p-5">
            <DialogHeader className="pb-1">
              <DialogTitle className="text-base font-bold tracking-tight">Ma semaine type</DialogTitle>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Coche les créneaux où tu t'entraînes habituellement.
              </p>
            </DialogHeader>

            {/* Weekly grid matrix */}
            <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-[auto_repeat(7,1fr)] border-b border-border/60">
                <div className="w-16" />
                {WEEKDAYS_SHORT.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Slot rows */}
              {SLOTS.map((slot, slotIdx) => (
                <div
                  key={slot.key}
                  className={cn(
                    "grid grid-cols-[auto_repeat(7,1fr)]",
                    slotIdx < SLOTS.length - 1 && "border-b border-border/40",
                  )}
                >
                  {/* Row label */}
                  <div className="flex w-16 items-center gap-1.5 pl-3 py-3">
                    {slot.key === "AM" ? (
                      <Sun className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <Moon className="h-3.5 w-3.5 text-indigo-400" />
                    )}
                    <span className="text-[11px] font-semibold text-foreground">{slot.label}</span>
                  </div>

                  {/* Toggle cells */}
                  {WEEKDAYS_SHORT.map((_, dayIdx) => {
                    const on = Boolean(presenceDefaults?.[dayIdx]?.[slot.key]);
                    return (
                      <div key={dayIdx} className="flex items-center justify-center py-3">
                        <button
                          type="button"
                          onClick={() => toggleDefaultPresence(dayIdx, slot.key)}
                          aria-label={`${WEEKDAYS_FR[dayIdx]} ${slot.label}`}
                          aria-pressed={on}
                          className={cn(
                            "h-9 w-9 rounded-full border-2 transition-all duration-150 active:scale-90",
                            on
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background text-transparent hover:border-primary/40",
                          )}
                        >
                          {on && (
                            <svg viewBox="0 0 16 16" className="h-4 w-4 mx-auto" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3.5 8.5L6.5 11.5L12.5 5" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Summary */}
            {(() => {
              const total = WEEKDAYS_FR.reduce(
                (sum, _, idx) => sum + SLOTS.filter((s) => Boolean(presenceDefaults?.[idx]?.[s.key])).length,
                0,
              );
              return (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                  <span className="font-bold text-foreground tabular-nums">{total}</span>
                  <span>créneau{total !== 1 ? "x" : ""} / semaine</span>
                </div>
              );
            })()}

            {/* Duration stepper */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-3 py-2.5 mt-1">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Durée par défaut</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition active:scale-95"
                  onClick={() => setStableDurationMin((v) => Math.max(30, v - 15))}
                  aria-label="Diminuer la durée"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-12 text-center text-xs font-bold tabular-nums text-foreground">
                  {stableDurationMin} min
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition active:scale-95"
                  onClick={() => setStableDurationMin((v) => Math.min(240, v + 15))}
                  aria-label="Augmenter la durée"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Feedback Drawer */}
        <DashboardFeedbackContainer
          drawerOpen={drawerOpen}
          activeSessionId={activeSessionId}
          detailsOpen={detailsOpen}
          setActiveSessionId={setActiveSessionId}
          setDetailsOpen={setDetailsOpen}
          setDrawerOpen={setDrawerOpen}
          onCloseDay={closeDay}
          onOpenSession={openSession}
          selectedDate={selectedDate}
          selectedISO={selectedISO}
          sessionsForSelectedDay={sessionsForSelectedDay}
          otherGroupSessions={otherGroupSessions}
          assignments={assignments}
          selectedDayStatus={selectedDayStatus}
          dayKm={dayKm}
          isPending={isPending}
          logsBySessionId={logsBySessionId}
          getLogForSession={getLogForSession}
          getSessionStatus={getSessionStatus}
          isAbsent={isAbsent}
          absenceReason={absenceReason}
          strengthSessionsForSelectedDay={strengthSessionsForSelectedDay}
          onOpenStrengthSession={onOpenStrengthSession}
          user={user}
          userId={userId}
          setAttendanceOverrideBySessionId={setAttendanceOverrideBySessionId}
          stableDurationMin={stableDurationMin}
        />

      </div>
    </div>
  );
}

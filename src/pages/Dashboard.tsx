import React, { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { computeTrainingDaysRemaining } from "@/lib/date";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Session, Competition, PlannedAbsence } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useDashboardState } from "@/hooks/useDashboardState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarHeader } from "@/components/dashboard/CalendarHeader";
import { CalendarGrid } from "@/components/dashboard/CalendarGrid";
import { FeedbackDrawer } from "@/components/dashboard/FeedbackDrawer";
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
  X,
  Sun,
  Moon,
  Clock,
} from "lucide-react";
import { WellnessBanner } from "@/components/wellness/WellnessBanner";
import { WellnessForm } from "@/components/wellness/WellnessForm";
import { ChallengeProgressBar } from "@/components/shared/ChallengeProgressBar";
import { getActiveChallenges } from "@/lib/api/challenges";
import { fetchUserGroupIds } from "@/lib/api/client";
import type { SaveState } from "@/components/shared/BottomActionBar";

/**
 * Dashboard (swim) — UI based on maquette_accueil_calendrier_nageur_vite_react.jsx
 * - Refactored into modular components for maintainability
 * - Backend logic unchanged: Sessions (ressentis + distance) saved via api.syncSession / api.updateSession
 * - Coach assignments fetched via api.getAssignments
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
type IndicatorKey = "difficulty" | "fatigue_end" | "performance" | "engagement";

const INDICATORS = [
  { key: "difficulty" as const, label: "Difficulté", mode: "hard" as const },
  { key: "fatigue_end" as const, label: "Fatigue fin", mode: "hard" as const },
  { key: "performance" as const, label: "Perf perçue", mode: "good" as const },
  { key: "engagement" as const, label: "Engagement", mode: "good" as const },
];

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

function parseSessionId(sessionId: string) {
  const parts = String(sessionId).split("__");
  const rawSlot = parts[1] || "";
  // If it's a UUID (swimmer slot ID), determine AM/PM from the session context
  // For now, return the raw value — callers that need a SlotKey should use the session's slotKey instead
  const slotKey = (rawSlot === "AM" || rawSlot === "PM") ? rawSlot : "";
  return { iso: parts[0], slotKey: slotKey as SlotKey | "", swimmerSlotId: rawSlot.length > 2 ? rawSlot : undefined };
}

function clampToStep(value: number, step: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
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
        <h1 className="text-lg font-display font-bold uppercase italic tracking-tight text-primary">Accueil</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-xs font-mono font-semibold text-muted-foreground tabular-nums">{globalKm} km</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRecords}
          className="h-8 rounded-xl border-primary/20 bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
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
          className="h-8 rounded-xl border-primary/20 bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
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
  const { toast } = useToast();
  const queryClient = useQueryClient();


  const [, navigate] = useLocation();
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [wellnessOpen, setWellnessOpen] = React.useState(false);
  // Override when swimmer picks an alternative session for a slot
  const [alternativeOverride, setAlternativeOverride] = React.useState<{
    sessionId: string;
    assignmentId: number;
    title: string;
    km: number | null;
  } | null>(null);

  // Auto-open wellness drawer from push notification deep link (?wellness=open)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('wellness') === 'open') {
      setWellnessOpen(true);
      // Clean up URL param
      const hashBase = window.location.hash.split('?')[0];
      window.history.replaceState(null, '', window.location.pathname + hashBase);
    }
  }, []);

  // Get Supabase auth UUID for swim exercise logs
  const [authUuid, setAuthUuid] = React.useState<string | null>(null);
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthUuid(data.session?.user?.id ?? null);
    });
  }, [user]);

  const { data: sessions, isLoading: sessionsLoading, error: sessionsError, refetch: refetchSessions } = useQuery({
    queryKey: ["sessions", userId ?? user],
    queryFn: () => api.getSessions(user!, userId),
    enabled: !!user,
  });

  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["assignments", user],
    queryFn: () => api.getAssignments(user!, userId),
    enabled: !!user,
  });

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const { data: myCompetitionIds } = useQuery({
    queryKey: ["my-competition-ids"],
    queryFn: () => api.getMyCompetitionIds(),
  });

  const visibleCompetitions = useMemo(() => {
    // If no assignments exist at all, show all competitions (backward compat)
    if (!myCompetitionIds || myCompetitionIds.length === 0) return competitions;
    return competitions.filter((c) => myCompetitionIds.includes(c.id));
  }, [competitions, myCompetitionIds]);

  const { data: myAbsences = [] } = useQuery({
    queryKey: ["my-planned-absences"],
    queryFn: () => api.getMyPlannedAbsences(),
  });

  const absenceDates = useMemo(() => {
    return new Set(myAbsences.map((a) => a.date));
  }, [myAbsences]);

  // ── Active challenges ──────────────────────────────────────
  const { data: userGroupIds } = useQuery({
    queryKey: ["user-group-ids", userId],
    queryFn: () => fetchUserGroupIds(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeChallenges = [] } = useQuery({
    queryKey: ["active-challenges", userGroupIds],
    queryFn: () => getActiveChallenges(userGroupIds?.[0] ?? null),
    enabled: userGroupIds !== undefined,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = sessionsLoading || assignmentsLoading;
  const error = sessionsError || assignmentsError;
  const refetch = () => {
    refetchSessions();
    refetchAssignments();
  };

  const deleteMutation = useMutation({
    mutationFn: (sessionId: number) => api.deleteSession(sessionId),
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      toast({ title: "Séance supprimée", description: "La saisie a été supprimée." });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de supprimer la séance.", variant: "destructive" });
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: Omit<Session, "id" | "created_at"> & { _exerciseLogs?: import("@/lib/api").SwimExerciseLogInput[] }) => {
      const { _exerciseLogs, ...sessionData } = data;
      const result = await api.syncSession({ ...sessionData, athlete_name: user!, athlete_id: userId ?? undefined });
      // Save exercise logs if any
      if (_exerciseLogs && _exerciseLogs.length > 0 && result.sessionId) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          const authUid = authData.session?.user?.id;
          if (authUid) {
            await api.saveSwimExerciseLogs(result.sessionId, authUid, _exerciseLogs);
          }
        } catch (e) {
          console.warn("[EAC] Failed to save exercise logs:", e);
        }
      }
      return result;
    },
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      toast({ title: "Séance enregistrée", description: "Vos données ont été synchronisées." });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      setTimeout(() => {
        setDrawerOpen(false);
        setActiveSessionId(null);
        setDetailsOpen(false);
      }, 1200);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'enregistrer la séance.", variant: "destructive" });
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Session & { _exerciseLogs?: import("@/lib/api").SwimExerciseLogInput[] }) => {
      const { _exerciseLogs, ...sessionData } = data;
      const result = await api.updateSession(sessionData);
      // Save exercise logs if any
      if (_exerciseLogs && sessionData.id) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          const authUid = authData.session?.user?.id;
          if (authUid) {
            await api.saveSwimExerciseLogs(sessionData.id, authUid, _exerciseLogs);
          }
        } catch (e) {
          console.error("[EAC] Failed to save exercise logs:", e);
          throw e; // Re-throw to show error to user
        }
      }
      return result;
    },
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      toast({ title: "Séance mise à jour", description: "Votre saisie a été mise à jour." });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      setTimeout(() => {
        setDrawerOpen(false);
        setActiveSessionId(null);
        setDetailsOpen(false);
      }, 1200);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour la séance.", variant: "destructive" });
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const absenceMutation = useMutation({
    mutationFn: ({ date, reason }: { date: string; reason?: string }) =>
      api.setPlannedAbsence(date, reason),
    onMutate: async ({ date, reason }) => {
      await queryClient.cancelQueries({ queryKey: ["my-planned-absences"] });
      const previous = queryClient.getQueryData<PlannedAbsence[]>(["my-planned-absences"]);
      queryClient.setQueryData<PlannedAbsence[]>(["my-planned-absences"], (old) => [
        ...(old ?? []),
        { date, reason: reason ?? null } as PlannedAbsence,
      ]);
      return { previous };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-planned-absences"] });
      toast({ title: "Jour marqué indisponible" });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["my-planned-absences"], context.previous);
      toast({ title: "Erreur", description: "Impossible de marquer ce jour indisponible.", variant: "destructive" });
    },
  });

  const removeAbsenceMutation = useMutation({
    mutationFn: (date: string) => api.removePlannedAbsence(date),
    onMutate: async (date) => {
      await queryClient.cancelQueries({ queryKey: ["my-planned-absences"] });
      const previous = queryClient.getQueryData<PlannedAbsence[]>(["my-planned-absences"]);
      queryClient.setQueryData<PlannedAbsence[]>(["my-planned-absences"], (old) =>
        (old ?? []).filter((a) => a.date !== date),
      );
      return { previous };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-planned-absences"] });
      toast({ title: "Disponibilité restaurée" });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["my-planned-absences"], context.previous);
      toast({ title: "Erreur", description: "Impossible de restaurer la disponibilité.", variant: "destructive" });
    },
  });

  const { data: swimmerSlots } = useQuery({
    queryKey: ['swimmer-slots', userId],
    queryFn: () => api.getSwimmerSlots(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
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
    attendanceOverrideBySessionId,
    stableDurationMin,
    draftState,
    gridDates,
    completionByISO,
    selectedDate,
    sessionsForSelectedDay,
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
    setDraftState,
    setAutoCloseArmed,
    startTransition,
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
    setAlternativeOverride(null);
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

  const openSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setDetailsOpen(false);
  }, [setActiveSessionId, setDetailsOpen]);

  const markAbsent = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setAttendanceOverrideBySessionId((prev) => ({ ...prev, [sessionId]: "absent" }));
      });

      const existing = getLogForSession(sessionId);
      if (existing?.id) deleteMutation.mutate(Number(existing.id));
    },
    [deleteMutation, getLogForSession, startTransition, setAttendanceOverrideBySessionId]
  );

  const markPresent = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setAttendanceOverrideBySessionId((prev) => ({ ...prev, [sessionId]: "present" }));
      });
    },
    [startTransition, setAttendanceOverrideBySessionId]
  );

  const clearOverride = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setAttendanceOverrideBySessionId((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      });
    },
    [startTransition, setAttendanceOverrideBySessionId]
  );

  const dayOffAll = useCallback(() => {
    const idsToOff = sessionsForSelectedDay
      .map((s) => (getSessionStatus(s, selectedDate).expected ? s.id : null))
      .filter(Boolean) as string[];

    if (idsToOff.length === 0) return;

    startTransition(() => {
      setAttendanceOverrideBySessionId((prev) => {
        const next = { ...prev };
        for (const id of idsToOff) next[id] = "absent";
        return next;
      });

      setActiveSessionId(null);
      setDetailsOpen(false);
    });

    idsToOff.forEach((sid) => {
      const existing = getLogForSession(sid);
      if (existing?.id) deleteMutation.mutate(Number(existing.id));
    });
  }, [sessionsForSelectedDay, getSessionStatus, selectedDate, startTransition, getLogForSession, deleteMutation, setAttendanceOverrideBySessionId, setActiveSessionId, setDetailsOpen]);

  const saveFeedback = useCallback(() => {
    if (!activeSessionId) return;
    if (!user) return;

    const allFilled = INDICATORS.every((i) => Number.isInteger(draftState[i.key]));
    if (!allFilled) return;

    const { iso, slotKey: parsedSlotKey } = parseSessionId(activeSessionId);
    // For new swimmer-slot IDs, look up the active session to get the actual slotKey (AM/PM)
    const activeSession = sessionsForSelectedDay.find((s) => s.id === activeSessionId);
    const effectiveSlotKey = parsedSlotKey || activeSession?.slotKey || "AM";
    const slotLabel = effectiveSlotKey === "PM" ? "Soir" : "Matin";

    const distance = clampToStep(Number(draftState.distanceMeters ?? 0), 100);
    const duration = clampToStep(Number(stableDurationMin), 15);

    const strokeDistances: Record<string, number> = {};
    for (const [key, val] of Object.entries(draftState.strokes)) {
      const n = Number(val);
      if (n > 0) strokeDistances[key] = n;
    }

    const payload = {
      date: iso,
      slot: slotLabel,
      distance,
      duration,
      effort: Number(draftState.difficulty),
      feeling: Number(draftState.fatigue_end),
      performance: Number(draftState.performance),
      engagement: Number(draftState.engagement),
      comments: String(draftState.comment || "").slice(0, 400),
      athlete_name: user!,
      athlete_id: userId ?? undefined,
      stroke_distances: Object.keys(strokeDistances).length > 0 ? strokeDistances : null,
      assignment_id: alternativeOverride?.sessionId === activeSessionId
        ? alternativeOverride.assignmentId
        : activeSession?.assignmentId ?? null,
    };

    const existing = getLogForSession(activeSessionId);

    // For updates, preserve the original assignment_id from the saved log
    // (unless swimmer explicitly picked an alternative)
    if (existing?.id && existing.assignment_id != null && !alternativeOverride) {
      payload.assignment_id = existing.assignment_id;
    }

    startTransition(() => {
      setAttendanceOverrideBySessionId((prev) => ({ ...prev, [activeSessionId]: "present" }));
    });

    if (existing?.id) {
      updateMutation.mutate({
        ...payload,
        id: existing.id,
        created_at: existing.created_at ?? new Date().toISOString(),
        _exerciseLogs: draftState.exerciseLogs.length > 0 ? draftState.exerciseLogs : []
      });
    } else {
      mutation.mutate({ ...payload, _exerciseLogs: draftState.exerciseLogs.length > 0 ? draftState.exerciseLogs : undefined });
    }

    setActiveSessionId(null);
    setDetailsOpen(false);
    setAlternativeOverride(null);
  }, [activeSessionId, user, userId, draftState, stableDurationMin, sessionsForSelectedDay, getLogForSession, startTransition, updateMutation, mutation, setAttendanceOverrideBySessionId, setActiveSessionId, setDetailsOpen, alternativeOverride]);

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
          variant="amber"
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

        {/* Wellness banner */}
        {userId && (
          <WellnessBanner userId={userId} onOpen={() => setWellnessOpen(true)} />
        )}

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
        <div className="mt-3 rounded-3xl border border-border bg-card overflow-hidden">
          <CalendarHeader
            monthCursor={monthCursor}
            selectedDayStatus={selectedDayStatus}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onJumpToday={jumpToday}
          />

          <CalendarGrid
            monthCursor={monthCursor}
            gridDates={gridDates}
            completionByISO={completionByISO}
            competitionDates={competitionDates}
            absenceDates={absenceDates}
            selectedISO={selectedISO}
            selectedDayIndex={selectedDayIndex}
            today={today}
            onDayClick={openDay}
            onKeyDown={handleCalendarKeyDown}
          />
        </div>

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
          <DialogContent className="max-w-[340px] rounded-2xl p-5">
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
                            "h-8 w-8 rounded-full border-2 transition-all duration-150 active:scale-90",
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
        <FeedbackDrawer
          open={drawerOpen}
          selectedDate={selectedDate}
          sessionsForSelectedDay={sessionsForSelectedDay}
          selectedDayStatus={selectedDayStatus}
          dayKm={dayKm}
          activeSessionId={activeSessionId}
          detailsOpen={detailsOpen}
          draftState={draftState}
          saveState={saveState}
          isPending={isPending}
          logsBySessionId={logsBySessionId}
          getLogForSession={getLogForSession}
          onClose={closeDay}
          onDayOffAll={dayOffAll}
          onOpenSession={openSession}
          onCloseSession={() => {
            setActiveSessionId(null);
            setDetailsOpen(false);
          }}
          onToggleDetails={() => setDetailsOpen((v) => !v)}
          onMarkAbsent={markAbsent}
          onMarkPresent={markPresent}
          onClearOverride={clearOverride}
          onSaveFeedback={saveFeedback}
          onDeleteFeedback={(sessionId) => {
            const existing = getLogForSession(sessionId);
            if (existing?.id) {
              deleteMutation.mutate(Number(existing.id));
              setActiveSessionId(null);
              setDetailsOpen(false);
            }
          }}
          onDraftStateChange={setDraftState}
          getSessionStatus={getSessionStatus}
          isAbsent={absenceDates.has(selectedISO)}
          absenceReason={myAbsences.find((a) => a.date === selectedISO)?.reason ?? null}
          onMarkDayAbsent={(reason) => absenceMutation.mutate({ date: selectedISO, reason })}
          onRemoveDayAbsence={() => removeAbsenceMutation.mutate(selectedISO)}
          onSwitchAlternative={(sessionId, assignmentId, title, km) => {
            setAlternativeOverride({ sessionId, assignmentId, title, km });
            openSession(sessionId);
          }}
          alternativeOverrideTitle={
            alternativeOverride?.sessionId === activeSessionId
              ? alternativeOverride.title
              : null
          }
        />

        {/* Wellness Drawer */}
        {wellnessOpen && userId && (
          <>
            <div
              className="fixed inset-0 z-overlay bg-black/30"
              onClick={() => setWellnessOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-modal max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-background border-t border-border shadow-xl px-4 pt-4 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-display font-bold uppercase italic tracking-tight text-primary">
                  Wellness du jour
                </h2>
                <button
                  type="button"
                  onClick={() => setWellnessOpen(false)}
                  className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <WellnessForm
                userId={userId}
                date={(() => {
                  const d = new Date();
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                })()}
                onSaved={() => {
                  setWellnessOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["wellness"] });
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

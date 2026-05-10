import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  StrengthCycleType,
  StrengthSessionTemplate,
  StrengthSessionItem,
  Exercise,
  Assignment,
  getAssignments,
  getStrengthSessions,
  getExercises,
  get1RM,
  startStrengthRun as startStrengthRunApi,
  logStrengthSet as logStrengthSetApi,
  updateStrengthRun,
  updateExerciseNote,
  reconcileStrengthRunLogs,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WorkoutRunner, resolveNextStep } from "@/components/strength/WorkoutRunner";
import { SessionBrowser } from "@/components/strength/SessionBrowser";
import { SessionSummary } from "@/components/strength/SessionSummary";
import { SessionDetailPreview } from "@/components/strength/SessionDetailPreview";
import { HistoryTable } from "@/components/strength/HistoryTable";
import { useStrengthState } from "@/hooks/useStrengthState";
import { orderStrengthItems } from "@/components/strength/utils";
import { localStorageGet } from "@/lib/api/localStorage";
import { STORAGE_KEYS } from "@/lib/api/client";
import type { SetLogEntry, UpdateStrengthRunInput, OneRmEntry } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { MyPlanTab } from "@/components/strength/MyPlanTab";
import { OneRmGate } from "@/components/strength/OneRmGate";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue, isTransientError } from "@/lib/offlineQueue";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

type StrengthExerciseParams = {
  sets: number | null;
  reps: number | null;
  percent1rm: number | null;
  restSeries: number | null;
  restExercise: number | null;
};

const normalizeStrengthParam = (value?: number | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const resolveExerciseParams = (
  exercise: Exercise | undefined,
  cycle: StrengthCycleType,
): StrengthExerciseParams => {
  if (!exercise) {
    return {
      sets: null,
      reps: null,
      percent1rm: null,
      restSeries: null,
      restExercise: null,
    };
  }
  const cycleParams = {
    endurance: {
      sets: exercise.Nb_series_endurance,
      reps: exercise.Nb_reps_endurance,
      percent1rm: exercise.pct_1rm_endurance,
      restSeries: exercise.recup_endurance,
      restExercise: exercise.recup_exercices_endurance,
    },
    hypertrophie: {
      sets: exercise.Nb_series_hypertrophie,
      reps: exercise.Nb_reps_hypertrophie,
      percent1rm: exercise.pct_1rm_hypertrophie,
      restSeries: exercise.recup_hypertrophie,
      restExercise: exercise.recup_exercices_hypertrophie,
    },
    force: {
      sets: exercise.Nb_series_force,
      reps: exercise.Nb_reps_force,
      percent1rm: exercise.pct_1rm_force,
      restSeries: exercise.recup_force,
      restExercise: exercise.recup_exercices_force,
    },
  }[cycle];
  return {
    sets: normalizeStrengthParam(cycleParams.sets),
    reps: normalizeStrengthParam(cycleParams.reps),
    percent1rm: normalizeStrengthParam(cycleParams.percent1rm),
    restSeries: normalizeStrengthParam(cycleParams.restSeries),
    restExercise: normalizeStrengthParam(cycleParams.restExercise),
  };
};

const getCycleItems = (items: StrengthSessionTemplate["items"] = [], cycle: StrengthCycleType) => {
  const filtered = items.filter((item) => item.cycle_type === cycle);
  const cycleItems = filtered.length ? filtered : items;
  return orderStrengthItems(cycleItems);
};

const resolveStrengthItems = (
  items: StrengthSessionItem[] = [],
  cycle: StrengthCycleType,
  exerciseLookup: Map<number, Exercise>,
) =>
  getCycleItems(items, cycle).map((item) => {
    const params = resolveExerciseParams(exerciseLookup.get(item.exercise_id), cycle);
    return {
      ...item,
      sets: item.sets ?? params.sets ?? 0,
      reps: item.reps ?? params.reps ?? 0,
      rest_seconds: item.rest_seconds ?? params.restSeries ?? 0,
      percent_1rm: item.percent_1rm ?? params.percent1rm ?? 0,
    };
  });

export const resetStrengthRunState = (setters: {
  setActiveSession: (v: null) => void;
  setActiveAssignment: (v: null) => void;
  setActiveRunId: (v: null) => void;
  setActiveRunLogs: (v: null) => void;
  setActiveRunnerStep: (v: number) => void;
  setScreenMode: (v: "list") => void;
}) => {
  setters.setActiveSession(null);
  setters.setActiveAssignment(null);
  setters.setActiveRunId(null);
  setters.setActiveRunLogs(null);
  setters.setActiveRunnerStep(0);
  setters.setScreenMode("list");
};

export const createInProgressRun = ({
  runId,
  assignmentId,
  startedAt,
}: {
  runId: number;
  assignmentId?: number | null;
  startedAt: string;
}) => ({
  id: runId,
  assignment_id: assignmentId ?? null,
  started_at: startedAt,
  progress_pct: 0,
  status: "in_progress",
  logs: [],
});

export const buildInProgressRunCache = (run: ReturnType<typeof createInProgressRun> | null) => ({
  runs: run ? [run] : [],
  pagination: { limit: 1, offset: 0, total: run ? 1 : 0 },
  exercise_summary: [],
});

export default function Strength() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);
  const selectedAthleteId = useAuth((s) => s.selectedAthleteId);
  const selectedAthleteName = useAuth((s) => s.selectedAthleteName);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasCoachSelection =
    (role === "coach" || role === "admin") &&
    (selectedAthleteId !== null || !!selectedAthleteName);
  const historyAthleteName = hasCoachSelection ? selectedAthleteName : user;
  const historyAthleteId = hasCoachSelection ? selectedAthleteId : userId;
  const historyAthleteKey = historyAthleteId ?? historyAthleteName;

  const {
    activeSession,
    setActiveSession,
    activeAssignment,
    setActiveAssignment,
    activeRunId,
    setActiveRunId,
    activeRunLogs,
    setActiveRunLogs,
    activeRunnerStep,
    setActiveRunnerStep,
    screenMode,
    setScreenMode,
    isFinishing,
    setIsFinishing,
    saveState,
    setSaveState,
    preferences,
    setPreferences,
    searchQuery,
    setSearchQuery,
    cycleType,
    setCycleType,
    clearActiveRunState,
    wasRestored,
  } = useStrengthState({ athleteKey: historyAthleteKey });

  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(false);

  // Show recovery toast when a focus session is restored from localStorage
  useEffect(() => {
    if (wasRestored) {
      toast({
        title: "Séance en cours récupérée",
        description: "Votre progression a été restaurée automatiquement.",
      });
    }
  }, [wasRestored, toast]);

  // Background reconcile on offline → online while a run is active. Without
  // this, set logs that landed only in localStorage during an offline patch
  // would not reach the server until the user finally hits "Terminer" — and
  // would be lost if the user never finishes (closes tab, switches device).
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (!wasOfflineRef.current) return;
    if (!activeRunId || !activeRunLogs || activeRunLogs.length === 0) {
      wasOfflineRef.current = false;
      return;
    }
    // Keep wasOfflineRef = true until reconcile actually succeeds. Otherwise
    // a transient error here (RLS hiccup, 503) silently swallows the offline
    // logs: the next online tick wouldn't retry, and the reconcile-at-finish
    // path only runs if the swimmer ever taps "Terminer".
    void reconcileStrengthRunLogs({
        runId: activeRunId,
        logs: activeRunLogs,
        athleteId: userId ?? null,
        athleteName: user ?? null,
      })
      .then(() => {
        wasOfflineRef.current = false;
      })
      .catch((err) => {
        console.warn("[strength] background reconcile failed:", err);
      });
  }, [isOnline, activeRunId, activeRunLogs, userId, user]);

  const cycleOptions: Array<{ value: StrengthCycleType; label: string }> = [
    { value: "endurance", label: "Endurance" },
    { value: "hypertrophie", label: "Hypertrophie" },
    { value: "force", label: "Force" },
  ];

  // Queries
  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["assignments", user, "strength"],
    queryFn: () => getAssignments(user!, userId, { assignmentType: "strength" }),
    enabled: !!user,
  });

  const { data: strengthCatalog, isLoading: catalogLoading, error: catalogError, refetch: refetchCatalog } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => getStrengthSessions(),
  });

  const { data: exercises, error: exercisesError, refetch: refetchExercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => getExercises(),
    // Hydrate immediately from the localStorage mirror written by
    // getExercises so a PWA cold-start in focus mode (no network) still
    // resolves exercise names + GIF URLs without spinning on the skeleton.
    initialData: () => {
      const cached = localStorageGet(STORAGE_KEYS.EXERCISES) as Exercise[] | null;
      return Array.isArray(cached) && cached.length > 0 ? cached : undefined;
    },
    // 0 = treat the cached snapshot as already stale so React Query refetches
    // on mount. Without this, staleTime keeps the localStorage mirror as
    // "fresh" for 5 min, which hides exercises added since the last fetch
    // (e.g. coach adds Hang Clean → swimmer in focus mode can't substitute).
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
  });

  const isListLoading = assignmentsLoading || catalogLoading;
  const error = assignmentsError || catalogError || exercisesError;
  const refetch = () => {
    refetchAssignments();
    refetchCatalog();
    refetchExercises();
  };

  const { data: oneRMs } = useQuery({
    queryKey: ["1rm", user, userId],
    queryFn: () => get1RM({ athleteName: user, athleteId: userId }),
    enabled: !!user,
  });

  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  /** Bumped when we want to launch focus immediately after the next render
   *  has committed activeSession. Used by startPlanSessionDirect (Démarrer
   *  maintenant) to skip the reader screen — without the indirection, calling
   *  handleLaunchFocus synchronously after startPlanSession reads a stale
   *  closure and bails on `activeFilteredItems.length === 0`. */
  const [autoLaunchKey, setAutoLaunchKey] = useState(0);

  // Task 11: Exercise substitution state
  const [substitutions, setSubstitutions] = useState<Map<number, { originalIndex: number; exercise: Exercise }>>(new Map());
  const [originalItemCount, setOriginalItemCount] = useState(0);

  const handleSubstitute = (itemIndex: number, newExercise: Exercise) => {
    const params = resolveExerciseParams(newExercise, cycleType);
    setSubstitutions((prev) => {
      const next = new Map(prev);
      next.set(itemIndex, { originalIndex: itemIndex, exercise: newExercise });
      return next;
    });
    setActiveSession((prev) => {
      if (!prev?.items) return prev;
      const items = [...prev.items];
      items[itemIndex] = {
        ...items[itemIndex],
        exercise_id: newExercise.id,
        exercise_name: newExercise.nom_exercice,
        sets: params.sets ?? items[itemIndex].sets,
        reps: params.reps ?? items[itemIndex].reps,
        rest_seconds: params.restSeries ?? items[itemIndex].rest_seconds,
        percent_1rm: params.percent1rm ?? items[itemIndex].percent_1rm,
      };
      return { ...prev, items };
    });
    toast({
      title: "Exercice remplacé",
      description: `${newExercise.nom_exercice} — paramètres mis à jour.`,
    });
  };

  // Task 12: Add exercise handler — uses cycle-aware defaults so an exercise
  // added mid-session inherits the same prescription a planned one would (sets
  // / reps / rest / %1RM from the chosen cycle). Falls back to neutral defaults
  // only when the exercise definition has no cycle params.
  const handleAddExercise = (exercise: Exercise) => {
    const params = resolveExerciseParams(exercise, cycleType);
    setActiveSession((prev) => {
      if (!prev) return prev;
      const newItem = {
        exercise_id: exercise.id,
        exercise_name: exercise.nom_exercice,
        order_index: (prev.items?.length ?? 0),
        sets: params.sets ?? 3,
        reps: params.reps ?? 10,
        rest_seconds: params.restSeries ?? 90,
        percent_1rm: params.percent1rm ?? 0,
        cycle_type: cycleType,
      };
      return { ...prev, items: [...(prev.items ?? []), newItem] };
    });
  };

  const exerciseNotes = useMemo(() => {
    const map: Record<number, string | null> = {};
    (oneRMs ?? []).forEach((entry: OneRmEntry) => {
      if (entry.notes) map[entry.exercise_id] = entry.notes;
    });
    return map;
  }, [oneRMs]);

  const exerciseLookup = useMemo(() => {
    if (!exercises) return new Map<number, Exercise>();
    return new Map(exercises.map((exercise) => [exercise.id, exercise]));
  }, [exercises]);

  const activeFilteredItems = useMemo(() => {
    if (!activeSession) return [];
    return resolveStrengthItems(activeSession.items ?? [], cycleType, exerciseLookup);
  }, [activeSession, cycleType, exerciseLookup]);

  // Mutations
  const startRun = useMutation({
    mutationFn: (data: Parameters<typeof startStrengthRunApi>[0]) => startStrengthRunApi(data),
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: (data) => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      if (data?.run_id) {
        setActiveRunId(data.run_id);
        setActiveRunLogs((prev) => prev ?? []);
        if (historyAthleteKey) {
          const runSnapshot = createInProgressRun({
            runId: data.run_id,
            assignmentId: activeAssignment?.id ?? null,
            startedAt: new Date().toISOString(),
          });
          queryClient.setQueryData(
            ["strength_run_in_progress", historyAthleteKey],
            buildInProgressRunCache(runSnapshot),
          );
        }
      }
      // Invalidate by prefix so both ["assignments", user, "strength"] (this page)
      // and ["assignments", userId ?? user] (Dashboard calendar) refresh together.
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["strength_run_in_progress", historyAthleteKey] });
      queryClient.invalidateQueries({ queryKey: ["strength_history"] });
    },
    onError: () => {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      toast({ title: "Erreur", description: "Impossible de démarrer la séance.", variant: "destructive" });
    },
  });

  const logStrengthSet = useMutation({
    mutationFn: (data: Parameters<typeof logStrengthSetApi>[0]) => logStrengthSetApi(data),
    onMutate: () => {
      if (screenMode !== "focus") setSaveState("saving");
    },
    onSuccess: (data) => {
      if (screenMode !== "focus") {
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      }
      if (data?.one_rm_updated) {
        queryClient.invalidateQueries({ queryKey: ["1rm", user, userId] });
        toast({
          title: "Nouveau 1RM détecté",
          description: "Ton record vient d'être mis à jour.",
        });
      }
    },
    onError: () => {
      if (screenMode === "focus") return; // data is in localStorage — silent in focus mode
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer une série.",
        variant: "destructive",
      });
    },
  });

  const updateRun = useMutation({
    mutationFn: (data: UpdateStrengthRunInput) => updateStrengthRun(data),
    onMutate: () => {
      if (screenMode !== "focus") setSaveState("saving");
    },
    onSuccess: (_data, variables) => {
      if (screenMode !== "focus") {
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      }
      setIsFinishing(false);
      queryClient.invalidateQueries({ queryKey: ["strength_history"] });
      if (variables?.status !== "completed") {
        return;
      }
      if (historyAthleteKey) {
        queryClient.setQueryData(
          ["strength_run_in_progress", historyAthleteKey],
          buildInProgressRunCache(null),
        );
      }
      // Prefix invalidation covers both the strength-scoped key on this page
      // and the swimmer Dashboard's ["assignments", userId ?? user]. Without
      // this, the calendar still showed the muscu pill as "to do" right after
      // the swimmer finished a session.
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["1rm", user, userId] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      setScreenMode("summary");
      toast({ title: "Séance sauvegardée", description: "Bravo pour l'effort !" });
    },
    onError: () => {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      setIsFinishing(false);
      // No toast here — onFinish catch block handles the offline fallback for completed runs
    },
  });

  const updateNote = useMutation({
    mutationFn: (params: { exercise_id: number; notes: string | null }) =>
      updateExerciseNote({
        athlete_id: userId ?? 0,
        exercise_id: params.exercise_id,
        notes: params.notes,
      }),
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      queryClient.invalidateQueries({ queryKey: ["1rm", user, userId] });
    },
    onError: () => {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      toast({ title: "Erreur", description: "Impossible de sauvegarder la note.", variant: "destructive" });
    },
  });

  type StrengthAssignment = Assignment & { session_type: "strength"; items?: StrengthSessionItem[] };

  const handleStartAssignment = (
    assignment: StrengthAssignment & { session?: StrengthSessionTemplate },
    cycleOverride?: StrengthCycleType,
  ) => {
    const sessionItems = assignment.items ?? [];
    const cycle = normalizeStrengthCycle(
      cycleOverride ??
        assignment.cycle ??
        sessionItems.find((item) => item.cycle_type)?.cycle_type,
    );
    const items = resolveStrengthItems(sessionItems, cycle, exerciseLookup);
    setActiveAssignment(assignment);
    setActiveSession({
      ...assignment,
      title: assignment.title,
      description: assignment.description,
      cycle,
      items,
    });
    setActiveRunId(null);
    setActiveRunLogs(null);
    setActiveRunnerStep(0);
    setScreenMode("reader");
  };

  const startAssignment = (assign: StrengthAssignment) => {
    const sessionItems = assign.items ?? [];
    if (sessionItems.length === 0) {
      toast({
        title: "Séance vide",
        description: "Aucun exercice n'est disponible pour cette séance.",
      });
      return;
    }
    handleStartAssignment(assign, cycleType);
    setActiveRunId(null);
    setActiveRunLogs(null);
    setSubstitutions(new Map());
    const items = resolveStrengthItems(sessionItems, cycleType, exerciseLookup);
    setOriginalItemCount(items.length);
  };

  const [isPlanMode, setIsPlanMode] = useState(false);
  const [showOneRmGate, setShowOneRmGate] = useState(false);
  const [skipPercent1rm, setSkipPercent1rm] = useState(false);

  const missing1RmExercises = useMemo(() => {
    return activeFilteredItems
      .filter((item) => (item.percent_1rm ?? 0) > 0)
      .filter((item) => !oneRMs?.some((rm: OneRmEntry) => rm.exercise_id === item.exercise_id && Number(rm.weight) > 0))
      .map((item) => ({
        exerciseId: item.exercise_id,
        exerciseName: item.exercise_name ?? `Ex #${item.exercise_id}`,
      }));
  }, [activeFilteredItems, oneRMs]);

  const startCatalogSession = (session: StrengthSessionTemplate) => {
    const sessionItems = session.items ?? [];
    const filteredItems = sessionItems.filter((item) => item.cycle_type === cycleType);
    const cycle =
      filteredItems.length > 0
        ? cycleType
        : normalizeStrengthCycle(session.cycle ?? sessionItems.find((item) => item.cycle_type)?.cycle_type);
    const items = resolveStrengthItems(sessionItems, cycle, exerciseLookup);
    if (items.length === 0) {
      toast({
        title: "Séance vide",
        description: "Aucun exercice n'est disponible pour cette séance.",
      });
      return;
    }
    setIsPlanMode(false);
    setActiveSession({ ...session, cycle, items });
    setActiveAssignment(null);
    setActiveRunId(null);
    setActiveRunLogs(null);
    setActiveRunnerStep(0);
    setScreenMode("reader");
    setSubstitutions(new Map());
    setOriginalItemCount(items.length);
  };

  /** Launch from "Mon plan" — uses the session's own cycle, no cycle selector */
  const startPlanSession = (session: StrengthSessionTemplate) => {
    const sessionItems = session.items ?? [];
    const cycle = normalizeStrengthCycle(session.cycle ?? sessionItems.find((item) => item.cycle_type)?.cycle_type);
    const items = resolveStrengthItems(sessionItems, cycle, exerciseLookup);
    if (items.length === 0) {
      toast({
        title: "Séance vide",
        description: "Aucun exercice n'est disponible pour cette séance.",
      });
      return;
    }
    setIsPlanMode(true);
    setCycleType(cycle);
    setActiveSession({ ...session, cycle, items });
    setActiveAssignment(null);
    setActiveRunId(null);
    setActiveRunLogs(null);
    setActiveRunnerStep(0);
    setScreenMode("reader");
    setSubstitutions(new Map());
    setOriginalItemCount(items.length);
  };

  /**
   * Same as startPlanSession but skips the reader screen — used for the
   * "Démarrer maintenant" CTA on the day-J card and for handoff from the
   * Dashboard drawer (sessionStorage `eac_pending_strength_focus_slot_id`).
   *
   * We can't call handleLaunchFocus synchronously: it reads activeSession
   * via closure and would see the previous render's value. autoLaunchKey
   * triggers a useEffect once the new session has committed, then fires
   * handleLaunchFocus from a fresh closure.
   */
  const startPlanSessionDirect = (session: StrengthSessionTemplate) => {
    startPlanSession(session);
    setAutoLaunchKey((k) => k + 1);
  };

  // Wait for activeSession + activeFilteredItems to be committed before
  // launching focus. handleLaunchFocus has its own guards (empty session,
  // missing 1RM gate); we rely on those rather than re-checking here.
  useEffect(() => {
    if (autoLaunchKey === 0) return;
    if (!activeSession) return;
    if (screenMode !== "reader") return;
    if (activeFilteredItems.length === 0) return;
    setAutoLaunchKey(0);
    void handleLaunchFocus();
    // We deliberately omit handleLaunchFocus from deps: it's a stable
    // function in this render but the React lint plugin can't prove it.
    // Re-running this effect on every render would defeat the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLaunchKey, activeSession, screenMode, activeFilteredItems.length]);

  const handleLaunchFocus = async () => {
    if (!activeSession) return;
    if (startRun.isPending) return;
    const lockedCycle = activeSession.cycle ?? cycleType;
    if (activeFilteredItems.length === 0) {
      toast({
        title: "Séance vide",
        description: "Aucun exercice n'est disponible pour cette séance.",
      });
      return;
    }

    // Check for missing 1RMs before entering focus mode
    if (missing1RmExercises.length > 0 && !skipPercent1rm) {
      setShowOneRmGate(true);
      return;
    }

    // Auto-start the run so WorkoutRunner skips step 0
    if (!activeRunId) {
      const sessionId = activeAssignment?.session_id ?? activeSession?.id ?? null;
      if (!sessionId) {
        toast({
          title: "Session manquante",
          description: "Impossible de démarrer sans session associée.",
          variant: "destructive",
        });
        return;
      }
      try {
        const res = await startRun.mutateAsync({
          assignment_id: activeAssignment?.id ?? null,
          athlete_id: userId ?? null,
          athleteName: user ?? undefined,
          progress_pct: 0,
          session_id: sessionId,
          cycle_type: lockedCycle,
        });
        if (res?.run_id) {
          // Pre-persist to localStorage BEFORE the React setState commit.
          // Anti-orphan guard: if the swimmer kills the app between
          // startRun's server success and useStrengthState's persist effect
          // (which only fires after a React re-render with screenMode set),
          // the run would otherwise live as "in_progress" on the server
          // with no local trace — invisible from the swimmer's next
          // session and surfacing only via SessionBrowser's
          // strength_run_in_progress query if they happen to come back.
          //
          // Writing the full focus-state shape (screenMode + session +
          // runId) here means useStrengthState's restore-on-mount path can
          // resurrect it cleanly. The next render will overwrite this
          // entry with the up-to-date payload anyway.
          if (typeof window !== "undefined") {
            const focusKey = `strength-focus-state-${historyAthleteKey ?? "anonymous"}`;
            try {
              window.localStorage.setItem(
                focusKey,
                JSON.stringify({
                  screenMode: "reader",
                  session: { ...activeSession, cycle: lockedCycle, items: activeFilteredItems },
                  assignment: activeAssignment,
                  runId: res.run_id,
                  runLogs: [],
                  runnerStep: 1,
                  cycleType: lockedCycle,
                }),
              );
            } catch {
              // localStorage full / private mode — the SessionBrowser
              // query path remains as the secondary recovery channel.
            }
          }
          setActiveRunId(res.run_id);
          setActiveRunLogs((prev) => prev ?? []);
        }
      } catch {
        toast({
          title: "Erreur de démarrage",
          description: "Impossible de démarrer la séance. Vérifiez votre connexion.",
          variant: "destructive",
        });
        return;
      }
    }

    // Update session with resolved items and enter focus — batched to avoid double-render
    setActiveSession({
      ...activeSession,
      cycle: lockedCycle,
      items: activeFilteredItems,
    });
    setActiveRunnerStep(1);
    setSessionStartTime(Date.now());
    setScreenMode("focus");
  };

  // Escape key handler for reader mode
  useEffect(() => {
    if (screenMode !== "reader") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setScreenMode("list");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screenMode]);

  const isLoading = assignmentsLoading || catalogLoading;

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-6 w-24" />
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full rounded-lg" />
        {/* Cycle selector skeleton */}
        <div className="grid grid-cols-3 gap-2 pt-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[60px] rounded-2xl" />
          ))}
        </div>
        {/* Session cards skeleton */}
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="flex items-center gap-3.5 rounded-2xl bg-card p-3.5 shadow-sm">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
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
        <Button variant="default" onClick={() => refetch()} className="mt-4 h-12 md:h-10">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="sr-only">Musculation</h1>
      {screenMode === "focus" && activeSession ? (
        exercises ? (
          <div className="animate-in fade-in motion-reduce:animate-none">
            <WorkoutRunner
              session={activeSession}
              exercises={exercises}
              oneRMs={oneRMs || []}
              exerciseNotes={exerciseNotes}
              onUpdateNote={(exerciseId, note) => updateNote.mutate({ exercise_id: exerciseId, notes: note })}
              initialLogs={activeRunLogs}
              initialStep={activeRunnerStep}
              isFinishing={isFinishing}
              runId={activeRunId ?? undefined}
              onStepChange={(step) => setActiveRunnerStep(step)}
              onExitFocus={() => {
                setScreenMode("list");
                // Don't clear run state — keep activeRunId so InProgressCard shows
              }}
              onAddExercise={handleAddExercise}
              onSubstitute={handleSubstitute}
              userId={userId ?? 0}
              onLogSets={async (blockLogs) => {
                if (!activeRunId) return;
                // Always persist locally first — triggers localStorage write via useStrengthState
                setActiveRunLogs((prev) => [...(prev ?? []), ...blockLogs]);
                // If offline, queue the set for replay so the per-set log is
                // not lost if the user finishes online from a different device
                // or if the reconcile-at-finish step never runs.
                if (!isOnline) {
                  let quotaErrored = false;
                  blockLogs.forEach((log: SetLogEntry, index: number) => {
                    try {
                      enqueue("strength-set-log", {
                        run_id: activeRunId,
                        exercise_id: log.exercise_id,
                        set_index: log.set_number ?? index + 1,
                        reps: log.reps ?? null,
                        weight: log.weight ?? null,
                        difficulty: log.difficulty ?? null,
                        athlete_id: userId ?? null,
                        athlete_name: user ?? null,
                      } as Record<string, unknown>);
                    } catch {
                      quotaErrored = true;
                    }
                  });
                  if (quotaErrored) {
                    toast({
                      title: "Mémoire pleine",
                      description: "Reconnecte-toi au réseau pour libérer l'espace de stockage.",
                      variant: "destructive",
                    });
                  }
                  return;
                }
                // Online fire-and-forget: don't block WorkoutRunner while
                // network is slow. On error we enqueue so a transient blip
                // (TLS reset, 503) doesn't silently drop a set — the
                // OfflineMutationSync replay path picks it up.
                blockLogs.forEach((log: SetLogEntry, index: number) => {
                  const payload = {
                    run_id: activeRunId,
                    exercise_id: log.exercise_id,
                    set_index: log.set_number ?? index + 1,
                    reps: log.reps ?? null,
                    weight: log.weight ?? null,
                    difficulty: log.difficulty ?? null,
                    athlete_id: userId ?? null,
                    athlete_name: user ?? null,
                  };
                  logStrengthSet.mutate(payload, {
                    onError: () => {
                      try {
                        enqueue("strength-set-log", payload as Record<string, unknown>);
                      } catch {
                        toast({
                          title: "Mémoire pleine",
                          description: "Reconnecte-toi au réseau pour libérer l'espace de stockage.",
                          variant: "destructive",
                        });
                      }
                    },
                  });
                });
              }}
              onProgress={async (progressPct) => {
                if (!activeRunId) return;
                if (!isOnline) return;
                // Fire-and-forget: progress updates are nice-to-have; data is in localStorage
                updateRun.mutate({
                  run_id: activeRunId,
                  progress_pct: progressPct,
                  status: "in_progress",
                });
              }}
              onFinish={async (result) => {
                if (!activeRunId) return;
                if (isFinishing) return;
                if (!activeRunLogs || activeRunLogs.length === 0) {
                  toast({
                    title: "Aucune série enregistrée",
                    description: "Valide au moins une série avant de terminer la séance.",
                    variant: "destructive",
                  });
                  return;
                }
                // Full payload for the offline queue (includes athlete_name + started_at for saveStrengthRun)
                const offlinePayload = {
                  run_id: activeRunId,
                  assignment_id: activeAssignment?.id ?? undefined,
                  session_id: activeAssignment?.session_id ?? activeSession?.id ?? undefined,
                  athlete_id: userId ?? undefined,
                  athlete_name: user ?? undefined,
                  started_at: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
                  date: new Date().toISOString(),
                  progress_pct: 100,
                  status: "completed",
                  ...result,
                };
                if (!isOnline) {
                  try {
                    enqueue("strength-run-completed", offlinePayload as Record<string, unknown>);
                    toast({ title: "Séance sauvegardée hors-ligne", description: "Sera synchronisée au retour du réseau." });
                    setScreenMode("summary");
                  } catch {
                    toast({
                      title: "Mémoire pleine",
                      description: "Impossible d'enregistrer la séance hors-ligne. Reconnecte-toi au réseau.",
                      variant: "destructive",
                    });
                  }
                  return;
                }
                setIsFinishing(true);
                try {
                  // Re-insert any set logs that may have been lost in fire-and-forget saves
                  await reconcileStrengthRunLogs({
                    runId: activeRunId,
                    logs: result.logs,
                    athleteId: userId ?? null,
                    athleteName: user ?? null,
                  });
                  await updateRun.mutateAsync({
                    assignment_id: activeAssignment?.id ?? undefined,
                    run_id: activeRunId,
                    session_id: activeAssignment?.session_id ?? activeSession?.id ?? undefined,
                    athlete_id: userId ?? undefined,
                    date: new Date().toISOString(),
                    progress_pct: 100,
                    status: "completed",
                    ...result,
                  });
                  // onSuccess handles navigation to summary + toast
                } catch (err) {
                  // Distinguish transient errors (network blip, timeout including
                  // "reconcile-batch: timeout") from hard failures.
                  // Transient → enqueue + summary (existing behavior).
                  // Hard failure → destructive toast, stay on WorkoutRunner for retry.
                  if (isTransientError(err)) {
                    try {
                      enqueue("strength-run-completed", offlinePayload as Record<string, unknown>);
                      toast({ title: "Séance sauvegardée hors-ligne", description: "Sera synchronisée au retour du réseau." });
                      setScreenMode("summary");
                    } catch {
                      toast({
                        title: "Mémoire pleine",
                        description: "Impossible d'enregistrer la séance hors-ligne. Reconnecte-toi au réseau.",
                        variant: "destructive",
                      });
                    }
                  } else {
                    toast({
                      title: "Erreur d'enregistrement",
                      description: "Une erreur inattendue est survenue. Réessaie.",
                      variant: "destructive",
                    });
                    // Stay on WorkoutRunner so the user can retry
                  }
                } finally {
                  // Always unblock the ENREGISTRER button, regardless of error type.
                  // Previously only set in catch, which left the button stuck disabled
                  // on non-transient errors until a full app refresh.
                  setIsFinishing(false);
                }
              }}
            />
          </div>
        ) : (
          <div className="space-y-4 py-10">
            <div className="mx-auto h-8 w-48 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
            <div className="mx-auto h-4 w-32 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
            <div className="space-y-3 pt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 w-full rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          </div>
        )
      ) : screenMode === "summary" && activeSession ? (
        <SessionSummary
          sessionTitle={activeSession.title ?? "Séance"}
          logs={activeRunLogs ?? []}
          durationMinutes={sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : null}
          exerciseNames={new Map(
            (activeSession.items ?? []).map((item) => [
              item.exercise_id,
              item.exercise_name ?? exerciseLookup.get(item.exercise_id)?.nom_exercice ?? `Ex #${item.exercise_id}`,
            ]),
          )}
          onClose={() => {
            setScreenMode("list");
            setActiveSession(null);
            setActiveAssignment(null);
            setActiveRunId(null);
            setActiveRunLogs(null);
            setSessionStartTime(null);
          }}
        />
      ) : (
        <>
          <PageHeader
            title="Muscu"
            icon={<Dumbbell className="h-3.5 w-3.5" />}
          />

          <Tabs defaultValue="planning" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="planning">Mon plan</TabsTrigger>
              <TabsTrigger value="start">S'entraîner</TabsTrigger>
              <TabsTrigger value="history">Historique</TabsTrigger>
            </TabsList>

            <TabsContent value="start" className="space-y-5 pt-4">
              {screenMode === "list" && (
                <SessionBrowser
                  user={user}
                  userId={userId}
                  athleteName={historyAthleteName}
                  athleteId={historyAthleteId}
                  athleteKey={historyAthleteKey}
                  cycleType={cycleType}
                  searchQuery={searchQuery}
                  isLoading={isListLoading}
                  setSaveState={setSaveState}
                  onCycleChange={setCycleType}
                  onSearchChange={setSearchQuery}
                  onStartAssignment={(assignment) => {
                    if (assignment.session_type === "strength") {
                      startAssignment(assignment as any);
                    }
                  }}
                  onStartCatalog={startCatalogSession}
                  onStartPlanSession={startPlanSession}
                  onResumeInProgress={({ assignment, session, runId, logs, progressPct }) => {
                    setActiveAssignment(assignment);
                    setActiveSession(session);
                    setActiveRunId(runId);
                    setActiveRunLogs(logs);
                    setActiveRunnerStep(resolveNextStep(session?.items ?? [], logs, progressPct));
                    setScreenMode("focus");
                  }}
                />
              )}

              {screenMode === "reader" && activeSession && exercises && (
                <SessionDetailPreview
                  session={activeSession}
                  assignment={activeAssignment}
                  cycleType={cycleType}
                  cycleOptions={cycleOptions}
                  exercises={exercises}
                  oneRMs={oneRMs || []}
                  saveState={saveState}
                  onBack={() => setScreenMode("list")}
                  onLaunch={handleLaunchFocus}
                  launchDisabled={startRun.isPending}
                  substitutions={substitutions}
                  onSubstitute={handleSubstitute}
                  originalItemCount={originalItemCount}
                  onAddExercise={handleAddExercise}
                />
              )}
            </TabsContent>

            <TabsContent value="planning" className="space-y-4 pt-4">
              {screenMode === "list" && userId && (
                <MyPlanTab
                  athleteId={userId}
                  onSelectSession={startPlanSession}
                  onLaunchSessionDirect={startPlanSessionDirect}
                />
              )}
              {screenMode === "reader" && activeSession && exercises && (
                <SessionDetailPreview
                  session={activeSession}
                  assignment={activeAssignment}
                  cycleType={cycleType}
                  cycleOptions={isPlanMode ? [] : cycleOptions}
                  exercises={exercises}
                  oneRMs={oneRMs || []}
                  saveState={saveState}
                  onBack={() => { setScreenMode("list"); setIsPlanMode(false); }}
                  onLaunch={handleLaunchFocus}
                  launchDisabled={startRun.isPending}
                  substitutions={substitutions}
                  onSubstitute={handleSubstitute}
                  originalItemCount={originalItemCount}
                  onAddExercise={handleAddExercise}
                />
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 pt-4">
              <HistoryTable
                athleteName={historyAthleteName}
                athleteId={historyAthleteId}
                athleteKey={historyAthleteKey}
              />
            </TabsContent>

          </Tabs>
        </>
      )}

      <OneRmGate
        open={showOneRmGate}
        onOpenChange={setShowOneRmGate}
        missingExercises={missing1RmExercises}
        athleteId={userId}
        onSaveAndContinue={() => {
          setShowOneRmGate(false);
          queryClient.invalidateQueries({ queryKey: ["1rm"] });
          // Re-trigger launch after 1RM saved
          handleLaunchFocus();
        }}
        onSkipToFreeWeight={() => {
          setShowOneRmGate(false);
          setSkipPercent1rm(true);
          // Re-trigger launch with skip flag
          setTimeout(() => handleLaunchFocus(), 0);
        }}
      />
    </div>
  );
}

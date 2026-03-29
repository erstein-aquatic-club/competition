import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, StrengthCycleType, StrengthSessionTemplate, StrengthSessionItem, Exercise, Assignment } from "@/lib/api";
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
import type { SetLogEntry, UpdateStrengthRunInput, OneRmEntry } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { MyPlanTab } from "@/components/strength/MyPlanTab";
import { OneRmGate } from "@/components/strength/OneRmGate";

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
      sets: params.sets ?? item.sets ?? 0,
      reps: params.reps ?? item.reps ?? 0,
      rest_seconds: params.restSeries ?? item.rest_seconds ?? 0,
      percent_1rm: params.percent1rm ?? item.percent_1rm ?? 0,
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

  // Show recovery toast when a focus session is restored from localStorage
  useEffect(() => {
    if (wasRestored) {
      toast({
        title: "Séance en cours récupérée",
        description: "Votre progression a été restaurée automatiquement.",
      });
    }
  }, [wasRestored, toast]);

  const cycleOptions: Array<{ value: StrengthCycleType; label: string }> = [
    { value: "endurance", label: "Endurance" },
    { value: "hypertrophie", label: "Hypertrophie" },
    { value: "force", label: "Force" },
  ];

  // Queries
  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["assignments", user, "strength"],
    queryFn: () => api.getAssignments(user!, userId, { assignmentType: "strength" }),
    enabled: !!user,
  });

  const { data: strengthCatalog, isLoading: catalogLoading, error: catalogError, refetch: refetchCatalog } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  const { data: exercises, error: exercisesError, refetch: refetchExercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => api.getExercises(),
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
    queryFn: () => api.get1RM({ athleteName: user, athleteId: userId }),
    enabled: !!user,
  });

  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

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

  // Task 12: Add exercise handler
  const handleAddExercise = (exercise: Exercise) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      const newItem = {
        exercise_id: exercise.id,
        exercise_name: exercise.nom_exercice,
        order_index: (prev.items?.length ?? 0),
        sets: 3,
        reps: 10,
        rest_seconds: 90,
        percent_1rm: 0,
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
    mutationFn: (data: Parameters<typeof api.startStrengthRun>[0]) => api.startStrengthRun(data),
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
      queryClient.invalidateQueries({ queryKey: ["assignments", user, "strength"] });
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
    mutationFn: (data: Parameters<typeof api.logStrengthSet>[0]) => api.logStrengthSet(data),
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
    mutationFn: (data: UpdateStrengthRunInput) => api.updateStrengthRun(data),
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
      queryClient.invalidateQueries({ queryKey: ["assignments", user] });
      queryClient.invalidateQueries({ queryKey: ["assignments", user, "strength"] });
      queryClient.invalidateQueries({ queryKey: ["1rm", user, userId] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      setScreenMode("summary");
      toast({ title: "Séance sauvegardée", description: "Bravo pour l'effort !" });
    },
    onError: (_error, variables) => {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      if (variables?.status === "completed") {
        setIsFinishing(false);
        toast({ title: "Erreur", description: "Impossible d'enregistrer la séance. Réessayez.", variant: "destructive" });
      }
    },
  });

  const updateNote = useMutation({
    mutationFn: (params: { exercise_id: number; notes: string | null }) =>
      api.updateExerciseNote({
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

  const handleLaunchFocus = async () => {
    if (!activeSession) return;
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
              onStepChange={(step) => setActiveRunnerStep(step)}
              onExitFocus={() => {
                setScreenMode("list");
                // Don't clear run state — keep activeRunId so InProgressCard shows
              }}
              onAddExercise={handleAddExercise}
              onSubstitute={handleSubstitute}
              onLogSets={async (blockLogs) => {
                if (!activeRunId) return;
                setActiveRunLogs((prev) => [...(prev ?? []), ...blockLogs]);
                await Promise.all(
                  blockLogs.map((log: SetLogEntry, index: number) =>
                    logStrengthSet.mutateAsync({
                      run_id: activeRunId,
                      exercise_id: log.exercise_id,
                      set_index: log.set_number ?? index + 1,
                      reps: log.reps ?? null,
                      weight: log.weight ?? null,
                      athlete_id: userId ?? null,
                      athlete_name: user ?? null,
                    }),
                  ),
                );
              }}
              onProgress={async (progressPct) => {
                if (!activeRunId) return;
                await updateRun.mutateAsync({
                  run_id: activeRunId,
                  progress_pct: progressPct,
                  status: "in_progress",
                });
              }}
              onFinish={(result) => {
                if (!activeRunId) return;
                setIsFinishing(true);
                updateRun.mutate({
                  assignment_id: activeAssignment?.id ?? undefined,
                  run_id: activeRunId,
                  session_id: activeAssignment?.session_id ?? activeSession?.id ?? undefined,
                  athlete_id: userId ?? undefined,
                  date: new Date().toISOString(),
                  progress_pct: 100,
                  status: "completed",
                  ...result,
                });
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

          <Tabs defaultValue="start" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="start">S'entraîner</TabsTrigger>
              <TabsTrigger value="planning">Mon plan</TabsTrigger>
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

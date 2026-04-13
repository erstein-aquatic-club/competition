import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Dumbbell,
  RotateCcw,
  StickyNote,
  Trophy,
  X,
} from "lucide-react";
import { BottomActionBar } from "@/components/shared/BottomActionBar";
import { ScaleSelector5 } from "@/components/shared/ScaleSelector5";
import { ExercisePicker } from "@/components/strength/ExercisePicker";
import { RestScreen } from "./RestScreen";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { colors } from "@/lib/design-tokens";
import type { Exercise, StrengthSessionTemplate } from "@/lib/api";
import { BODYWEIGHT_SENTINEL, isBodyweight } from "@/lib/api/client";
import type { SetLogEntry, OneRmEntry, WorkoutFinishData, SetInputValues } from "@/lib/types";
import { detectPR, estimateOneRM } from "@/lib/prDetection";
import type { PrDetection } from "@/lib/prDetection";

/** Emit a short beep + vibration when the rest timer ends */
const notifyRestEnd = () => {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    // Second beep after a short pause
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    gain2.gain.value = 0.3;
    osc2.start(ctx.currentTime + 0.35);
    osc2.stop(ctx.currentTime + 0.6);
    osc2.onended = () => ctx.close();
  } catch { /* AudioContext not available */ }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch { /* Vibration API not available */ }
};

export const resolveSetNumber = (log: SetLogEntry | null | undefined, fallbackIndex: number) => {
  const raw = Number(log?.set_index ?? log?.set_number ?? log?.setIndex ?? fallbackIndex);
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallbackIndex;
  }
  return raw;
};

export const resolveNextStep = (
  items: StrengthSessionTemplate["items"] = [],
  logs: SetLogEntry[] | null | undefined,
  progressPct?: number | null,
) => {
  if (!items.length) return 0;
  const usableLogs = Array.isArray(logs) ? logs : [];
  if (usableLogs.length > 0) {
    const logsByExercise = new Map<number, SetLogEntry[]>();
    usableLogs.forEach((log: SetLogEntry, index: number) => {
      if (!log?.exercise_id) return;
      const existing = logsByExercise.get(log.exercise_id) ?? [];
      existing.push({ ...log, set_index: resolveSetNumber(log, index + 1) });
      logsByExercise.set(log.exercise_id, existing);
    });
    let nextStep = items.length + 1;
    for (let i = 0; i < items.length; i += 1) {
      const block = items[i];
      const existing = logsByExercise.get(block.exercise_id) ?? [];
      if (existing.length < (block.sets ?? 0)) {
        nextStep = i + 1;
        break;
      }
    }
    return nextStep;
  }
  const safeProgress = Number(progressPct ?? 0);
  if (!Number.isFinite(safeProgress) || safeProgress <= 0) {
    return 0;
  }
  const completedBlocks = Math.min(
    items.length,
    Math.max(0, Math.round((safeProgress / 100) * items.length)),
  );
  return Math.min(items.length, completedBlocks + 1);
};

const formatStrengthValue = (value?: number | null, suffix?: string) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "—";
  }
  return suffix ? `${numeric}${suffix}` : String(numeric);
};

export function WorkoutRunner({
  session,
  exercises,
  oneRMs,
  onFinish,
  onLogSets,
  onProgress,
  initialLogs,
  isFinishing,
  initialStep,
  onStepChange,
  initialInputOpen,
  initialSeriesOpen,
  onExitFocus,
  exerciseNotes,
  onUpdateNote,
  onAddExercise,
  onSubstitute,
  userId,
}: {
  session: StrengthSessionTemplate;
  exercises: Exercise[];
  oneRMs: OneRmEntry[];
  onFinish: (data: WorkoutFinishData) => void;
  onLogSets?: (logs: SetLogEntry[]) => Promise<void> | void;
  onProgress?: (progressPct: number) => Promise<void> | void;
  initialLogs?: SetLogEntry[] | null;
  isFinishing?: boolean;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  initialInputOpen?: boolean;
  initialSeriesOpen?: boolean;
  onExitFocus?: () => void;
  exerciseNotes?: Record<number, string | null>;
  onUpdateNote?: (exerciseId: number, note: string | null) => void;
  onAddExercise?: (exercise: Exercise) => void;
  onSubstitute?: (itemIndex: number, exercise: Exercise) => void;
  userId: number;
}) {
  const { toast } = useToast();
  const isLoggingRef = useRef(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const [currentStep, setCurrentStep] = useState(initialStep ?? 1);
  const [logs, setLogs] = useState<SetLogEntry[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const elapsedStartRef = useRef(Date.now());
  const elapsedPausedRef = useRef(0);

  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [isRestPaused, setIsRestPaused] = useState(false);
  const restEndRef = useRef(0);
  const [restType, setRestType] = useState<"set" | "exercise">("set");
  const [autoRest, setAutoRest] = useState(true);
  const [difficulty, setDifficulty] = useState(3);
  const [fatigue, setFatigue] = useState(3);
  const [comments, setComments] = useState("");
  const [hasCelebrated, setHasCelebrated] = useState(false);
  const [currentSetIndex, setCurrentSetIndex] = useState(1);
  const [seriesSheetOpen, setSeriesSheetOpen] = useState(initialSeriesOpen ?? false);
  const [inputSheetOpen, setInputSheetOpen] = useState(initialInputOpen ?? false);
  const [activeInput, setActiveInput] = useState<"weight" | "reps">("weight");
  const [draftValue, setDraftValue] = useState("");
  const [shouldReplace, setShouldReplace] = useState(false);
  const [isGifOpen, setIsGifOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  // Track which set keys triggered a PR for trophy display
  const [prSets, setPrSets] = useState<Set<string>>(new Set());

  // Inline note state (refs only - effects defined after currentBlock)
  const [localNote, setLocalNote] = useState("");
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleNoteChange = (exerciseId: number, value: string | null) => {
    clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      onUpdateNote?.(exerciseId, value);
    }, 800);
  };

  // Task 13: Continue from completion
  const [continuePickerOpen, setContinuePickerOpen] = useState(false);

  // Task 14: Substitution in focus mode
  const [substitutePickerOpen, setSubstitutePickerOpen] = useState(false);
  const [focusDisclaimerShown, setFocusDisclaimerShown] = useState(false);
  const [focusDisclaimerOpen, setFocusDisclaimerOpen] = useState(false);
  const [focusPendingAction, setFocusPendingAction] = useState<(() => void) | null>(null);

  const withFocusDisclaimer = (action: () => void) => {
    if (focusDisclaimerShown) { action(); return; }
    setFocusPendingAction(() => action);
    setFocusDisclaimerOpen(true);
  };

  useEffect(() => {
    if (!isActive) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - elapsedStartRef.current) / 1000) + elapsedPausedRef.current;
      setElapsedTime(elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [isActive]);

  useEffect(() => {
    if (!isGifOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGifOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGifOpen]);

  useEffect(() => {
    if (!isResting || isRestPaused) return;
    const tick = () => {
      if (restEndRef.current <= 0) return;
      const remaining = Math.max(0, Math.ceil((restEndRef.current - Date.now()) / 1000));
      setRestTimer(remaining);
      if (remaining <= 0) {
        notifyRestEnd();
        toast({ title: "Temps de récupération terminé" });
        setIsResting(false);
        setIsRestPaused(false);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isResting, isRestPaused]);

  const workoutPlan = session.items || [];
  const currentExerciseIndex = currentStep - 1;
  const currentBlock =
    currentStep > 0 && currentStep <= workoutPlan.length ? workoutPlan[currentExerciseIndex] : null;
  const currentExerciseDef = currentBlock
    ? exercises.find((e) => e.id === currentBlock.exercise_id)
    : null;
  const nextBlock = currentStep < workoutPlan.length ? workoutPlan[currentStep] : null;
  const nextExerciseDef = nextBlock
    ? exercises.find((e) => e.id === nextBlock.exercise_id)
    : null;
  const muscleTags = (() => {
    const raw =
      (currentExerciseDef as Record<string, unknown> | undefined)?.muscle_groups ??
      (currentExerciseDef as Record<string, unknown> | undefined)?.muscles ??
      (currentExerciseDef as Record<string, unknown> | undefined)?.muscleGroups ??
      [];
    return Array.isArray(raw) ? raw : [];
  })();
  const restDuration = currentBlock?.rest_seconds ?? 0;

  // Sync local note when exercise changes
  useEffect(() => {
    if (currentBlock) {
      setLocalNote(exerciseNotes?.[currentBlock.exercise_id] ?? "");
    }
  }, [currentBlock?.exercise_id, exerciseNotes]);

  const progressPct = workoutPlan.length
    ? Math.min(100, Math.max(0, Math.round(((currentStep - 1) / workoutPlan.length) * 100)))
    : 0;

  const percentValue = Number(currentBlock?.percent_1rm);
  const hasPercent = Number.isFinite(percentValue) && percentValue > 0;
  const rm = hasPercent
    ? oneRMs.find((r) => r.exercise_id === currentBlock?.exercise_id)?.weight || 0
    : 0;
  const targetWeight = hasPercent ? Math.round(rm * (percentValue / 100)) : 0;

  const [currentSetInputs, setCurrentSetInputs] = useState<Record<number, SetInputValues>>({});
  const logLookup = useMemo(() => {
    const map = new Map<string, SetLogEntry>();
    logs.forEach((log: SetLogEntry, index: number) => {
      const setNumber = resolveSetNumber(log, index + 1);
      if (!log.exercise_id) return;
      map.set(`${log.exercise_id}-${setNumber}`, log);
    });
    return map;
  }, [logs]);

  const currentSetKey = currentBlock ? `${currentBlock.exercise_id}-${currentSetIndex}` : null;
  const currentLoggedSet = currentSetKey ? logLookup.get(currentSetKey) : null;
  const activeWeight =
    currentLoggedSet?.weight ?? currentSetInputs[currentSetIndex - 1]?.weight ?? targetWeight;
  const activeReps =
    currentLoggedSet?.reps ??
    currentSetInputs[currentSetIndex - 1]?.reps ??
    currentBlock?.reps ??
    "";

  const launchConfetti = () => {
    if (typeof window === "undefined") return;
    const confettiColors = [
      colors.status.success,
      colors.chart[2],
      colors.chart[3],
      colors.destructive,
      colors.accent,
    ];
    const confettiCount = 120;
    for (let i = 0; i < confettiCount; i += 1) {
      const piece = document.createElement("div");
      const size = Math.random() * 6 + 6;
      piece.style.position = "fixed";
      piece.style.top = "-10px";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.width = `${size}px`;
      piece.style.height = `${size * 0.6}px`;
      piece.style.backgroundColor = confettiColors[i % confettiColors.length];
      piece.style.opacity = "0.9";
      piece.style.pointerEvents = "none";
      piece.style.zIndex = "80";
      piece.style.borderRadius = "2px";
      document.body.appendChild(piece);
      const drift = (Math.random() - 0.5) * 200;
      const duration = 1200 + Math.random() * 800;
      const rotation = Math.random() * 360;
      piece
        .animate(
          [
            { transform: "translate3d(0, 0, 0) rotate(0deg)", opacity: 1 },
            {
              transform: `translate3d(${drift}px, ${window.innerHeight + 200}px, 0) rotate(${rotation}deg)`,
              opacity: 0,
            },
          ],
          { duration, easing: "ease-out" },
        )
        .onfinish = () => piece.remove();
    }
  };

  useEffect(() => {
    // Guard: skip recalculation when a local logging action is in progress
    // to avoid the dual-update race condition that causes set skipping
    if (isLoggingRef.current) {
      if (initialLogs) setLogs(initialLogs);
      return;
    }
    if (!initialLogs) {
      setLogs((prev: SetLogEntry[]) => (prev.length ? [] : prev));
      setCurrentSetInputs((prev: Record<number, SetInputValues>) =>
        Object.keys(prev).length ? {} : prev,
      );
      return;
    }
    setLogs(initialLogs);
    if (!initialLogs.length) {
      setCurrentSetInputs((prev: Record<number, SetInputValues>) =>
        Object.keys(prev).length ? {} : prev,
      );
      // Keep step at 1 (first exercise) when starting fresh — don't reset to 0
      setCurrentStep((prev: number) => (prev >= 1 ? prev : 1));
      return;
    }
    const blocks = session.items || [];
    if (!blocks.length) return;
    const logsByExercise = new Map<number, SetLogEntry[]>();
    initialLogs.forEach((log: SetLogEntry, index: number) => {
      if (!log.exercise_id) return;
      const existing = logsByExercise.get(log.exercise_id) ?? [];
      existing.push({ ...log, set_index: resolveSetNumber(log, index + 1) });
      logsByExercise.set(log.exercise_id, existing);
    });
    const resolvedStep = resolveNextStep(blocks, initialLogs);
    if (resolvedStep > 0 && resolvedStep <= blocks.length) {
      const block = blocks[resolvedStep - 1];
      const existing = logsByExercise.get(block.exercise_id) ?? [];
      const inputs = existing.reduce((acc: Record<number, SetInputValues>, log: SetLogEntry, index: number) => {
        const setNumber = resolveSetNumber(log, index + 1);
        acc[setNumber - 1] = {
          reps: log.reps ?? undefined,
          weight: log.weight ?? undefined,
        };
        return acc;
      }, {});
      setCurrentSetInputs(inputs);
      const nextSetIndex = Math.min(block.sets ?? 1, existing.length + 1);
      setCurrentSetIndex(nextSetIndex);
    } else {
      setCurrentSetInputs({});
      setCurrentSetIndex(1);
    }
    setCurrentStep((prev) => (prev === resolvedStep ? prev : resolvedStep));
  }, [initialLogs, session.items]);

  // Task 15: preload next exercise GIF
  useEffect(() => {
    if (nextExerciseDef?.illustration_gif) {
      const img = new Image();
      img.src = nextExerciseDef.illustration_gif;
    }
  }, [nextExerciseDef?.illustration_gif]);

  useEffect(() => {
    if (currentStep <= workoutPlan.length || hasCelebrated) return;
    launchConfetti();
    setHasCelebrated(true);
  }, [currentStep, workoutPlan.length, hasCelebrated]);

  const updateStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    onStepChange?.(nextStep);
  };

  const startRestTimer = (duration: number, type: "set" | "exercise" = "set") => {
    if (duration <= 0) return;
    restEndRef.current = Date.now() + duration * 1000;
    setRestTimer(duration);
    setRestType(type);
    setIsResting(true);
    setIsRestPaused(false);
  };

  const advanceExercise = async () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const nextStep = currentStep + 1;
    setCurrentSetIndex(1);
    setCurrentSetInputs({});
    updateStep(nextStep);
    const progressPct = Math.round(
      (Math.min(nextStep - 1, workoutPlan.length) / workoutPlan.length) * 100,
    );
    try {
      await onProgress?.(progressPct);
    } catch (err) {
      toast({ title: "Erreur de sauvegarde", description: "Réessayez", variant: "destructive" });
    }
  };

  const handleValidateSet = async () => {
    if (!currentBlock) return;
    if (isLoggingRef.current) return;
    if (currentLoggedSet) {
      if (currentSetIndex >= currentBlock.sets) {
        await advanceExercise();
      } else {
        setCurrentSetIndex((prev) => Math.min(currentBlock.sets, prev + 1));
      }
      return;
    }
    const setDifficulty = currentSetInputs[currentSetIndex - 1]?.difficulty ?? null;
    const newLog = {
      exercise_id: currentBlock.exercise_id,
      set_number: currentSetIndex,
      reps: currentSetInputs[currentSetIndex - 1]?.reps || currentBlock.reps,
      weight: currentSetInputs[currentSetIndex - 1]?.weight ?? targetWeight,
      difficulty: setDifficulty,
    };
    setLogs((prev) => [...prev, newLog]);

    // --- Live PR detection (before async save so toast shows immediately) ---
    const logWeight = Number(newLog.weight);
    const logReps = Number(newLog.reps);
    if (logWeight > 0 && logReps > 0 && !isBodyweight(logWeight)) {
      const currentBest1rm = oneRMs.find((r) => r.exercise_id === currentBlock.exercise_id)?.weight || 0;
      const exName = currentExerciseDef?.nom_exercice ?? "Exercice";
      const pr = detectPR({ weight: logWeight, reps: logReps }, currentBest1rm, exName);
      if (pr) {
        const setKey = `${currentBlock.exercise_id}-${currentSetIndex}`;
        setPrSets((prev) => new Set(prev).add(setKey));
        toast({
          title: "🏆 Nouveau record !",
          description: `1RM estimé : ${pr.newValue}kg (+${pr.improvement}%)`,
        });
      }
    }

    // --- Advance UI state BEFORE async save to avoid intermediate "Série suivante" flash ---
    const isLastSet = currentSetIndex >= currentBlock.sets;
    if (isLastSet) {
      await advanceExercise();
      if (autoRest && currentBlock.rest_seconds > 0) {
        startRestTimer(currentBlock.rest_seconds, "exercise");
      }
    } else {
      if (autoRest && currentBlock.rest_seconds > 0) {
        startRestTimer(currentBlock.rest_seconds, "set");
      }
      setCurrentSetIndex((prev) => Math.min(currentBlock.sets, prev + 1));
    }

    // --- Persist to server (UI already transitioned) ---
    isLoggingRef.current = true;
    try {
      await onLogSets?.([newLog]);
    } catch (err) {
      toast({ title: "Erreur de sauvegarde", description: "Réessayez", variant: "destructive" });
    } finally {
      isLoggingRef.current = false;
    }
  };

  const openInputSheet = (type: "weight" | "reps") => {
    setActiveInput(type);
    const existingValue =
      type === "weight"
        ? currentSetInputs[currentSetIndex - 1]?.weight ?? targetWeight ?? ""
        : currentSetInputs[currentSetIndex - 1]?.reps ?? currentBlock?.reps ?? "";
    setDraftValue(existingValue ? String(existingValue) : "");
    setShouldReplace(Boolean(existingValue));
    setInputSheetOpen(true);
  };

  const applyDraftValue = () => {
    if (!currentBlock) return;
    const parsed =
      activeInput === "weight"
        ? Number(draftValue.replace(",", "."))
        : Number(draftValue);
    if (!Number.isFinite(parsed)) return;
    // Bounds: weight ∈ [0, 1000] kg (BODYWEIGHT_SENTINEL handled upstream),
    // reps ∈ [1, 200]. Absurd values are silently rejected — the keypad
    // already prevents most malformed input but this catches overflow typos.
    if (activeInput === "weight" && (parsed < 0 || parsed > 1000)) return;
    if (activeInput === "reps" && (parsed < 1 || parsed > 200)) return;
    setCurrentSetInputs((prev: Record<number, SetInputValues>) => ({
      ...prev,
      [currentSetIndex - 1]: {
        ...prev[currentSetIndex - 1],
        [activeInput]: parsed,
      },
    }));
    setInputSheetOpen(false);
  };

  const appendDraft = (value: string) => {
    if (shouldReplace || draftValue === String(BODYWEIGHT_SENTINEL)) {
      setShouldReplace(false);
      setDraftValue(value);
      return;
    }
    setDraftValue((prev) => {
      if (value === "." && prev.includes(".")) {
        return prev;
      }
      return prev + value;
    });
  };

  const selectInputType = (type: "weight" | "reps") => {
    if (!currentBlock) return;
    // Save current draft before switching input type and compute updated inputs
    let updatedInputs = currentSetInputs;
    if (draftValue) {
      let valueToSave: number | undefined;
      if (activeInput === "weight" && draftValue === String(BODYWEIGHT_SENTINEL)) {
        valueToSave = BODYWEIGHT_SENTINEL;
      } else {
        const parsed =
          activeInput === "weight"
            ? Number(draftValue.replace(",", "."))
            : Number(draftValue);
        if (Number.isFinite(parsed)) {
          valueToSave = parsed;
        }
      }
      if (valueToSave !== undefined) {
        updatedInputs = {
          ...currentSetInputs,
          [currentSetIndex - 1]: {
            ...currentSetInputs[currentSetIndex - 1],
            [activeInput]: valueToSave,
          },
        };
        setCurrentSetInputs(updatedInputs);
      }
    }
    setActiveInput(type);
    // Use updatedInputs (which includes the just-saved value) to load the next field
    const nextValue =
      type === "weight"
        ? updatedInputs[currentSetIndex - 1]?.weight ?? targetWeight ?? ""
        : updatedInputs[currentSetIndex - 1]?.reps ?? currentBlock?.reps ?? "";
    setDraftValue(nextValue ? String(nextValue) : "");
    setShouldReplace(Boolean(nextValue));
  };

  if (currentStep > workoutPlan.length) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <Card className="border-t-8 border-t-primary shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit mb-4">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-3xl uppercase font-display italic">Séance Terminée !</CardTitle>
            <CardDescription className="text-lg">
              Durée totale: {Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs uppercase font-bold text-muted-foreground">Volume</div>
                <div className="text-2xl font-mono font-bold">
                  {logs.reduce((acc, l) => acc + (isBodyweight(l.weight) ? 0 : (Number(l.weight) || 0) * (Number(l.reps) || 0)), 0).toLocaleString("fr-FR")} kg
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs uppercase font-bold text-muted-foreground">Séries</div>
                <div className="text-2xl font-mono font-bold">{logs.length}</div>
              </div>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full rounded-2xl h-12"
                onClick={() => setContinuePickerOpen(true)}
              >
                + Continuer — ajouter des exercices
              </Button>
            </div>

            <div className="space-y-3">
              <Label className="uppercase font-bold text-xs text-muted-foreground">
                Difficulté de la séance
              </Label>
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Facile</span>
                <span>Très dur</span>
              </div>
              <ScaleSelector5 value={difficulty} onChange={setDifficulty} />
            </div>
            <div className="space-y-3">
              <Label className="uppercase font-bold text-xs text-muted-foreground">
                Fatigue fin de séance
              </Label>
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Frais</span>
                <span>Épuisé</span>
              </div>
              <ScaleSelector5 value={fatigue} onChange={setFatigue} />
            </div>
            <div className="space-y-2">
              <Label className="uppercase font-bold text-xs text-muted-foreground">Notes</Label>
              <textarea
                placeholder="Sensations, douleurs..."
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                rows={3}
                maxLength={2000}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full h-14 text-lg font-bold uppercase"
              disabled={isFinishing}
              onClick={() => {
                if (isFinishing) return;
                onFinish({
                  duration: Math.floor(elapsedTime / 60),
                  feeling: difficulty,
                  fatigue,
                  comments,
                  logs,
                });
              }}
            >
              {isFinishing ? "ENREGISTREMENT..." : "ENREGISTRER & FERMER"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-44">
      {/* Exit bar */}
      {onExitFocus && (
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 backdrop-blur px-4 py-2 border-b">
          <button
            type="button"
            onClick={() => {
              if (logs.length > 0) {
                setExitConfirmOpen(true);
              } else {
                onExitFocus();
              }
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Quitter
          </button>
        </div>
      )}
      <div className="space-y-3">
        {/* Ligne 1 : GIF + titre + note + exit */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Voir l'animation de l'exercice"
            onClick={() => {
              if (!currentExerciseDef?.illustration_gif) return;
              setIsGifOpen(true);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-card shadow-sm"
          >
            {currentExerciseDef?.illustration_gif ? (
              <img
                src={currentExerciseDef.illustration_gif}
                alt=""
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <Dumbbell className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
          <h2 className="flex-1 min-w-0 text-lg font-semibold tracking-tight truncate">
            {currentExerciseDef?.nom_exercice ?? "Exercice"}
          </h2>
          <div className={cn(
            "h-2 w-2 shrink-0 rounded-full transition-colors",
            isOnline ? "bg-emerald-500" : "bg-red-500"
          )} aria-label={isOnline ? "En ligne" : "Hors ligne"} />
          {onSubstitute && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
              onClick={() => withFocusDisclaimer(() => setSubstitutePickerOpen(true))}
              aria-label="Remplacer l'exercice"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {onExitFocus && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Quitter le focus"
              onClick={() => {
                if (logs.length > 0) {
                  setExitConfirmOpen(true);
                } else {
                  onExitFocus();
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Inline note input */}
        {onUpdateNote && currentBlock && (
          <div className="-mt-0.5 flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/30 px-2.5 py-1.5">
            <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <input
              type="text"
              value={localNote}
              onChange={(e) => {
                setLocalNote(e.target.value);
                handleNoteChange(currentBlock.exercise_id, e.target.value || null);
              }}
              placeholder="Note : réglages machine, repères..."
              maxLength={500}
              className="w-full bg-transparent text-xs italic text-muted-foreground placeholder:text-muted-foreground/50 border-none outline-none focus:text-foreground"
            />
          </div>
        )}
        {/* Ligne 2 : badges + progress */}
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-bold shrink-0">
            Ex {currentStep}/{workoutPlan.length}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold shrink-0">
            S {currentSetIndex}/{formatStrengthValue(currentBlock?.sets)}
          </span>
          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground shrink-0">{progressPct}%</span>
        </div>
        {/* Muscle tags */}
        {muscleTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {muscleTags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <Card className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            Série {currentSetIndex}/{formatStrengthValue(currentBlock?.sets)} · {formatStrengthValue(currentBlock?.reps)} reps
            {currentSetKey && prSets.has(currentSetKey) && (
              <Trophy className="h-4 w-4 text-amber-500" aria-label="Record personnel" />
            )}
          </div>
          {restDuration > 0 && (
            <span className="text-xs text-muted-foreground">
              Repos {restDuration}s
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="group relative rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-muted/30 p-4 text-left shadow-sm transition-all active:scale-[0.98] hover:border-primary/40 hover:shadow-md"
            onClick={() => openInputSheet("weight")}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Charge</div>
            <div className="mt-1 flex items-baseline gap-0.5">
              {isBodyweight(activeWeight) ? (
                <span className="text-2xl font-bold tracking-tight">PDC</span>
              ) : (
                <>
                  <span className="text-3xl font-bold tabular-nums tracking-tight">
                    {activeWeight || "—"}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">kg</span>
                </>
              )}
            </div>
          </button>
          <button
            type="button"
            className="group relative rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-muted/30 p-4 text-left shadow-sm transition-all active:scale-[0.98] hover:border-primary/40 hover:shadow-md"
            onClick={() => openInputSheet("reps")}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Reps</div>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                {activeReps || "—"}
              </span>
              <span className="text-sm font-medium text-muted-foreground">reps</span>
            </div>
          </button>
        </div>
        {/* Optional difficulty selector (1-5) */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Difficulté</span>
          <div className="flex gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((level) => {
              const selected = currentSetInputs[currentSetIndex - 1]?.difficulty === level;
              const colorClass = level <= 2
                ? "bg-emerald-500 text-white border-emerald-500"
                : level === 3
                  ? "bg-amber-400 text-white border-amber-400"
                  : level === 4
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-red-500 text-white border-red-500";
              return (
                <button
                  key={level}
                  type="button"
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                    selected
                      ? colorClass
                      : "border-muted-foreground/25 bg-muted/30 text-muted-foreground/60",
                  )}
                  onClick={() =>
                    setCurrentSetInputs((prev: Record<number, SetInputValues>) => ({
                      ...prev,
                      [currentSetIndex - 1]: {
                        ...prev[currentSetIndex - 1],
                        difficulty: selected ? null : level,
                      },
                    }))
                  }
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {(currentBlock?.notes || currentExerciseDef?.description) && (
        <div className="rounded-2xl border bg-muted/10 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-muted-foreground">
            {currentBlock?.notes || currentExerciseDef?.description}
          </p>
        </div>
      )}
      <Button variant="outline" className="w-full rounded-2xl" onClick={() => setSeriesSheetOpen(true)}>
        Voir les séries
      </Button>

      {!inputSheetOpen && !isResting ? (
        <BottomActionBar
          className="bottom-0 z-modal"
          containerClassName="flex-col gap-2 py-4"
        >
          <Button
            className="w-full h-14 rounded-2xl text-base font-bold shadow-lg active:scale-[0.97] transition-transform"
            onClick={handleValidateSet}
          >
            <Check className="mr-2 h-5 w-5" />
            {currentLoggedSet ? "Série suivante" : "Valider série"}
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground font-medium py-1 active:text-foreground transition-colors"
            onClick={() => advanceExercise()}
          >
            Passer cet exercice
          </button>
        </BottomActionBar>
      ) : null}

      {isResting && (
        <RestScreen
          restTimer={restTimer}
          restDuration={restDuration}
          restType={restType}
          exercise={currentExerciseDef ?? null}
          block={currentBlock}
          nextExercise={nextExerciseDef ?? null}
          nextBlock={nextBlock}
          targetWeight={targetWeight}
          muscleTags={muscleTags}
          note={exerciseNotes?.[currentBlock?.exercise_id ?? -1] ?? null}
          athleteNote={exerciseNotes?.[currentBlock?.exercise_id ?? -1] ?? ""}
          exerciseId={currentBlock?.exercise_id ?? -1}
          onUpdateNote={onUpdateNote}
          items={workoutPlan}
          logs={logs}
          exercises={exercises}
          currentStep={currentStep}
          progressPct={progressPct}
          oneRmWeight={rm}
          percentOneRm={hasPercent ? percentValue : 0}
          currentSetIndex={currentSetIndex}
          totalSets={currentBlock?.sets ?? 0}
          restSecondsPerSet={currentBlock?.rest_seconds ?? 0}
          restSecondsPerExercise={currentBlock?.rest_seconds ?? 0}
          userId={userId}
          onClose={() => { setIsResting(false); setIsRestPaused(false); }}
          onSkip={() => {
            restEndRef.current = 0;
            setIsResting(false);
            setRestTimer(0);
            setIsRestPaused(false);
          }}
          onAdd30s={() => {
            restEndRef.current += 30 * 1000;
            setRestTimer((prev) => prev + 30);
          }}
        />
      )}

      {isGifOpen && currentExerciseDef?.illustration_gif && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setIsGifOpen(false)}
        >
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative">
              <button
                type="button"
                aria-label="Fermer"
                className="absolute -right-3 -top-3 rounded-full bg-background p-2 shadow"
                onClick={() => setIsGifOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={currentExerciseDef.illustration_gif}
                alt=""
                className="max-h-[80dvh] w-auto max-w-[92vw] rounded-2xl"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}

      <Sheet open={seriesSheetOpen} onOpenChange={setSeriesSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Aperçu séance</SheetTitle>
          </SheetHeader>
          <div
            className="mt-4 space-y-2 overflow-y-auto overscroll-contain pb-8"
            style={{ maxHeight: "calc(80vh - 5rem)", WebkitOverflowScrolling: "touch" }}
          >
            {workoutPlan.map((item, index) => {
              const exercise = exercises.find((ex) => ex.id === item.exercise_id);
              const loggedSets = Array.from({ length: item.sets }).filter((_, setIndex) =>
                logLookup.get(`${item.exercise_id}-${setIndex + 1}`),
              ).length;
              const isActive = index === currentExerciseIndex;
              const isDone = loggedSets >= item.sets;
              return (
                <div
                  key={`${item.exercise_id}-${index}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    isActive && "border-primary bg-primary/5",
                    isDone && !isActive && "opacity-50",
                  )}
                >
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {exercise?.nom_exercice ?? item.exercise_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatStrengthValue(item.sets)}×{formatStrengthValue(item.reps)}
                    </p>
                  </div>
                  {Array.from({ length: item.sets }).some((_, si) =>
                    prSets.has(`${item.exercise_id}-${si + 1}`)
                  ) && (
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                  <span className="text-xs font-mono font-semibold text-muted-foreground shrink-0">
                    {loggedSets}/{formatStrengthValue(item.sets)}
                  </span>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Input Bottom Sheet - Mobile-first numpad */}
      <Drawer open={inputSheetOpen} onOpenChange={setInputSheetOpen}>
        <DrawerContent className="max-h-[90dvh]">
          <div className="mx-auto w-full max-w-md px-4 pb-8">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-center">
                {activeInput === "weight" ? "Charge" : "Répétitions"}
              </DrawerTitle>
              <DrawerDescription className="text-center">
                Série {currentSetIndex}/{formatStrengthValue(currentBlock?.sets)} · Objectif{" "}
                {formatStrengthValue(currentBlock?.reps)} reps
              </DrawerDescription>
            </DrawerHeader>

            {/* Toggle between weight/reps */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                className={cn(
                  "rounded-xl border-2 p-4 text-center transition-all",
                  activeInput === "weight"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-muted bg-card hover:border-muted-foreground/30"
                )}
                onClick={() => selectInputType("weight")}
              >
                <div className="text-xs font-semibold uppercase text-muted-foreground">Charge</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {(() => {
                    const displayVal = activeInput === "weight"
                      ? draftValue
                      : String(currentSetInputs[currentSetIndex - 1]?.weight ?? targetWeight ?? "");
                    if (displayVal === String(BODYWEIGHT_SENTINEL)) return "PDC";
                    return (
                      <>
                        {displayVal || "—"}
                        <span className="ml-1 text-base font-normal text-muted-foreground">kg</span>
                      </>
                    );
                  })()}
                </div>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-xl border-2 p-4 text-center transition-all",
                  activeInput === "reps"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-muted bg-card hover:border-muted-foreground/30"
                )}
                onClick={() => selectInputType("reps")}
              >
                <div className="text-xs font-semibold uppercase text-muted-foreground">Reps</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {activeInput === "reps"
                    ? draftValue || "—"
                    : String(currentSetInputs[currentSetIndex - 1]?.reps ?? currentBlock?.reps ?? "—")}
                  <span className="ml-1 text-base font-normal text-muted-foreground">reps</span>
                </div>
              </button>
            </div>

            {/* Quick suggestions for weight */}
            {activeInput === "weight" && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Suggestions</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={draftValue === String(BODYWEIGHT_SENTINEL) ? "default" : "outline"}
                    size="sm"
                    className="rounded-full px-4 h-10 text-sm font-semibold"
                    onClick={() => setDraftValue(String(BODYWEIGHT_SENTINEL))}
                  >
                    PDC
                  </Button>
                  {targetWeight > 0 && [
                    targetWeight - 10,
                    targetWeight - 5,
                    targetWeight,
                    targetWeight + 5,
                    targetWeight + 10,
                  ]
                    .filter((v) => v > 0)
                    .map((v) => (
                      <Button
                        key={v}
                        variant={Number(draftValue) === v ? "default" : "outline"}
                        size="sm"
                        className="rounded-full px-4 h-10 text-sm font-semibold"
                        onClick={() => setDraftValue(String(v))}
                      >
                        {v} kg
                      </Button>
                    ))}
                </div>
              </div>
            )}

            {/* Quick suggestions for reps */}
            {activeInput === "reps" && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Suggestions</div>
                <div className="flex flex-wrap gap-2">
                  {[6, 8, 10, 12, 15, 20].map((v) => (
                    <Button
                      key={v}
                      variant={Number(draftValue) === v ? "default" : "outline"}
                      size="sm"
                      className="rounded-full px-4 h-10 text-sm font-semibold"
                      onClick={() => setDraftValue(String(v))}
                    >
                      {v}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Large numpad - mobile optimized */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant="outline"
                  className="h-14 text-xl font-semibold rounded-xl active:scale-95 transition-transform"
                  onClick={() => appendDraft(String(num))}
                >
                  {num}
                </Button>
              ))}
              <Button
                variant="outline"
                className="h-14 text-xl font-semibold rounded-xl active:scale-95 transition-transform"
                onClick={() => appendDraft(".")}
              >
                ,
              </Button>
              <Button
                variant="outline"
                className="h-14 text-xl font-semibold rounded-xl active:scale-95 transition-transform"
                onClick={() => appendDraft("0")}
              >
                0
              </Button>
              <Button
                variant="outline"
                className="h-14 text-xl font-semibold rounded-xl active:scale-95 transition-transform"
                onClick={() => { setShouldReplace(false); setDraftValue((prev) => prev.slice(0, -1)); }}
              >
                ⌫
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-14 text-base font-semibold rounded-xl"
                onClick={() => { setShouldReplace(false); setDraftValue(""); }}
              >
                Effacer
              </Button>
              <Button
                className="flex-1 h-14 text-base font-semibold rounded-xl"
                onClick={applyDraftValue}
              >
                <Check className="mr-2 h-5 w-5" />
                Valider
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {onExitFocus && (
        <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Quitter la séance ?</AlertDialogTitle>
              <AlertDialogDescription>
                Les séries enregistrées seront conservées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setExitConfirmOpen(false); onExitFocus(); }}>
                Quitter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Task 13: Continue picker from completion */}
      {onAddExercise && (
        <ExercisePicker
          open={continuePickerOpen}
          onOpenChange={setContinuePickerOpen}
          exercises={exercises}
          onSelect={(exercise) => {
            onAddExercise(exercise);
            setHasCelebrated(false);
            updateStep(workoutPlan.length + 1);
          }}
          title="Ajouter un exercice"
        />
      )}

      {/* Task 14: Substitute picker in focus mode */}
      {onSubstitute && (
        <ExercisePicker
          open={substitutePickerOpen}
          onOpenChange={setSubstitutePickerOpen}
          exercises={exercises}
          onSelect={(exercise) => onSubstitute(currentExerciseIndex, exercise)}
          title="Remplacer l'exercice"
        />
      )}

      <AlertDialog open={focusDisclaimerOpen} onOpenChange={setFocusDisclaimerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attention</AlertDialogTitle>
            <AlertDialogDescription>
              Toute modification se fait sous ta responsabilité. Le coach aura accès à la séance réelle effectuée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFocusPendingAction(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setFocusDisclaimerShown(true);
              setFocusDisclaimerOpen(false);
              focusPendingAction?.();
              setFocusPendingAction(null);
            }}>
              J'ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

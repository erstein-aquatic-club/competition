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
  Flame,
  RefreshCw,
  RotateCcw,
  StickyNote,
  Trophy,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { BottomActionBar } from "@/components/shared/BottomActionBar";
import { ScaleSelector5 } from "@/components/shared/ScaleSelector5";
import { ExercisePicker } from "@/components/strength/ExercisePicker";
import { ExerciseGif } from "@/components/strength/ExerciseGif";
import { RestScreen } from "./RestScreen";
import { SetRow } from "./SetRow";
import { BLOCK_STYLES } from "@/lib/strength/blockStyles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { colors } from "@/lib/design-tokens";
import type { Exercise, StrengthSessionTemplate } from "@/lib/api";
import { BODYWEIGHT_SENTINEL, isBodyweight } from "@/lib/api/client";
import { INTENSITY_METRICS, type IntensityMetric } from "@/lib/strength/intensityMetrics";
import type { SetLogEntry, OneRmEntry, WorkoutFinishData, SetInputValues } from "@/lib/types";
import { detectPR } from "@/lib/prDetection";
import { saveDraft, loadDraft, clearDraft } from "@/lib/unsavedDraftStore";
import { OneRmDiscoveryWizard } from "@/components/strength/OneRmDiscoveryWizard";
import { isNegativeValidation, adjustOneRmDown } from "@/lib/strength/oneRmCalibration";

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

/**
 * §367 — Détecte le changement de chapitre (warmup → main) entre deux pas
 * successifs du runner.
 *
 * Retourne le nouveau bloc si on change de chapitre, `null` sinon.
 * `fromStep === 0` signifie le tout début de séance : on retourne directement
 * le bloc du pas de destination (utile pour afficher l'en-tête dès le premier
 * item, qu'il soit warmup ou main).
 */
export const detectBlockChapter = (
  items: StrengthSessionTemplate["items"],
  fromStep: number,
  toStep: number,
): "warmup" | "main" | null => {
  if (!items || items.length === 0 || toStep < 1 || toStep > items.length) {
    return null;
  }
  const toBlock = items[toStep - 1].block ?? "main";
  if (fromStep === 0) {
    return toBlock;
  }
  if (fromStep < 1 || fromStep > items.length) {
    return null;
  }
  const fromBlock = items[fromStep - 1].block ?? "main";
  return fromBlock !== toBlock ? toBlock : null;
};

/**
 * §367 — Retourne le numéro de pas (1-based) du premier item appartenant au
 * bloc `main`. Si aucun item n'est `main`, retourne `items.length + 1`.
 */
export const findFirstMainStep = (
  items: StrengthSessionTemplate["items"],
): number => {
  if (!items || items.length === 0) return 1;
  const idx = items.findIndex((item) => (item.block ?? "main") === "main");
  return idx === -1 ? items.length + 1 : idx + 1;
};

// Task 8 — RIR neutre injecté dans la validation post-série-2 : la série 2 ne
// capte pas le RIR (≠ le wizard), donc on passe une valeur neutre pour que SEULS
// la douleur, le déficit de reps et la difficulté pilotent la négativité.
const NEUTRAL_RIR = 3;

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
  runId,
  inlineEstimationExercises,
  firstTimeExercises,
  onRequestRecalc,
  onEstimationComplete,
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
  /** When provided, in-progress finish-form state (difficulty/fatigue/comments)
   *  is persisted to localStorage so the swimmer can recover after an iOS
   *  PWA background-kill or accidental tab close. */
  runId?: string | number | null;
  /** §297 — Set d'exercise_ids dont la série 1 doit ouvrir le mode estimation
   *  ramp-up (calcul 1RM à partir d'une série de référence). Le runner retire
   *  l'exo du Set parent via onEstimationComplete. */
  inlineEstimationExercises?: Set<number>;
  /** Task 8 — exercise_ids jamais réalisés par ce nageur : la série 1 ouvre le
   *  wizard de calibration COMPLET (mouvement à vide → paliers → série de travail).
   *  Si l'exo est seulement en recalc (1RM manquante mais déjà réalisé), il passe
   *  par `inlineEstimationExercises` → wizard en mode court (série de travail seule). */
  firstTimeExercises?: Set<number>;
  onRequestRecalc?: (exerciseId: number) => void;
  onEstimationComplete?: (exerciseId: number, estimatedOneRm: number) => Promise<void>;
}) {
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
  const [skipExerciseConfirmOpen, setSkipExerciseConfirmOpen] = useState(false);
  const [chapterBlock, setChapterBlock] = useState<"warmup" | "main" | null>(null);
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

  // Task 8 — calibration 1RM (wizard).
  // `calibrationDismissed` : exos pour lesquels le nageur a choisi « Alléger »
  //   dans la branche douleur → on masque le wizard pour CE run et on le laisse
  //   logger normalement à une charge auto-choisie (aucune 1RM calculée).
  const [calibrationDismissed, setCalibrationDismissed] = useState<Set<number>>(new Set());
  // `calibratedThisRun` : exos passés par le wizard pendant CE run → 1RM calculée à
  //   la série 1 (Map exerciseId → oneRm). Déclenche la carte de validation
  //   post-série-2 (qualité > charge) ET fournit la 1RM LOCALE fraîche pour le −10 %
  //   (le prop `oneRMs` peut être périmé/non propagé à la fin de la série 2).
  const [calibratedThisRun, setCalibratedThisRun] = useState<Map<number, number>>(new Map());
  // Validation post-série-2 (Task 8 Commit 2). Capture la série 2 d'un exo calibré
  // (reps réalisées / cible / 1RM courante) pour piloter isNegativeValidation, +
  // état de la carte (douleur, ressenti charge). Non bloquante, une fois par exo/run.
  const [validation, setValidation] = useState<{
    exerciseId: number;
    repsDone: number;
    repsTarget: number;
    difficulty: number | null;
    currentOneRm: number;
  } | null>(null);
  const [validationPain, setValidationPain] = useState<boolean | null>(null);
  const [validationLoadFeel, setValidationLoadFeel] = useState<"light" | "right" | "heavy" | null>(null);
  // Exos dont la carte de validation a déjà été montrée ce run (évite la réapparition).
  const [validationShownFor, setValidationShownFor] = useState<Set<number>>(new Set());

  // Task 14: Substitution in focus mode
  const [substitutePickerOpen, setSubstitutePickerOpen] = useState(false);
  const [focusDisclaimerShown, setFocusDisclaimerShown] = useState(false);
  const [focusDisclaimerOpen, setFocusDisclaimerOpen] = useState(false);
  const [focusPendingAction, setFocusPendingAction] = useState<(() => void) | null>(null);

  const chapterShownRef = useRef(false);

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
        toast("Temps de récupération terminé");
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
  const isBodyweightExercise = currentExerciseDef?.is_bodyweight === true;
  // §298 — métrique d'intensité de l'exo courant (pilote tile/numpad/gating 1RM)
  const metric = (currentExerciseDef?.intensity_metric ?? "weight_kg") as IntensityMetric;
  const metricCfg = INTENSITY_METRICS[metric];
  const tracksWeight = metric === "weight_kg";
  // Task 8 — le wizard de calibration remplace l'ancien mode estimation §297.
  //   isFirstTime           : jamais réalisé → wizard COMPLET (à vide → paliers → travail).
  //   needsShortCalibration : 1RM manquante / recalc demandé mais déjà réalisé → wizard COURT.
  //   showWizard            : série 1, exo chargé, pas encore allégé (branche douleur) ce run.
  const currentExerciseId = currentBlock?.exercise_id ?? -1;
  const isFirstTime = firstTimeExercises?.has(currentExerciseId) ?? false;
  const needsShortCalibration = inlineEstimationExercises?.has(currentExerciseId) ?? false;
  const showWizard =
    currentSetIndex === 1 &&
    !isBodyweightExercise &&
    (isFirstTime || needsShortCalibration) &&
    !calibrationDismissed.has(currentExerciseId);

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
  const firstMainStep = useMemo(() => findFirstMainStep(workoutPlan), [workoutPlan]);

  const percentValue = Number(currentBlock?.percent_1rm);
  const hasPercent = Number.isFinite(percentValue) && percentValue > 0;
  const rm = hasPercent
    ? oneRMs.find((r) => r.exercise_id === currentBlock?.exercise_id)?.weight || 0
    : 0;
  const targetWeight = hasPercent ? Math.round(rm * (percentValue / 100)) : 0;
  // §298 — métriques non-poids : cible depuis l'item (target_intensity), pas le 1RM
  const targetValue = tracksWeight ? targetWeight : Number(currentBlock?.target_intensity ?? 0);

  const [currentSetInputs, setCurrentSetInputs] = useState<Record<number, SetInputValues>>({});

  // --- Unsaved draft resilience -------------------------------------------
  // Persists `difficulty` / `fatigue` / `comments` / `currentSetInputs`
  // (in-progress values) under `eac_draft:workout_runner:<runId>` so an
  // iOS PWA background-kill doesn't erase finish-form notes or the
  // partially-typed weight/reps for the active set. Logs themselves are
  // already persisted by the parent via `onLogSets` → localStorage.
  const draftKey = runId != null && runId !== "" ? `workout_runner:${runId}` : null;
  const draftRestoredRef = useRef(false);
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // On mount: offer to restore if a snapshot exists for this run.
  useEffect(() => {
    if (!draftKey || draftRestoredRef.current) return;
    type WorkoutDraft = {
      difficulty: number;
      fatigue: number;
      comments: string;
      currentSetInputs: Record<number, SetInputValues>;
      /** R4 (§343) — epoch ms du début de séance, pour une durée totale juste après kill+reprise. */
      startedAt?: number;
    };
    const draft = loadDraft<WorkoutDraft>(draftKey);
    if (!draft) return;
    draftRestoredRef.current = true;
    const payload = draft.payload ?? ({} as WorkoutDraft);
    const hasContent =
      (payload.comments && payload.comments.length > 0) ||
      (payload.currentSetInputs &&
        Object.keys(payload.currentSetInputs).length > 0) ||
      // R3 (§343) — une note de ressenti seule (difficulté/fatigue ≠ défaut 3)
      // compte comme contenu à restaurer (sinon perdue au kill PWA).
      (typeof payload.difficulty === "number" && payload.difficulty !== 3) ||
      (typeof payload.fatigue === "number" && payload.fatigue !== 3);
    if (!hasContent) {
      clearDraft(draftKey);
      return;
    }
    toast("Brouillon retrouvé", { description: "Une saisie non enregistrée a été restaurée." });
    if (typeof payload.difficulty === "number") setDifficulty(payload.difficulty);
    if (typeof payload.fatigue === "number") setFatigue(payload.fatigue);
    if (typeof payload.comments === "string") setComments(payload.comments);
    if (payload.currentSetInputs && typeof payload.currentSetInputs === "object") {
      setCurrentSetInputs(payload.currentSetInputs);
    }
    // R4 (§343) — reprend le chrono au vrai départ (sinon `elapsedStartRef` remis
    // à `Date.now()` au remount → durée totale fausse, ~5 min au lieu de ~45).
    if (typeof payload.startedAt === "number" && payload.startedAt > 0) {
      elapsedStartRef.current = payload.startedAt;
    }
  }, [draftKey, toast]);

  // Debounced save on meaningful state changes.
  useEffect(() => {
    if (!draftKey) return;
    clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      saveDraft(draftKey, {
        difficulty,
        fatigue,
        comments,
        currentSetInputs,
        startedAt: elapsedStartRef.current, // R4 (§343)
      });
    }, 500);
    return () => clearTimeout(draftDebounceRef.current);
  }, [draftKey, difficulty, fatigue, comments, currentSetInputs]);

  // Synchronous flush on tab hide / pagehide / beforeunload.
  useEffect(() => {
    if (!draftKey) return;
    const flush = () => {
      saveDraft(draftKey, {
        difficulty,
        fatigue,
        comments,
        currentSetInputs,
        startedAt: elapsedStartRef.current, // R4 (§343)
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [draftKey, difficulty, fatigue, comments, currentSetInputs]);

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
    currentLoggedSet?.weight ?? currentSetInputs[currentSetIndex - 1]?.weight ?? targetValue;
  const activeReps =
    currentLoggedSet?.reps ??
    currentSetInputs[currentSetIndex - 1]?.reps ??
    currentBlock?.reps ??
    "";

  const launchConfetti = () => {
    if (typeof window === "undefined") return;
    // UX4 (§343) — respecte `prefers-reduced-motion` (les autres animations le
    // font déjà via framer-motion ; les confettis sont en `element.animate()`).
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
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

  useEffect(() => {
    if (chapterShownRef.current) return;
    if (!workoutPlan.length) return;
    if (currentStep !== 1 || (Array.isArray(initialLogs) && initialLogs.length > 0)) return;
    const chapter = detectBlockChapter(workoutPlan, 0, 1);
    if (chapter) {
      chapterShownRef.current = true;
      setChapterBlock(chapter);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const advanceExercise = async (skipChapter?: boolean) => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    const nextStep = currentStep + 1;

    if (!skipChapter && nextStep <= workoutPlan.length) {
      const chapter = detectBlockChapter(workoutPlan, currentStep, nextStep);
      if (chapter) {
        setCurrentSetIndex(1);
        setCurrentSetInputs({});
        updateStep(nextStep);
        setChapterBlock(chapter);
        const progressPct = Math.round(
          (Math.min(nextStep - 1, workoutPlan.length) / workoutPlan.length) * 100,
        );
        try {
          await onProgress?.(progressPct);
        } catch (_err) {
          toast.error("Erreur de sauvegarde", {
            description: "Progression non enregistrée. Réseau instable.",
            action: { label: "Réessayer", onClick: () => void onProgress?.(progressPct) },
          });
        }
        return;
      }
    }

    setCurrentSetIndex(1);
    setCurrentSetInputs({});
    updateStep(nextStep);
    const progressPct = Math.round(
      (Math.min(nextStep - 1, workoutPlan.length) / workoutPlan.length) * 100,
    );
    try {
      await onProgress?.(progressPct);
    } catch (_err) {
      toast.error("Erreur de sauvegarde", {
        description: "Progression non enregistrée. Réseau instable.",
        action: { label: "Réessayer", onClick: () => void onProgress?.(progressPct) },
      });
    }
  };

  // Task 8 — fin du wizard de calibration : persiste la 1RM calculée puis logge la
  // série de travail comme série 1. Reprend EXACTEMENT la séquence de l'ancien
  // §297 handleReferenceSet (garde isLoggingRef, log set_number:1, avance série 2,
  // démarrage repos), wizard en source de la charge/reps au lieu du numpad.
  const handleWizardComputed = async (
    oneRm: number,
    workingSet: { weight: number; reps: number; rir: number; pain: boolean },
  ) => {
    if (!currentBlock) return;
    // R1 — anti double-tap concurrent (même garde que handleValidateSet).
    if (isLoggingRef.current) return;
    const exerciseId = currentBlock.exercise_id;

    isLoggingRef.current = true;
    try {
      // Persiste le 1RM côté parent (Strength.tsx → update1RM + invalidate query).
      try {
        await onEstimationComplete?.(exerciseId, oneRm);
      } catch {
        toast.error("Erreur", { description: "1RM non sauvegardé. Réessaye." });
        return;
      }

      // Douleur signalée pendant la calibration → marqueur dans la note de l'exo
      // (sans écraser la note existante).
      if (workingSet.pain) {
        const existing = exerciseNotes?.[exerciseId] ?? "";
        const marker = "⚠️ douleur signalée (calibration)";
        const merged = existing ? `${existing}\n${marker}` : marker;
        onUpdateNote?.(exerciseId, merged);
      }

      // Logge la série de travail comme série 1 standard (difficulty null : le
      // wizard capte le RIR, pas l'échelle 1-5).
      const newLog: SetLogEntry = {
        exercise_id: exerciseId,
        set_number: 1,
        reps: workingSet.reps,
        weight: workingSet.weight,
        difficulty: null,
      };
      setLogs((prev) => [...prev, newLog]);
      await onLogSets?.([newLog]);

      // Mémorise la 1RM LOCALE fraîche (exerciseId → oneRm) → déclenche la
      // validation post-série-2 ET sert d'ancrage au −10 % (sans dépendre du
      // prop `oneRMs` qui peut ne pas être encore propagé).
      setCalibratedThisRun((prev) => new Map(prev).set(exerciseId, oneRm));

      setCurrentSetInputs({});
      setCurrentSetIndex(2);

      if (autoRest && currentBlock.rest_seconds > 0) {
        startRestTimer(currentBlock.rest_seconds, "set");
      }
    } finally {
      isLoggingRef.current = false;
    }
  };

  // Task 8 — branche sécurité du wizard (douleur signalée).
  const handlePainAbort = (action: "lighten" | "substitute" | "skip") => {
    const exerciseId = currentBlock?.exercise_id ?? -1;
    if (action === "substitute") {
      if (onSubstitute) setSubstitutePickerOpen(true);
      return;
    }
    if (action === "skip") {
      void advanceExercise();
      return;
    }
    // "lighten" : on masque le wizard pour cet exo ce run → carte de série normale,
    // le nageur choisit lui-même une charge légère. Aucune 1RM calculée.
    setCalibrationDismissed((prev) => {
      const next = new Set(prev);
      next.add(exerciseId);
      return next;
    });
  };

  const handleValidateSet = async () => {
    if (!currentBlock) return;
    if (isLoggingRef.current) return;
    // Defensive guard against a substitute → validate race: when session.items
    // is swapped under us, currentSetIndex can briefly point past the new
    // exercise's set count before the useEffect resets it. Validating in that
    // window would write a phantom log at a stale set_index and immediately
    // skip the new exercise. Bail out instead — the next render reconciles.
    const blockSets = currentBlock.sets ?? 0;
    if (blockSets > 0 && currentSetIndex > blockSets) return;
    if (currentLoggedSet) {
      if (currentSetIndex >= currentBlock.sets) {
        await advanceExercise();
      } else {
        setCurrentSetIndex((prev) => Math.min(currentBlock.sets, prev + 1));
      }
      return;
    }
    const setDifficultyValue = currentSetInputs[currentSetIndex - 1]?.difficulty ?? null;
    const newLog = {
      exercise_id: currentBlock.exercise_id,
      set_number: currentSetIndex,
      reps: currentSetInputs[currentSetIndex - 1]?.reps || currentBlock.reps,
      weight: isBodyweightExercise
        ? BODYWEIGHT_SENTINEL
        : (currentSetInputs[currentSetIndex - 1]?.weight ?? targetValue),
      difficulty: setDifficultyValue,
    };
    setLogs((prev) => [...prev, newLog]);

    // Task 8 — validation post-série-2 : si la série qu'on vient de logger est la
    // série 2 d'un exo passé par le wizard ce run (et pas encore validé), capture
    // les entrées de isNegativeValidation et ouvre la carte (non bloquante, 1×/run).
    if (
      currentSetIndex === 2 &&
      calibratedThisRun.has(currentBlock.exercise_id) &&
      !validationShownFor.has(currentBlock.exercise_id)
    ) {
      const exerciseId = currentBlock.exercise_id;
      setValidation({
        exerciseId,
        repsDone: Number(newLog.reps) || 0,
        repsTarget: Number(currentBlock.reps) || 0,
        difficulty: setDifficultyValue,
        // 1RM LOCALE fraîche calculée à la série 1 (≠ prop oneRMs potentiellement
        // périmé/non propagé) → ancrage fiable du −10 %.
        currentOneRm: calibratedThisRun.get(exerciseId) ?? 0,
      });
      setValidationPain(null);
      setValidationLoadFeel(null);
      setValidationShownFor((prev) => {
        const next = new Set(prev);
        next.add(exerciseId);
        return next;
      });
    }

    // --- Live PR detection (before async save so toast shows immediately) ---
    const logWeight = Number(newLog.weight);
    const logReps = Number(newLog.reps);
    // §298 — pas de détection PR / estimation 1RM hors métrique weight_kg.
    if (tracksWeight && logWeight > 0 && logReps > 0 && !isBodyweight(logWeight)) {
      const currentBest1rm = oneRMs.find((r) => r.exercise_id === currentBlock.exercise_id)?.weight || 0;
      const exName = currentExerciseDef?.nom_exercice ?? "Exercice";
      const pr = detectPR({ weight: logWeight, reps: logReps, difficulty: newLog.difficulty }, currentBest1rm, exName);
      if (pr) {
        const setKey = `${currentBlock.exercise_id}-${currentSetIndex}`;
        setPrSets((prev) => new Set(prev).add(setKey));
        toast("🏆 Nouveau record !", { description: `1RM estimé : ${pr.newValue}kg (+${pr.improvement}%)` });
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
      // Carry the logged weight forward so the next set doesn't revert to the plan target
      const nextIdx = currentSetIndex; // 0-indexed key for next set (currentSetIndex + 1 - 1)
      setCurrentSetInputs((prev) => {
        if (prev[nextIdx] !== undefined) return prev;
        return { ...prev, [nextIdx]: { weight: newLog.weight, reps: newLog.reps } };
      });
      setCurrentSetIndex((prev) => Math.min(currentBlock.sets, prev + 1));
    }

    // --- Persist to server (UI already transitioned) ---
    isLoggingRef.current = true;
    try {
      await onLogSets?.([newLog]);
    } catch (_err) {
      toast.error("Erreur de sauvegarde", {
        description: "Série non enregistrée. Réseau instable.",
        action: { label: "Réessayer", onClick: () => void onLogSets?.([newLog]) },
      });
    } finally {
      isLoggingRef.current = false;
    }
  };

  const openInputSheet = (type: "weight" | "reps") => {
    setActiveInput(type);
    const existingValue =
      type === "weight"
        ? currentSetInputs[currentSetIndex - 1]?.weight ?? targetValue ?? ""
        : currentSetInputs[currentSetIndex - 1]?.reps ?? currentBlock?.reps ?? "";
    setDraftValue(existingValue ? String(existingValue) : "");
    setShouldReplace(Boolean(existingValue));
    setInputSheetOpen(true);
  };

  const applyDraftValue = () => {
    if (!currentBlock) return;
    const isBodyweightDraft =
      activeInput === "weight" && draftValue === String(BODYWEIGHT_SENTINEL);
    const parsed = isBodyweightDraft
      ? BODYWEIGHT_SENTINEL
      : activeInput === "weight"
        ? Number(draftValue.replace(",", "."))
        : Number(draftValue);
    if (!Number.isFinite(parsed)) return;
    // Bounds: weight ∈ [0, metricCfg.max] (plus BODYWEIGHT_SENTINEL = -1 pour PDC),
    // reps ∈ [1, 200]. Absurd values are silently rejected — the keypad
    // already prevents most malformed input but this catches overflow typos.
    // §298 — borne haute = metricCfg.max (1000 kg / 300 cm / 500 cm / 3600 s).
    if (activeInput === "weight" && !isBodyweightDraft && (parsed < 0 || parsed > metricCfg.max)) return;
    if (activeInput === "reps" && (parsed < 1 || parsed > 200)) return;
    setCurrentSetInputs((prev: Record<number, SetInputValues>) => ({
      ...prev,
      [currentSetIndex - 1]: {
        ...prev[currentSetIndex - 1],
        [activeInput]: parsed,
      },
    }));
    // Tunnel mode: after validating weight, if reps for this set isn't set
    // yet, slide directly to the reps step instead of closing the drawer.
    // Saves a "tap card → numpad" round-trip on every single set, which adds
    // up fast across a 20-set session with wet hands.
    const repsAlreadySet =
      currentSetInputs[currentSetIndex - 1]?.reps !== undefined &&
      currentSetInputs[currentSetIndex - 1]?.reps !== null;
    if (activeInput === "weight" && !repsAlreadySet) {
      setActiveInput("reps");
      const nextValue = currentBlock.reps ?? "";
      setDraftValue(nextValue ? String(nextValue) : "");
      setShouldReplace(Boolean(nextValue));
      return;
    }
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
        ? updatedInputs[currentSetIndex - 1]?.weight ?? targetValue ?? ""
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
            <CardTitle className="text-3xl heading-display">Séance Terminée !</CardTitle>
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
              className="w-full h-14 text-base font-semibold"
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
                if (draftKey) clearDraft(draftKey);
              }}
            >
              {isFinishing ? "Enregistrement…" : "Enregistrer & fermer"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-44">
      {/* Exit bar — pt-[env(safe-area-inset-top)] keeps the "Quitter" link
          reachable on iPhones with a notch when running as a PWA: without it,
          the sticky bar slides under the system status area and the link
          becomes invisible/inaccessible above ~6 sets in. */}
      {onExitFocus && (
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 backdrop-blur px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b">
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
      {/* Offline banner — appears only while offline so the swimmer knows
          set logs are buffered locally rather than silently failing. */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Hors ligne — tes séries sont sauvegardées et seront synchronisées dès la reconnexion.
          </span>
        </div>
      )}
      {/* §367 — Carte de chapitre (warmup / main) */}
      {chapterBlock && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className="rounded-3xl border-2 shadow-lg overflow-hidden">
            {chapterBlock === "warmup" ? (
              <>
                <CardHeader className="pb-3 bg-sky-50/60 dark:bg-sky-950/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 dark:bg-sky-900/50">
                      <Flame className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Échauffement</CardTitle>
                      <CardDescription>
                        {workoutPlan.filter((i) => (i.block ?? "main") === "warmup").length} exercices · intensité légère
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3 pb-1">
                  <p className="text-sm text-muted-foreground">
                    Prépare le corps avant le bloc principal. Ne pas sauter si tu ressens une tension.
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2 pt-2 pb-4">
                  <Button
                    className="w-full h-12 rounded-2xl font-semibold"
                    onClick={() => setChapterBlock(null)}
                  >
                    Commencer l'échauffement
                  </Button>
                  {firstMainStep <= workoutPlan.length && (
                    <Button
                      variant="ghost"
                      className="w-full h-10 rounded-2xl text-sm text-muted-foreground"
                      onClick={async () => {
                        setChapterBlock(null);
                        setCurrentSetIndex(1);
                        setCurrentSetInputs({});
                        updateStep(firstMainStep);
                        setChapterBlock("main");
                        const progressPct = Math.round(
                          (Math.min(firstMainStep - 1, workoutPlan.length) / workoutPlan.length) * 100,
                        );
                        try {
                          await onProgress?.(progressPct);
                        } catch (_err) {
                          toast.error("Erreur de sauvegarde", {
                            description: "Progression non enregistrée. Réseau instable.",
                            action: { label: "Réessayer", onClick: () => void onProgress?.(progressPct) },
                          });
                        }
                      }}
                    >
                      Passer l'échauffement →
                    </Button>
                  )}
                </CardFooter>
              </>
            ) : (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                      <Zap className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Bloc principal</CardTitle>
                      <CardDescription>
                        {workoutPlan.filter((i) => (i.block ?? "main") === "main").length} exercices
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardFooter className="pt-0 pb-4">
                  <Button
                    className="w-full h-12 rounded-2xl font-semibold"
                    onClick={() => setChapterBlock(null)}
                  >
                    On y va !
                  </Button>
                </CardFooter>
              </>
            )}
          </Card>
        </div>
      )}
      {!chapterBlock && (
        <>
      <div className="space-y-3">
        {/* §296 — Badge "Échauffement" si l'exo en cours est un warmup */}
        {currentBlock?.block === "warmup" && (
          <div className="mb-2 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-[0.14em]",
                BLOCK_STYLES.warmup.badge,
              )}
            >
              Échauffement
            </span>
            <span className={cn("text-[11px]", BLOCK_STYLES.warmup.textMuted)}>
              Intensité légère · prépare le bloc principal
            </span>
          </div>
        )}

        {/* Ligne 1 : GIF + titre + note + exit */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Voir l'animation de l'exercice"
            onClick={() => {
              if (!currentExerciseDef?.illustration_gif) return;
              setIsGifOpen(true);
            }}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-card shadow-sm",
              currentBlock?.block === "warmup" && BLOCK_STYLES.warmup.border,
            )}
          >
            <ExerciseGif
              src={currentExerciseDef?.illustration_gif}
              alt=""
              offline={!isOnline}
              className="h-full w-full rounded-full"
              imgClassName="object-cover"
            />
          </button>
          <h2 className="flex-1 min-w-0 text-lg font-semibold tracking-tight truncate">
            {currentExerciseDef?.nom_exercice ?? "Exercice"}
          </h2>
          <div className={cn(
            "h-2 w-2 shrink-0 rounded-full transition-colors",
            isOnline ? "bg-emerald-500" : "bg-red-500"
          )} aria-label={isOnline ? "En ligne" : "Hors ligne"} />
          {onSubstitute && (
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0"
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
              className="h-11 w-11 shrink-0"
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

      {/* Task 8 — wizard de calibration 1RM (remplace l'ancien mode estimation §297).
          Affiché à la place de la carte de série quand l'exo doit être calibré. */}
      {showWizard && currentBlock && (
        <OneRmDiscoveryWizard
          exerciseName={currentExerciseDef?.nom_exercice ?? "Exercice"}
          known1rm={
            oneRMs.find((r) => r.exercise_id === currentBlock.exercise_id)?.weight ?? null
          }
          shortMode={!isFirstTime}
          onComputed={handleWizardComputed}
          onPainAbort={handlePainAbort}
        />
      )}

      {!showWizard && (
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
        {/* §199 Chantier B — cards focus adoucies : gradient + border-2 retirés
            au profit d'un bg-secondary plat (cohérent avec le ton iOS sobre). */}
        <div className={cn("grid gap-3", isBodyweightExercise ? "grid-cols-1" : "grid-cols-2")}>
          {!isBodyweightExercise && (
            <button
              type="button"
              className="group relative rounded-2xl border border-border bg-secondary p-4 text-left transition-all active:scale-[0.98] hover:bg-secondary/80"
              onClick={() => openInputSheet("weight")}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{metricCfg.label}</div>
              <div className="mt-1 flex items-baseline gap-0.5">
                {metricCfg.hasBodyweight && isBodyweight(activeWeight) ? (
                  <span className="text-2xl font-bold tracking-tight">PDC</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold tabular-nums tracking-tight">
                      {activeWeight || "—"}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">{metricCfg.unit}</span>
                  </>
                )}
              </div>
            </button>
          )}
          <button
            type="button"
            className="group relative rounded-2xl border border-border bg-secondary p-4 text-left transition-all active:scale-[0.98] hover:bg-secondary/80"
            onClick={() => openInputSheet("reps")}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reps</div>
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
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Difficulté</span>
          <div className="flex gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((level) => {
              const selected = currentSetInputs[currentSetIndex - 1]?.difficulty === level;
              const colorByLevel: Record<1 | 2 | 3 | 4 | 5, string> = {
                1: "bg-intensity-1 text-white border-intensity-1",
                2: "bg-intensity-2 text-white border-intensity-2",
                3: "bg-intensity-3 text-white border-intensity-3",
                4: "bg-intensity-4 text-white border-intensity-4",
                5: "bg-intensity-5 text-white border-intensity-5",
              };
              const colorClass = colorByLevel[level];
              return (
                <button
                  key={level}
                  type="button"
                  // h-11 w-11 (44px) atteint Apple HIG. Précédemment h-9 (36px,
                  // §172) restait sous le seuil de tap-friendliness mains
                  // mouillées au bord du bassin.
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-all",
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
      )}

      {currentExerciseDef?.description && (
        <div className="rounded-2xl border bg-muted/10 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">Description</p>
          <p className="text-sm text-muted-foreground">
            {currentExerciseDef.description}
          </p>
        </div>
      )}
      {/* §297 — Recalculer 1RM : visible uniquement sur série 1 d'exos chargés hors
          wizard de calibration, et avant que la série 1 ne soit loggée. */}
      {!isBodyweightExercise &&
        !showWizard &&
        currentSetIndex === 1 &&
        !currentLoggedSet &&
        onRequestRecalc &&
        currentBlock && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => onRequestRecalc(currentBlock.exercise_id)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Recalculer ma 1RM
          </Button>
        )}
      {!showWizard && (
        <Button
          variant="ghost"
          className="w-full h-10 rounded-2xl text-sm text-muted-foreground"
          onClick={() => {
            const hasLogsForCurrent = currentBlock
              ? logs.some((l) => l.exercise_id === currentBlock.exercise_id)
              : false;
            if (hasLogsForCurrent) {
              setSkipExerciseConfirmOpen(true);
            } else {
              void advanceExercise(true);
            }
          }}
        >
          Passer cet exercice
        </Button>
      )}
      <Button variant="outline" className="w-full rounded-2xl" onClick={() => setSeriesSheetOpen(true)}>
        Voir les séries
      </Button>

      {/* Task 8 — pendant le wizard de calibration, la barre d'action standard est
          masquée : le wizard porte son propre CTA (« Calculer ma 1RM »). */}
      {!inputSheetOpen && !isResting && !showWizard ? (
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
        </BottomActionBar>
      ) : null}
        </>
      )}

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
              <ExerciseGif
                src={currentExerciseDef.illustration_gif}
                alt=""
                offline={!isOnline}
                className="max-h-[80dvh] max-w-[92vw] rounded-2xl"
                imgClassName="max-h-[80dvh] w-auto max-w-[92vw]"
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
              const loggedSets = Array.from({ length: item.sets ?? 0 }).filter((_, setIndex) =>
                logLookup.get(`${item.exercise_id}-${setIndex + 1}`),
              ).length;
              const isActive = index === currentExerciseIndex;
              const hasPr = Array.from({ length: item.sets ?? 0 }).some((_, si) =>
                prSets.has(`${item.exercise_id}-${si + 1}`),
              );
              // §296 — séparateur visuel entre le dernier warmup et le premier main
              const prevBlock = index > 0 ? workoutPlan[index - 1]?.block : undefined;
              const showMainDivider =
                prevBlock === "warmup" && item.block !== "warmup";
              // Eyebrow "Échauffement" au-dessus du tout premier item warmup
              const showWarmupHeader =
                index === 0 && item.block === "warmup";
              return (
                <React.Fragment key={`${item.exercise_id}-${index}`}>
                  {showWarmupHeader && (
                    <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
                      <span
                        className={cn(
                          "text-[9px] font-bold uppercase tracking-[0.18em]",
                          BLOCK_STYLES.warmup.textMuted,
                        )}
                      >
                        Échauffement · Mobilité
                      </span>
                      <div
                        className={cn("h-px flex-1", BLOCK_STYLES.warmup.divider)}
                      />
                    </div>
                  )}
                  {showMainDivider && (
                    <div className="flex items-center gap-2 px-1 pt-2 pb-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Bloc principal
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <SetRow
                    item={item}
                    index={index}
                    exercise={exercise}
                    loggedSets={loggedSets}
                    isActive={isActive}
                    hasPr={hasPr}
                  />
                </React.Fragment>
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
              <DrawerTitle className="text-center flex items-center justify-center gap-2">
                <span>{activeInput === "weight" ? metricCfg.label : "Répétitions"}</span>
                {/* Tunnel-mode step indicator: weight = step 1/2, reps = step 2/2.
                    Lets the swimmer know they don't need to dismiss after weight. */}
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {activeInput === "weight" ? "1/2" : "2/2"}
                </span>
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
                <div className="text-xs font-semibold uppercase text-muted-foreground">{metricCfg.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {(() => {
                    const displayVal = activeInput === "weight"
                      ? draftValue
                      : String(currentSetInputs[currentSetIndex - 1]?.weight ?? targetValue ?? "");
                    if (metricCfg.hasBodyweight && displayVal === String(BODYWEIGHT_SENTINEL)) return "PDC";
                    return (
                      <>
                        {displayVal || "—"}
                        <span className="ml-1 text-base font-normal text-muted-foreground">{metricCfg.unit}</span>
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
                  {metricCfg.hasBodyweight && (
                    <Button
                      variant={draftValue === String(BODYWEIGHT_SENTINEL) ? "default" : "outline"}
                      size="sm"
                      className="rounded-full px-4 h-10 text-sm font-semibold"
                      onClick={() => setDraftValue(String(BODYWEIGHT_SENTINEL))}
                    >
                      PDC
                    </Button>
                  )}
                  {targetValue > 0 && [
                    targetValue - 10,
                    targetValue - 5,
                    targetValue,
                    targetValue + 5,
                    targetValue + 10,
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
                        {v} {metricCfg.unit}
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

      <AlertDialog open={skipExerciseConfirmOpen} onOpenChange={setSkipExerciseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passer cet exercice ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu as déjà validé des séries sur cet exercice. Elles seront conservées,
              mais l'exercice sera marqué comme abandonné.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setSkipExerciseConfirmOpen(false); void advanceExercise(true); }}>
              Passer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Task 8 Commit 2 — validation post-série-2 d'un exo calibré.
          Non bloquante (dismissable), une fois par exo/run. */}
      <Sheet
        open={validation != null && !isResting}
        onOpenChange={(open) => { if (!open) setValidation(null); }}
      >
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Comment était cette série ?</SheetTitle>
          </SheetHeader>
          {validation && (() => {
            // Verdict négatif = signaux objectifs (douleur / reps manquées /
            // difficulté≥5 via isNegativeValidation, RIR neutre car non capté en
            // série 2) OU ressenti subjectif « trop lourde » → contrôle de
            // cohérence de la charge voulu par le coach. « juste »/« trop légère »
            // ne déclenchent pas le −10 %.
            const negative =
              isNegativeValidation({
                pain: validationPain === true,
                repsDone: validation.repsDone,
                repsTarget: validation.repsTarget,
                rir: NEUTRAL_RIR,
                difficulty: validation.difficulty,
              }) || validationLoadFeel === "heavy";
            const adjusted = adjustOneRmDown(validation.currentOneRm);
            return (
              <div className="mt-4 space-y-5 pb-8">
                <div className="space-y-2">
                  <span className="text-sm font-medium">Douleur ?</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={validationPain === true ? "default" : "outline"}
                      className="h-11 flex-1 rounded-full"
                      onClick={() => setValidationPain(true)}
                    >
                      oui
                    </Button>
                    <Button
                      type="button"
                      variant={validationPain === false ? "default" : "outline"}
                      className="h-11 flex-1 rounded-full"
                      onClick={() => setValidationPain(false)}
                    >
                      non
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium">Cette charge me semble :</span>
                  <div className="flex gap-2">
                    {([
                      { value: "light", label: "trop légère" },
                      { value: "right", label: "juste" },
                      { value: "heavy", label: "trop lourde" },
                    ] as const).map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={validationLoadFeel === opt.value ? "default" : "outline"}
                        className="h-11 flex-1 rounded-full text-xs"
                        onClick={() => setValidationLoadFeel(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {negative ? (
                  <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      Qualité de mouvement {">"} charge : mieux vaut une série propre qu'une
                      charge trop lourde. Tu peux revoir ta 1RM à la baisse.
                    </p>
                    {validation.currentOneRm > 0 && adjusted > 0 && (
                      <Button
                        className="w-full h-12 rounded-2xl font-semibold"
                        onClick={async () => {
                          const exerciseId = validation.exerciseId;
                          setValidation(null);
                          try {
                            await onEstimationComplete?.(exerciseId, adjusted);
                            toast("1RM ajustée", { description: `Nouvelle 1RM : ${adjusted} kg (−10 %)` });
                          } catch {
                            toast.error("Erreur", { description: "1RM non ajustée. Réessaye." });
                          }
                        }}
                      >
                        Ajuster ma 1RM (−10 %) → {adjusted} kg
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="w-full h-10 rounded-2xl text-sm text-muted-foreground"
                      onClick={() => setValidation(null)}
                    >
                      Garder ma 1RM
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                      Série validée — charge cohérente. On garde le cap.
                    </p>
                    <Button
                      className="w-full h-11 rounded-2xl font-semibold"
                      onClick={() => setValidation(null)}
                    >
                      Continuer
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

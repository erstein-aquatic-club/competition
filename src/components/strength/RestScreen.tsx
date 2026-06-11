import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { RestExerciseTab } from "./RestExerciseTab";
import { RestSessionTab } from "./RestSessionTab";
import { RestPerfsTab } from "./RestPerfsTab";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";
import type { SetLogEntry } from "@/lib/types";

export interface RestScreenProps {
  /** §380 — timestamp (ms epoch) de fin de repos ; le décompte est LOCAL au
   * composant (avant : state du parent → ~1900 lignes re-rendues par seconde). */
  restEndAt: number;
  /** Appelé une seule fois quand le décompte atteint zéro (notif/toast/fermeture). */
  onExpire: () => void;
  restDuration: number;
  restType: "set" | "exercise";
  exercise: Exercise | null;
  block: StrengthSessionItem | null;
  nextExercise: Exercise | null;
  nextBlock: StrengthSessionItem | null;
  targetWeight: number;
  muscleTags: string[];
  items: StrengthSessionItem[];
  logs: SetLogEntry[];
  exercises: Exercise[];
  currentStep: number;
  progressPct: number;
  oneRmWeight: number;
  percentOneRm: number;
  athleteNote: string;
  exerciseId: number;
  onUpdateNote?: (exerciseId: number, note: string | null) => void;
  currentSetIndex: number;
  totalSets: number;
  userId: number;
  onClose: () => void;
  onSkip: () => void;
  onAdd30s: () => void;
}

const TAB_LABELS = ["Exercice", "Séance", "Perfs"] as const;

export function RestScreen({
  restEndAt,
  onExpire,
  restDuration,
  restType,
  exercise,
  block,
  nextExercise,
  nextBlock,
  targetWeight,
  muscleTags,
  items,
  logs,
  exercises,
  currentStep,
  progressPct,
  oneRmWeight,
  percentOneRm,
  athleteNote,
  exerciseId,
  onUpdateNote,
  currentSetIndex,
  totalSets,
  userId,
  onClose,
  onSkip,
  onAdd30s,
}: RestScreenProps) {
  const reduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState(0);

  // §380 — décompte local : remaining dérivé de restEndAt, tick 1 s + resync au
  // retour au premier plan (même résilience iOS que l'ancien tick parent §343).
  const computeRemaining = () =>
    Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000));
  const [restTimer, setRestTimer] = useState(computeRemaining);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    // Garde anti-skip : un restEndAt nul/passé au mount ne déclenche pas la
    // séquence de fin (notif + toast) — le parent ferme l'écran lui-même.
    if (restEndAt <= 0) return;
    let expired = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000));
      setRestTimer(remaining);
      if (remaining <= 0 && !expired) {
        expired = true;
        onExpireRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [restEndAt]);

  const goTo = (next: number) => {
    if (next < 0 || next >= TAB_LABELS.length || next === activeTab) return;
    setActiveTab(next);
  };

  const swipeProps = useSwipeNavigation({
    onSwipeLeft: () => goTo(activeTab + 1),
    onSwipeRight: () => goTo(activeTab - 1),
  });

  // When restType="exercise", advanceExercise() has already incremented currentStep,
  // so `exercise`/`block` (derived from currentStep) already point to the NEXT exercise.
  // We use current (not next) to avoid showing the exercise after next (+2).
  const displayExercise = exercise;
  const displayBlock = block;

  // Today's logs for the displayed exercise (for perfs tab)
  const displayExerciseId = displayExercise?.id ?? -1;
  const todayLogs = logs.filter((l) => l.exercise_id === displayExerciseId);

  // Timer progress ratio for the ring glow effect
  const timerRatio = restDuration > 0 ? restTimer / restDuration : 0;
  const isLow = restTimer <= 10 && restTimer > 0;

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Fixed header */}
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
          {restType === "exercise" ? "Transition" : "Repos"}
        </span>
        <button
          type="button"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted active:scale-90 transition-all"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Circular timer */}
      <div className="flex flex-col items-center shrink-0 pt-1 pb-3">
        <button
          type="button"
          className="flex flex-col items-center active:opacity-80 transition-opacity"
          onClick={onSkip}
          aria-label="Passer le repos"
        >
          <div className="relative">
            {/* Subtle outer glow when timer is low */}
            <div
              className={cn(
                "absolute inset-0 rounded-full transition-opacity duration-slower",
                isLow ? "opacity-100" : "opacity-0",
              )}
              style={{ boxShadow: "0 0 32px 8px hsl(var(--primary) / 0.15)" }}
            />
            <svg className="h-40 w-40 -rotate-90" viewBox="0 0 200 200">
              <circle
                cx="100" cy="100" r="90"
                fill="none" stroke="currentColor"
                className="text-muted/20"
                strokeWidth="6"
              />
              <circle
                cx="100" cy="100" r="90"
                fill="none" stroke="currentColor"
                className={cn(
                  "transition-all duration-1000",
                  isLow ? "text-destructive" : "text-primary",
                )}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 90}
                strokeDashoffset={2 * Math.PI * 90 * (1 - timerRatio)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* UX3 (§349) — annonçable au lecteur d'écran. `aria-live="off"` :
                  pas d'annonce à chaque seconde (verbeux) ; rôle timer +
                  aria-label donnent le temps restant à la demande. */}
              <span
                role="timer"
                aria-live="off"
                aria-label={`Repos : ${Math.floor(restTimer / 60)} min ${restTimer % 60} s restantes`}
                className={cn(
                  "font-[var(--font-display)] text-4xl font-bold tabular-nums tracking-tight transition-colors duration-slow",
                  isLow && "text-destructive",
                )}
              >
                {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, "0")}
              </span>
              <span className="text-[10px] text-muted-foreground/50 mt-0.5">
                tap pour passer
              </span>
            </div>
          </div>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full px-5 mt-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onAdd30s}
        >
          +30s
        </Button>
      </div>

      {/* Pagination dots */}
      <div
        className="flex items-center justify-center gap-2 pb-3 shrink-0"
        role="tablist"
        aria-label="Onglets repos"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); goTo(activeTab + 1); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(activeTab - 1); }
        }}
      >
        {TAB_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-label={label}
            aria-selected={i === activeTab}
            tabIndex={i === activeTab ? 0 : -1}
            onClick={() => goTo(i)}
            className={cn(
              "rounded-full transition-all duration-normal",
              i === activeTab
                ? "h-1.5 w-6 bg-primary"
                : "h-1.5 w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/40",
            )}
          />
        ))}
      </div>

      {/* Swipable tabs area — all 3 tabs pre-rendered, translate on swipe */}
      <div className="flex-1 overflow-hidden relative" {...swipeProps}>
        <motion.div
          className="absolute inset-0 flex will-change-transform"
          animate={{ x: `${-activeTab * 100}%` }}
          transition={reduce ? { duration: 0 } : { type: "tween", duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="w-full shrink-0 overflow-y-auto px-5 pt-1">
            <RestExerciseTab
              exercise={displayExercise}
              block={displayBlock}
              targetWeight={targetWeight}
              muscleTags={muscleTags}
              isTransition={restType === "exercise"}
              athleteNote={athleteNote}
              exerciseId={exerciseId}
              onUpdateNote={onUpdateNote}
            />
          </div>
          <div className="w-full shrink-0 overflow-y-auto px-5 pt-1">
            <RestSessionTab
              items={items}
              logs={logs}
              exercises={exercises}
              currentStep={currentStep}
              progressPct={progressPct}
              currentSetIndex={currentSetIndex}
              totalSets={totalSets}
            />
          </div>
          <div className="w-full shrink-0 overflow-y-auto px-5 pt-1">
            <RestPerfsTab
              exerciseName={displayExercise?.nom_exercice ?? "—"}
              oneRmWeight={oneRmWeight}
              targetWeight={targetWeight}
              percentOneRm={percentOneRm}
              todayLogs={todayLogs}
              exerciseId={displayExerciseId}
              userId={userId}
              intensityMetric={displayExercise?.intensity_metric}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default RestScreen;

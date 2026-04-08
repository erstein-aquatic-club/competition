import React from "react";
import { Check, Dumbbell } from "lucide-react";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";
import type { SetLogEntry } from "@/lib/types";
import { isBodyweight } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface RestSessionTabProps {
  items: StrengthSessionItem[];
  logs: SetLogEntry[];
  exercises: Exercise[];
  currentStep: number;
  progressPct: number;
  currentSetIndex: number;
  totalSets: number;
  restSecondsPerSet: number;
  restSecondsPerExercise: number;
}

const formatVolume = (v: number) =>
  v >= 1000
    ? `${Math.floor(v / 1000)}\u202F${String(v % 1000).padStart(3, "0")}`
    : String(v);

export function RestSessionTab({
  items,
  logs,
  exercises,
  currentStep,
  progressPct,
  currentSetIndex,
  totalSets,
  restSecondsPerSet,
  restSecondsPerExercise,
}: RestSessionTabProps) {
  // Exercise lookup map
  const exerciseMap = new Map<number, Exercise>(exercises.map((e) => [e.id, e]));

  // Total volume — exclude bodyweight exercises
  const totalVolume = logs.reduce((sum, log) => {
    if (isBodyweight(log.weight)) return sum;
    return sum + (log.weight ?? 0) * (log.reps ?? 0);
  }, 0);

  // Last logged set
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const lastExercise = lastLog ? exerciseMap.get(lastLog.exercise_id) : null;
  const lastExerciseName =
    lastExercise?.nom_exercice ??
    items.find((i) => i.exercise_id === lastLog?.exercise_id)?.exercise_name ??
    "—";

  const totalSteps = items.length;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pb-6">
      {/* Progress bar */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Progression</span>
          <span className="text-sm font-bold tabular-nums">{currentStep} <span className="text-muted-foreground font-normal">/ {totalSteps}</span></span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      </div>

      {/* Current exercise set progress */}
      {totalSets > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSets }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  i < currentSetIndex
                    ? "bg-primary"
                    : i === currentSetIndex
                      ? "bg-primary/40 ring-2 ring-primary/30"
                      : "bg-muted-foreground/20",
                )}
              />
            ))}
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            Série {currentSetIndex}/{totalSets}
          </span>
        </div>
      )}

      {/* Estimated remaining time */}
      {(() => {
        const setsLeft = Math.max(0, totalSets - currentSetIndex);
        const exercisesAfter = items.slice(currentStep);
        const futureSets = exercisesAfter.reduce((acc, item) => acc + item.sets, 0);
        const totalSecsLeft =
          setsLeft * restSecondsPerSet +
          futureSets * restSecondsPerSet +
          exercisesAfter.length * restSecondsPerExercise;
        if (totalSecsLeft <= 0) return null;
        const mins = Math.ceil(totalSecsLeft / 60);
        return (
          <p className="text-xs text-muted-foreground/60 text-center">
            ~{mins} min restante{mins > 1 ? "s" : ""}
          </p>
        );
      })()}

      {/* Stats row: last set + volume */}
      <div className="grid grid-cols-2 gap-3">
        {/* Last set summary */}
        {lastLog ? (
          <div className="rounded-2xl border border-border/50 bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Dumbbell className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Dernière série</span>
            </div>
            <p className="font-semibold text-sm truncate">{lastExerciseName}</p>
            <p className="text-lg font-bold tabular-nums mt-0.5">
              {isBodyweight(lastLog.weight)
                ? `${lastLog.reps ?? "—"} reps`
                : `${lastLog.weight ?? "—"} × ${lastLog.reps ?? "—"}`}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 p-3 flex items-center justify-center">
            <span className="text-xs text-muted-foreground/40">—</span>
          </div>
        )}

        {/* Total volume */}
        <div className="rounded-2xl border border-border/50 bg-card p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Volume total</p>
          <p className="text-lg font-bold tabular-nums">{formatVolume(totalVolume)}</p>
          <p className="text-xs text-muted-foreground">kg soulevés</p>
        </div>
      </div>

      {/* Exercise list */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Exercices</p>
        <div className="flex flex-col gap-0.5">
          {items.map((item, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep - 1;
            const exName =
              exerciseMap.get(item.exercise_id)?.nom_exercice ??
              item.exercise_name ??
              `Exercice ${item.exercise_id}`;

            return (
              <div
                key={`${item.exercise_id}-${idx}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                  isCompleted && "opacity-35",
                  isCurrent && "bg-primary/5",
                )}
              >
                {isCompleted ? (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {idx + 1}
                  </span>
                )}
                <span className={cn("truncate flex-1", isCompleted && "line-through")}>{exName}</span>
                <span className="text-xs text-muted-foreground/60 tabular-nums">
                  {item.sets}×{item.reps}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

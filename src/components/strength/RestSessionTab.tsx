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
    <div className="flex flex-col gap-4 overflow-y-auto pb-4">
      {/* Progress bar */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {currentStep} / {totalSteps} exercices
        </span>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      </div>

      {/* Last set summary */}
      {lastLog && (
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Dumbbell className="h-3 w-3" />
            <span>Dernière série</span>
          </div>
          <p className="font-medium text-sm">{lastExerciseName}</p>
          <p className="text-sm text-muted-foreground">
            {isBodyweight(lastLog.weight)
              ? `Corps × ${lastLog.reps ?? "—"}`
              : `${lastLog.weight ?? "—"} kg × ${lastLog.reps ?? "—"}`}
          </p>
        </div>
      )}

      {/* Total volume */}
      <div className="rounded-xl border bg-card p-3 text-center">
        <p className="text-xs text-muted-foreground mb-1">Volume total</p>
        <p className="text-2xl font-bold tabular-nums">{formatVolume(totalVolume)} kg</p>
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => {
          const isCompleted = idx < currentStep;
          const exName =
            exerciseMap.get(item.exercise_id)?.nom_exercice ??
            item.exercise_name ??
            `Exercice ${item.exercise_id}`;

          return (
            <div
              key={`${item.exercise_id}-${idx}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                isCompleted && "opacity-40",
              )}
            >
              {isCompleted ? (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <span className="w-4 shrink-0 text-center text-xs font-mono text-muted-foreground">
                  {idx + 1}
                </span>
              )}
              <span className={cn(isCompleted && "line-through")}>{exName}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {item.sets}×{item.reps}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

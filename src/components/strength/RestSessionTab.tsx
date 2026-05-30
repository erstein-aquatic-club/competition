import React, { useMemo } from "react";
import { Check, Flame, Timer } from "lucide-react";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";
import type { SetLogEntry } from "@/lib/types";
import { isBodyweight } from "@/lib/api/client";
import { formatIntensity } from "@/lib/strength/intensityMetrics";
import { estimateRemainingStrengthSessionDurationSeconds } from "@/lib/strength/sessionDuration";
import { cn } from "@/lib/utils";

export interface RestSessionTabProps {
  items: StrengthSessionItem[];
  logs: SetLogEntry[];
  exercises: Exercise[];
  currentStep: number;
  progressPct: number;
  currentSetIndex: number;
  totalSets: number;
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
}: RestSessionTabProps) {
  const exerciseMap = new Map<number, Exercise>(exercises.map((e) => [e.id, e]));

  // §298 — volume en kg : exclure poids du corps ET métriques non-poids (cm/s)
  const totalVolume = logs.reduce((sum, log) => {
    const metric = exerciseMap.get(log.exercise_id)?.intensity_metric ?? "weight_kg";
    if (isBodyweight(log.weight) || metric !== "weight_kg") return sum;
    return sum + (log.weight ?? 0) * (log.reps ?? 0);
  }, 0);

  // Build a log lookup: "exerciseId-setNumber" → SetLogEntry
  const logLookup = useMemo(() => {
    const map = new Map<string, SetLogEntry>();
    logs.forEach((log, index) => {
      const key = `${log.exercise_id}-${log.set_number ?? log.set_index ?? index + 1}`;
      map.set(key, log);
    });
    return map;
  }, [logs]);

  const totalSteps = items.length;

  // Temps restant — MÊME modèle que l'aperçu (repos par item + exec), décroissant.
  const estimatedMins = useMemo(() => {
    const secsLeft = estimateRemainingStrengthSessionDurationSeconds(
      items,
      currentStep,
      currentSetIndex,
    );
    // R5 (§343) — MÊME arrondi que `formatApproxMinutes` de l'aperçu (Math.round,
    // plancher 1 min) au lieu de Math.ceil → plus d'écart d'1 min aperçu/runner.
    return secsLeft > 0 ? Math.max(1, Math.round(secsLeft / 60)) : 0;
  }, [items, currentStep, currentSetIndex]);

  return (
    <div className="flex flex-col gap-3 pb-6">
      {/* ── Hero stats row ── */}
      <div className="flex items-center gap-2.5">
        {/* Big progress ring */}
        <div className="relative shrink-0">
          <svg className="h-[52px] w-[52px] -rotate-90" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="3.5" />
            <circle
              cx="26" cy="26" r="22"
              fill="none" stroke="currentColor"
              className="text-primary transition-all duration-slower ease-out"
              strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 22}
              strokeDashoffset={2 * Math.PI * 22 * (1 - progressPct / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold tabular-nums leading-none">
              {currentStep}<span className="text-muted-foreground/50 font-normal">/{totalSteps}</span>
            </span>
          </div>
        </div>

        {/* Volume + Time chips */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3 w-3 text-orange-400 shrink-0" />
            <span className="text-sm font-bold tabular-nums">{formatVolume(totalVolume)}</span>
            <span className="text-[10px] text-muted-foreground">kg</span>
          </div>
          {estimatedMins > 0 && (
            <div className="flex items-center gap-1.5">
              <Timer className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <span className="text-xs text-muted-foreground">
                ~{estimatedMins} min restante{estimatedMins > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Set dots — current exercise */}
        {totalSets > 0 && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Série</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalSets }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-[3px] transition-all duration-normal",
                    i < currentSetIndex - 1
                      ? "h-1.5 w-3 bg-primary"
                      : i === currentSetIndex - 1
                        ? "h-1.5 w-3 bg-primary/40 ring-1 ring-primary/30"
                        : "h-1.5 w-1.5 bg-muted-foreground/20",
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Connected timeline ── */}
      <div className="relative pl-5 pt-1">
        {/* Vertical rail */}
        <div className="absolute left-[9px] top-0 bottom-0 w-[2px] bg-muted/40 rounded-full" />
        {/* Filled portion of rail */}
        <div
          className="absolute left-[9px] top-0 w-[2px] bg-primary rounded-full transition-all duration-slow ease-out"
          style={{
            height: totalSteps > 1
              ? `${Math.min(100, ((currentStep - 1) / (totalSteps - 1)) * 100)}%`
              : "0%",
          }}
        />

        <div className="flex flex-col">
          {items.map((item, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep - 1;
            const exName =
              exerciseMap.get(item.exercise_id)?.nom_exercice ??
              item.exercise_name ??
              `Exercice ${item.exercise_id}`;
            // §298 — métrique d'intensité de l'exercice (chips de série)
            const itemMetric = exerciseMap.get(item.exercise_id)?.intensity_metric ?? "weight_kg";

            // Compute logged sets for this exercise
            const loggedSets = Array.from({ length: item.sets }).filter((_, si) =>
              logLookup.get(`${item.exercise_id}-${si + 1}`),
            ).length;

            return (
              <div key={`${item.exercise_id}-${idx}`} className="relative">
                {/* Timeline node */}
                <div className={cn(
                  "absolute -left-5 rounded-full transition-all duration-normal",
                  isCompleted
                    ? "top-2 h-5 w-5 bg-primary"
                    : isCurrent
                      ? "top-2.5 h-6 w-6 -ml-0.5 bg-primary/15 border-2 border-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]"
                      : "top-2.5 h-4 w-4 ml-0.5 bg-background border-2 border-muted-foreground/20",
                )}>
                  {isCompleted && (
                    <Check
                      className="absolute inset-0 m-auto h-2.5 w-2.5 text-primary-foreground"
                      strokeWidth={3}
                    />
                  )}
                  {isCurrent && (
                    <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-primary animate-pulse" />
                  )}
                </div>

                {/* Content */}
                {isCurrent ? (
                  /* ── Expanded current exercise card ── */
                  <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-primary/70 mb-0.5">En cours</p>
                        <p className="text-sm font-bold truncate">{exName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary tabular-nums">
                        {currentSetIndex}/{item.sets}
                      </span>
                    </div>
                    {/* Inline set chips */}
                    <div className="flex items-center gap-1 mt-2">
                      {Array.from({ length: item.sets }).map((_, si) => {
                        const setLog = logLookup.get(`${item.exercise_id}-${si + 1}`);
                        const isDone = !!setLog;
                        const isActive = si === currentSetIndex - 1;
                        return (
                          <div
                            key={si}
                            className={cn(
                              "flex items-center justify-center rounded-lg text-[10px] font-bold tabular-nums transition-all",
                              isDone
                                ? "h-6 flex-1 bg-primary/15 text-primary"
                                : isActive
                                  ? "h-6 flex-1 border border-dashed border-primary/30 text-primary/60"
                                  : "h-6 flex-1 bg-muted/40 text-muted-foreground/40",
                            )}
                          >
                            {isDone
                              ? isBodyweight(setLog.weight)
                                ? `${setLog.reps}r`
                                : itemMetric === "weight_kg"
                                  ? `${setLog.weight}×${setLog.reps}`
                                  : `${formatIntensity(setLog.weight, itemMetric)}×${setLog.reps}`
                              : `S${si + 1}`}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ── Compact completed / upcoming row ── */
                  <div className={cn(
                    "flex items-center gap-2 py-2 transition-opacity",
                    isCompleted ? "opacity-40" : "opacity-70",
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-[13px] truncate",
                        isCompleted ? "line-through text-muted-foreground" : "text-foreground/80",
                      )}>
                        {exName}
                      </p>
                    </div>
                    {isCompleted ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {loggedSets}/{item.sets}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">
                        {item.sets}×{item.reps}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

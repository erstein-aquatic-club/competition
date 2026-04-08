import React, { useState } from "react";
import { Trophy, Target, TrendingUp } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useExerciseHistory } from "@/hooks/useExerciseHistory";
import { ExerciseProgressChart } from "./ExerciseProgressChart";
import type { SetLogEntry } from "@/lib/types";
import { isBodyweight } from "@/lib/api/client";

export interface RestPerfsTabProps {
  exerciseName: string;
  oneRmWeight: number;
  targetWeight: number;
  percentOneRm: number;
  todayLogs: SetLogEntry[];
  exerciseId: number;
  userId: number;
}

export function RestPerfsTab({
  exerciseName,
  oneRmWeight,
  targetWeight,
  percentOneRm,
  todayLogs,
  exerciseId,
  userId,
}: RestPerfsTabProps) {
  const { sessions, delta1rm } = useExerciseHistory({
    exerciseId,
    userId,
    months: 3,
  });
  const [chartOpen, setChartOpen] = useState(false);
  // Filter out bodyweight logs for weight-based computations
  const weightedLogs = todayLogs.filter(
    (l) => !isBodyweight(l.weight) && typeof l.weight === "number" && (l.weight ?? 0) > 0,
  );

  const maxWeight =
    weightedLogs.length > 0
      ? Math.max(...weightedLogs.map((l) => l.weight as number))
      : 0;

  const bestSet =
    weightedLogs.length > 0
      ? weightedLogs.reduce((best, current) => {
          const bw = best.weight ?? 0;
          const cw = current.weight ?? 0;
          if (cw > bw) return current;
          if (cw === bw && (current.reps ?? 0) > (best.reps ?? 0)) return current;
          return best;
        })
      : null;

  const actualPercent =
    maxWeight > 0 && oneRmWeight > 0
      ? Math.round((maxWeight / oneRmWeight) * 100)
      : null;

  const hasData = oneRmWeight > 0 || targetWeight > 0 || weightedLogs.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pb-6 pt-8 text-center">
        <Target className="h-8 w-8 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground/60">
          Aucune donnée de performance disponible pour cet exercice.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 overflow-y-auto pb-6">
      {/* Exercise name label */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center">
        {exerciseName}
      </p>

      {/* 1RM + Charge cible — side by side when both present */}
      {(oneRmWeight > 0 || targetWeight > 0) && (
        <div className={`grid gap-3 w-full max-w-xs ${oneRmWeight > 0 && targetWeight > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
          {oneRmWeight > 0 && (
            <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm text-center">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">1RM</span>
              </div>
              <span className="text-3xl font-bold tabular-nums">{oneRmWeight}</span>
              <span className="text-sm text-muted-foreground ml-1">kg</span>
            </div>
          )}

          {targetWeight > 0 && (
            <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm text-center">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Cible{percentOneRm > 0 ? ` ${percentOneRm}%` : ""}
                </span>
              </div>
              <span className="text-3xl font-bold tabular-nums text-primary">{targetWeight}</span>
              <span className="text-sm text-muted-foreground ml-1">kg</span>
            </div>
          )}
        </div>
      )}

      {/* Intensité aujourd'hui */}
      {actualPercent !== null && (
        <div className="w-full max-w-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Intensité
              </span>
            </div>
            <span className="text-sm font-bold tabular-nums">{actualPercent}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${Math.min(actualPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Meilleure série aujourd'hui */}
      {bestSet && (
        <div className="rounded-2xl border border-border/50 bg-card p-4 w-full max-w-xs shadow-sm text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
            Meilleure série
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {bestSet.weight} <span className="text-sm font-normal text-muted-foreground">kg</span>
            <span className="text-muted-foreground mx-1.5">×</span>
            {bestSet.reps} <span className="text-sm font-normal text-muted-foreground">reps</span>
          </p>
        </div>
      )}

      {/* 1RM sparkline */}
      {sessions.length >= 2 && (
        <button
          type="button"
          className="w-full max-w-xs rounded-2xl border border-border/50 bg-card p-4 shadow-sm active:scale-[0.98] transition-transform"
          onClick={() => setChartOpen(true)}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Évolution 1RM
            </span>
            {delta1rm !== 0 && (
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  delta1rm >= 0 ? "text-emerald-600" : "text-red-500",
                )}
              >
                {delta1rm >= 0 ? "+" : ""}{delta1rm.toFixed(1)} kg
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={sessions} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id="restSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="estimated1rm"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                fill="url(#restSparkGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground/50 text-center mt-1">
            Tap pour voir le détail
          </p>
        </button>
      )}

      {/* Full chart sheet */}
      {exerciseId > 0 && userId > 0 && (
        <ExerciseProgressChart
          exerciseId={exerciseId}
          userId={userId}
          exerciseName={exerciseName}
          open={chartOpen}
          onOpenChange={setChartOpen}
        />
      )}
    </div>
  );
}

export default RestPerfsTab;

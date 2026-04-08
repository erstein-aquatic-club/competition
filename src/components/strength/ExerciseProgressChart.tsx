import React, { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Dumbbell } from "lucide-react";
import { motion } from "framer-motion";
import { slideUp } from "@/lib/animations";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useExerciseHistory } from "@/hooks/useExerciseHistory";
import type { ExerciseSession } from "@/hooks/useExerciseHistory";

// ── Props ───────────────────────────────────────────────────

interface ExerciseProgressChartProps {
  exerciseId: number;
  userId: number;
  exerciseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Period options ──────────────────────────────────────────

const PERIODS = [
  { value: 3, label: "3 mois" },
  { value: 6, label: "6 mois" },
  { value: 12, label: "1 an" },
] as const;

// ── Difficulty → color mapping ──────────────────────────────

function difficultyColor(d: number | null): string {
  if (d == null) return "hsl(var(--primary))";
  if (d <= 2) return "#22c55e"; // green
  if (d <= 3) return "#eab308"; // yellow
  if (d <= 4) return "#f97316"; // orange
  return "#ef4444"; // red
}

// ── Custom tooltip ──────────────────────────────────────────

function E1rmTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ExerciseSession & { label: string };
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.label}</p>
      <p className="text-muted-foreground">
        1RM est. <span className="font-mono font-bold text-foreground">{d.estimated1rm} kg</span>
      </p>
      <p className="text-muted-foreground">
        Meilleure : {d.bestSet.weight} kg x {d.bestSet.reps}
      </p>
    </div>
  );
}

function VolumeTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ExerciseSession & { label: string };
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.label}</p>
      <p className="text-muted-foreground">
        Volume <span className="font-mono font-bold text-foreground">{d.totalVolume.toLocaleString("fr-FR")} kg</span>
      </p>
      {d.avgDifficulty != null && (
        <p className="text-muted-foreground">
          Difficulte moy. <span className="font-mono font-bold text-foreground">{d.avgDifficulty}/5</span>
        </p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────

export function ExerciseProgressChart({
  exerciseId,
  userId,
  exerciseName,
  open,
  onOpenChange,
}: ExerciseProgressChartProps) {
  const [months, setMonths] = useState<number>(3);
  const { sessions, current1rm, delta1rm, deltaPercent, isLoading } = useExerciseHistory({
    exerciseId,
    userId,
    months,
  });

  const chartData = sessions.map((s) => ({
    ...s,
    label: format(new Date(s.date), "dd MMM", { locale: fr }),
    shortDate: format(new Date(s.date), "dd/MM"),
  }));

  const hasDifficulty = sessions.some((s) => s.avgDifficulty != null);
  const periodLabel = PERIODS.find((p) => p.value === months)?.label ?? `${months} mois`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-4">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="h-4 w-4 text-primary" />
            {exerciseName}
          </SheetTitle>
          <SheetDescription className="sr-only">Progression de l'exercice</SheetDescription>
        </SheetHeader>

        {/* ── Hero KPI ── */}
        <motion.div
          className="flex flex-col items-center gap-1 py-4"
          variants={slideUp}
          initial="hidden"
          animate="visible"
        >
          {isLoading ? (
            <div className="h-12 w-24 rounded-lg bg-muted animate-pulse" />
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground/25" />
              <p className="text-sm font-medium text-muted-foreground">Aucune donnee</p>
              <p className="text-[11px] text-muted-foreground/60">
                Effectue des seances avec cet exercice pour voir ta progression.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-mono font-bold tracking-tight">{current1rm}</span>
                <span className="text-lg font-mono text-muted-foreground">kg</span>
              </div>
              <span className="text-sm text-muted-foreground">1RM estime</span>
              {delta1rm !== 0 && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    delta1rm >= 0
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-red-500/10 text-red-600",
                  )}
                >
                  {delta1rm >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {delta1rm >= 0 ? "+" : ""}
                  {delta1rm.toFixed(1)} kg ({deltaPercent >= 0 ? "+" : ""}
                  {deltaPercent.toFixed(0)}%)
                </span>
              )}
              <span className="text-[11px] text-muted-foreground/60">{periodLabel}</span>
            </>
          )}
        </motion.div>

        {/* ── Period toggle ── */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setMonths(p.value)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-all active:scale-95",
                months === p.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {sessions.length > 0 && !isLoading && (
          <div className="space-y-6">
            {/* ── 1RM Line/Area Chart ── */}
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                1RM estime
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="e1rmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                    width={40}
                  />
                  <Tooltip content={<E1rmTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="estimated1rm"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#e1rmGrad)"
                    dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Volume Bar Chart ── */}
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Volume total
              </h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<VolumeTooltip />} />
                  <Bar dataKey="totalVolume" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={`cell-${i}`}
                        fill={hasDifficulty ? difficultyColor(entry.avgDifficulty) : "hsl(var(--primary))"}
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Difficulty legend */}
              {hasDifficulty && (
                <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                    Facile
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#eab308" }} />
                    Moyen
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f97316" }} />
                    Dur
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                    Max
                  </span>
                </div>
              )}
            </div>

            {/* ── Session details table ── */}
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Details par seance
              </h3>
              <div className="space-y-1.5">
                {[...chartData].reverse().map((s) => (
                  <div
                    key={s.date}
                    className="flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2"
                  >
                    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/40">
                      <span className="text-[13px] font-bold leading-none">
                        {format(new Date(s.date), "dd")}
                      </span>
                      <span className="text-[8px] font-semibold uppercase text-muted-foreground leading-tight mt-0.5">
                        {format(new Date(s.date), "MMM", { locale: fr })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] tabular-nums">
                        <span className="font-semibold">{s.estimated1rm} kg</span>
                        <span className="text-muted-foreground"> 1RM</span>
                        <span className="text-muted-foreground/40"> · </span>
                        <span className="text-muted-foreground">{s.sets.length} series</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        Meilleure : {s.bestSet.weight} kg x {s.bestSet.reps}
                        {s.avgDifficulty != null && (
                          <> · Diff. {s.avgDifficulty}/5</>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

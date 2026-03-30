import { useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Dumbbell, Clock, Zap, Activity, MessageSquare } from "lucide-react";
import { staggerChildren, listItem } from "@/lib/animations";
import type { LocalStrengthRun } from "@/lib/types";
import {
  computeRunTonnage,
  computeRunTotalReps,
  computeRunSRPE,
  groupLogsByExercise,
  computeAvgDifficulty,
} from "@/lib/strengthHistoryUtils";

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "Terminée" },
  in_progress: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "En cours" },
  abandoned: { bg: "bg-red-400/10", text: "text-red-500 dark:text-red-400", label: "Abandonnée" },
};

function difficultyColor(d: number | null | undefined): string {
  if (!d) return "bg-muted";
  if (d <= 2) return "bg-emerald-500";
  if (d <= 3) return "bg-amber-400";
  if (d <= 4) return "bg-orange-500";
  return "bg-red-500";
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-muted/40 px-3 py-2.5 min-w-[70px]">
      {icon}
      <span className="text-[15px] font-bold tabular-nums leading-none">{value}</span>
      <span className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wide">{label}</span>
    </div>
  );
}

function MiniGauge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/40" />
        <circle
          cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className={color}
          transform="rotate(-90 22 22)"
        />
        <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[12px] font-bold">
          {value}
        </text>
      </svg>
      <span className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wide">{label}</span>
    </div>
  );
}

interface RunDetailSheetProps {
  run: LocalStrengthRun;
  exerciseNames: Map<number, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RunDetailSheet({ run, exerciseNames, open, onOpenChange }: RunDetailSheetProps) {
  const logs = run.logs ?? run.strength_set_logs ?? [];
  const status = run.status ?? "completed";
  const style = statusStyle[status] ?? statusStyle.completed;
  const dateStr = run.started_at || run.date || run.created_at;

  const tonnage = useMemo(() => computeRunTonnage(logs), [logs]);
  const totalReps = useMemo(() => computeRunTotalReps(logs), [logs]);
  const srpe = useMemo(() => computeRunSRPE(run.rpe ?? run.feeling ?? null, run.duration ?? null), [run]);
  const exerciseGroups = useMemo(() => groupLogsByExercise(logs, exerciseNames), [logs, exerciseNames]);
  const avgDifficulty = useMemo(() => computeAvgDifficulty(logs), [logs]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">
            {dateStr ? format(new Date(dateStr), "EEEE d MMMM yyyy", { locale: fr }) : "Séance"}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", style.bg, style.text)}>
              {style.label}
            </span>
            {dateStr && (
              <span className="text-muted-foreground">
                {format(new Date(dateStr), "HH:mm", { locale: fr })}
              </span>
            )}
            {run.duration != null && run.duration > 0 && (
              <span className="text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-3 w-3" />{run.duration} min
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* KPI Cards */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <KpiCard icon={<Dumbbell className="h-4 w-4 text-primary" />} label="Tonnage" value={`${tonnage.toLocaleString("fr-FR")} kg`} />
          <KpiCard icon={<Activity className="h-4 w-4 text-blue-500" />} label="Séries" value={String(logs.length)} />
          <KpiCard icon={<Activity className="h-4 w-4 text-violet-500" />} label="Reps" value={String(totalReps)} />
          {srpe > 0 && <KpiCard icon={<Zap className="h-4 w-4 text-amber-500" />} label="sRPE" value={String(srpe)} />}
        </div>

        {/* Exercises */}
        {exerciseGroups.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exercices</h3>
            <motion.div className="space-y-2" variants={staggerChildren} initial="hidden" animate="visible">
              {exerciseGroups.map((group) => (
                <motion.div key={group.exerciseId} variants={listItem} className="rounded-xl border bg-card p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold">{group.exerciseName}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {group.volume > 0 && <>{group.volume.toLocaleString("fr-FR")} kg</>}
                      {group.maxWeight > 0 && <> · max {group.maxWeight} kg</>}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    {group.sets.map((set, i) => {
                      const w = Number(set.weight ?? 0);
                      const r = Number(set.reps ?? 0);
                      return (
                        <div key={set.id ?? i} className="flex items-center gap-2 text-[11px] tabular-nums">
                          <span className="w-4 text-muted-foreground text-right">{i + 1}</span>
                          <span className="flex-1">
                            {w > 0 ? `${w} kg` : "—"} × {r > 0 ? r : "—"}
                          </span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((d) => (
                              <span
                                key={d}
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  set.difficulty != null && d <= set.difficulty
                                    ? difficultyColor(set.difficulty)
                                    : "bg-muted-foreground/15",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {/* Ressenti */}
        {((run.rpe ?? 0) > 0 || (run.fatigue ?? 0) > 0 || (run.feeling ?? 0) > 0 || avgDifficulty > 0) && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ressenti</h3>
            <div className="flex justify-around py-2">
              {(run.rpe ?? 0) > 0 && <MiniGauge value={run.rpe!} max={10} label="RPE" color="text-orange-500" />}
              {(run.fatigue ?? 0) > 0 && <MiniGauge value={run.fatigue!} max={5} label="Fatigue" color="text-red-500" />}
              {(run.feeling ?? 0) > 0 && <MiniGauge value={run.feeling!} max={5} label="Forme" color="text-emerald-500" />}
              {avgDifficulty > 0 && <MiniGauge value={avgDifficulty} max={5} label="Difficulté" color="text-amber-500" />}
            </div>
          </div>
        )}

        {/* Comments */}
        {run.comments && (
          <div className="mt-4 space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Notes
            </h3>
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground whitespace-pre-wrap">
              {run.comments}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

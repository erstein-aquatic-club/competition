import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Dumbbell, TrendingUp, Timer } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { SetLogEntry } from "@/lib/types";

interface SessionSummaryProps {
  sessionTitle: string;
  logs: SetLogEntry[];
  durationMinutes: number | null;
  exerciseNames: Map<number, string>;
  onClose: () => void;
}

function isBodyweight(w: number | string | null | undefined): boolean {
  if (w == null) return false;
  const s = String(w).trim().toLowerCase();
  return s === "bw" || s === "pdc" || s === "0" || s === "";
}

export function SessionSummary({ sessionTitle, logs, durationMinutes, exerciseNames, onClose }: SessionSummaryProps) {
  const reduce = useReducedMotion();
  const stats = useMemo(() => {
    let totalTonnage = 0;
    let totalSets = 0;
    let totalReps = 0;
    const exerciseIds = new Set<number>();
    let bestSet: { name: string; weight: number; reps: number } | null = null;

    for (const log of logs) {
      totalSets++;
      const reps = Number(log.reps) || 0;
      totalReps += reps;
      const name = exerciseNames.get(log.exercise_id) ?? `Ex #${log.exercise_id}`;
      exerciseIds.add(log.exercise_id);

      if (!isBodyweight(log.weight)) {
        const weight = Number(log.weight) || 0;
        totalTonnage += weight * reps;
        if (!bestSet || weight > bestSet.weight) {
          bestSet = { name, weight, reps };
        }
      }
    }

    return { totalTonnage, totalSets, totalReps, exerciseCount: exerciseIds.size, bestSet };
  }, [logs, exerciseNames]);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-md space-y-6 px-4 py-8"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold heading-display">Séance terminée</h2>
        <p className="text-sm text-muted-foreground">{sessionTitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Dumbbell className="h-4 w-4" />} label="Tonnage" value={stats.totalTonnage > 0 ? `${Math.round(stats.totalTonnage)} kg` : "—"} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Séries" value={`${stats.totalSets}`} />
        <StatCard icon={<Timer className="h-4 w-4" />} label="Durée" value={durationMinutes ? `${durationMinutes} min` : "—"} />
        <StatCard icon={<Dumbbell className="h-4 w-4" />} label="Exercices" value={`${stats.exerciseCount}`} />
      </div>

      {stats.bestSet && (
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Meilleure serie</p>
          <p className="mt-1 text-lg font-bold">{stats.bestSet.name}</p>
          <p className="text-sm text-muted-foreground">{stats.bestSet.weight} kg x {stats.bestSet.reps} reps</p>
        </div>
      )}

      <Button className="w-full" size="lg" onClick={onClose}>Retour</Button>
    </motion.div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}

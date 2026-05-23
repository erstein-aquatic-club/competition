import { memo, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getStrengthHistory, getExercises } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { staggerChildren, listItem } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { Dumbbell, ChevronDown, Clock, Flame, TrendingUp, Zap } from "lucide-react";
import type { LocalStrengthRun } from "@/lib/types";
import { ExerciseProgressChart } from "./ExerciseProgressChart";
import { RunDetailSheet } from "./RunDetailSheet";
import { computeRunTonnage, computeRunSRPE, groupLogsByExercise } from "@/lib/strengthHistoryUtils";

const STATUS_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "completed", label: "Terminé" },
  { value: "in_progress", label: "En cours" },
  { value: "abandoned", label: "Abandonné" },
] as const;

const statusStyle: Record<string, { dot: string; text: string }> = {
  completed: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  in_progress: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  abandoned: { dot: "bg-red-400", text: "text-red-500 dark:text-red-400" },
};

interface HistoryTableProps {
  athleteName: string | null;
  athleteId: number | null;
  athleteKey: number | string | null;
}

function HistoryTableImpl({ athleteName, athleteId, athleteKey }: HistoryTableProps) {
  const reduce = useReducedMotion();
  const listVariants = reduce ? {} : staggerChildren;
  const itemVariants = reduce ? {} : listItem;
  const [historyStatus, setHistoryStatus] = useState("all");
  const [progressExercise, setProgressExercise] = useState<{ id: number; name: string } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [selectedRun, setSelectedRun] = useState<LocalStrengthRun | null>(null);

  const strengthHistoryQuery = useInfiniteQuery({
    queryKey: ["strength_history", athleteKey, historyStatus],
    queryFn: ({ pageParam = 0 }) =>
      getStrengthHistory(athleteName!, {
        athleteId: athleteId,
        limit: 10,
        offset: pageParam,
        order: "desc",
        status: historyStatus === "all" ? undefined : historyStatus,
      }),
    enabled: !!athleteName,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.pagination.offset + lastPage.pagination.limit;
      return nextOffset < lastPage.pagination.total ? nextOffset : undefined;
    },
    initialPageParam: 0,
  });

  const historyRuns = strengthHistoryQuery.data?.pages.flatMap((page) => page.runs) ?? [];

  // Fetch exercises to get exercise names for the progression section
  const { data: exercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => getExercises(),
  });

  const exerciseNames = useMemo(() => {
    const map = new Map<number, string>();
    if (exercises) {
      for (const ex of exercises) {
        map.set(ex.id, ex.nom_exercice ?? `Exercice #${ex.id}`);
      }
    }
    return map;
  }, [exercises]);

  // Build unique exercise list from history runs (set_logs)
  const exerciseList = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number }>();
    for (const run of historyRuns) {
      const logs = (run.strength_set_logs ?? run.logs ?? []) as Array<{ exercise_id: number }>;
      for (const log of logs) {
        const eid = Number(log.exercise_id);
        if (!eid) continue;
        const existing = map.get(eid);
        if (existing) {
          existing.count++;
        } else {
          const ex = exercises?.find((e) => e.id === eid);
          map.set(eid, {
            id: eid,
            name: ex?.nom_exercice ?? `Exercice #${eid}`,
            count: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [historyRuns, exercises]);

  return (
    <div className="space-y-3 pt-2">
      {/* ── Pill filters ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-hide">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setHistoryStatus(opt.value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-all active:scale-95",
              historyStatus === opt.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Runs list ── */}
      {historyRuns.length > 0 ? (
        <motion.div
          className="space-y-1.5"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {historyRuns.map((run: LocalStrengthRun) => {
            const status = run.status ?? "completed";
            const style = statusStyle[status] ?? statusStyle.completed;
            const setCount = run.logs?.length ?? run.strength_set_logs?.length ?? 0;
            const duration = run.duration ?? 0;
            const feeling = run.feeling ?? run.rpe ?? 0;
            const dateStr = run.started_at || run.date || run.created_at;
            const progressPct = run.progress_pct ?? 0;

            return (
              <div key={run.id}>
                <motion.div
                  variants={itemVariants}
                  onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                  role="button"
                  className="flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 transition-all hover:border-primary/30 cursor-pointer"
                >
                  {/* Date block */}
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/40">
                    <span className="text-[15px] font-bold leading-none">
                      {dateStr ? format(new Date(dateStr), "dd") : "—"}
                    </span>
                    <span className="text-[9px] font-semibold uppercase text-muted-foreground leading-tight mt-0.5">
                      {dateStr ? format(new Date(dateStr), "MMM", { locale: fr }) : ""}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", style.dot)} />
                      <span className={cn("text-[11px] font-semibold capitalize", style.text)}>
                        {status === "completed" ? "Terminée" : status === "in_progress" ? "En cours" : "Abandonnée"}
                      </span>
                      {status === "in_progress" && progressPct > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          ({Math.round(progressPct)}%)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      {setCount > 0 && (
                        <><span className="font-medium text-foreground">{setCount}</span> séries</>
                      )}
                      {duration > 0 && (
                        <>
                          {setCount > 0 && <span className="text-muted-foreground/40"> · </span>}
                          <Clock className="inline h-3 w-3 -mt-px mr-0.5" />{duration} min
                        </>
                      )}
                      {feeling > 0 && (
                        <>
                          <span className="text-muted-foreground/40"> · </span>
                          <Flame className="inline h-3 w-3 -mt-px mr-0.5" />{feeling}/5
                        </>
                      )}
                    </p>
                  </div>

                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200", expandedRunId === run.id && "rotate-180")} />
                </motion.div>

                <AnimatePresence>
                  {expandedRunId === run.id && (() => {
                    const logs = run.logs ?? run.strength_set_logs ?? [];
                    const groups = groupLogsByExercise(logs, exerciseNames);
                    const tonnage = computeRunTonnage(logs);
                    const srpe = computeRunSRPE(run.rpe ?? run.feeling ?? null, run.duration ?? null);
                    return (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-2.5 pb-2.5 pt-1 space-y-2">
                          {/* Exercise pills */}
                          {groups.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {groups.map((g) => (
                                <span key={g.exerciseId} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {g.exerciseName}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Stats row */}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            {srpe > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Zap className="h-3 w-3 text-amber-500" />sRPE {srpe}
                              </span>
                            )}
                            {tonnage > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Dumbbell className="h-3 w-3 text-primary" />{tonnage.toLocaleString("fr-FR")} kg
                              </span>
                            )}
                          </div>
                          {/* Detail button */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedRun(run); }}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Voir détails →
                          </button>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Dumbbell className="h-8 w-8 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">Aucun historique</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1">
            Tes séances terminées apparaîtront ici.
          </p>
        </div>
      )}

      {/* Load more */}
      {strengthHistoryQuery.hasNextPage && (
        <button
          type="button"
          onClick={() => strengthHistoryQuery.fetchNextPage()}
          disabled={strengthHistoryQuery.isFetchingNextPage}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/25 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors active:scale-[0.98]"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {strengthHistoryQuery.isFetchingNextPage ? "Chargement…" : "Charger plus"}
        </button>
      )}

      {/* ── Exercise progression section ── */}
      {exerciseList.length > 0 && athleteId && (
        <div className="pt-3 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Progression par exercice
          </h3>
          <motion.div
            className="space-y-1.5"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {exerciseList.map((ex) => (
              <motion.button
                key={ex.id}
                type="button"
                variants={listItem}
                onClick={() => setProgressExercise(ex)}
                className="w-full flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 transition-all hover:border-primary/30 active:scale-[0.98] text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Dumbbell className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate">{ex.name}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {ex.count} {ex.count > 1 ? "series" : "serie"}
                  </p>
                </div>
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </motion.button>
            ))}
          </motion.div>
        </div>
      )}

      {/* ── Exercise progress chart sheet ── */}
      {progressExercise && athleteId && (
        <ExerciseProgressChart
          exerciseId={progressExercise.id}
          userId={athleteId}
          exerciseName={progressExercise.name}
          intensityMetric={exercises?.find((e) => e.id === progressExercise.id)?.intensity_metric}
          open={!!progressExercise}
          onOpenChange={(open) => {
            if (!open) setProgressExercise(null);
          }}
        />
      )}

      {selectedRun && (
        <RunDetailSheet
          run={selectedRun}
          exerciseNames={exerciseNames}
          open={!!selectedRun}
          onOpenChange={(open) => { if (!open) setSelectedRun(null); }}
        />
      )}
    </div>
  );
}

export const HistoryTable = memo(HistoryTableImpl);

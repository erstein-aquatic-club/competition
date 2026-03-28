import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { staggerChildren, listItem } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { Dumbbell, ChevronDown, Clock, Flame } from "lucide-react";
import type { LocalStrengthRun } from "@/lib/types";

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

export function HistoryTable({ athleteName, athleteId, athleteKey }: HistoryTableProps) {
  const [historyStatus, setHistoryStatus] = useState("all");

  const strengthHistoryQuery = useInfiniteQuery({
    queryKey: ["strength_history", athleteKey, historyStatus],
    queryFn: ({ pageParam = 0 }) =>
      api.getStrengthHistory(athleteName!, {
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
          variants={staggerChildren}
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
              <motion.div
                key={run.id}
                variants={listItem}
                className="flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 transition-all hover:border-primary/30"
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
              </motion.div>
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
    </div>
  );
}

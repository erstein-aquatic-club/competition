import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Play, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Competition, StrengthSessionTemplate } from "@/lib/api/types";
import type { WeekInstance } from "@/lib/strength/strengthPlanWeeks";
import { PHASE_STYLES } from "@/lib/strength/strengthPhaseStyles";
import { fmtDD_MM } from "@/components/coach/swim/swimPlanningShared";
import { MyPlanSessionRow } from "./MyPlanSessionRow";

interface MyPlanWeekCardProps {
  instance: WeekInstance;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  competitions: Competition[];
  getDayCompetitions: (monday: Date, dayIndex: number) => Competition[];
  onSelectSession: (session: StrengthSessionTemplate) => void;
  /** When provided AND we render a session matching today's day-of-week
   *  inside the current week, an extra "Démarrer maintenant" CTA appears. */
  onLaunchSessionDirect?: (session: StrengthSessionTemplate) => void;
  onSelectCompetition: (c: Competition) => void;
}

/** Convert JS Date.getDay() (Sun=0..Sat=6) to plan day-of-week (Mon=0..Sun=6). */
function todayPlanDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function MyPlanWeekCard({
  instance,
  isCurrent,
  isExpanded,
  onToggleExpand,
  competitions,
  getDayCompetitions,
  onSelectSession,
  onLaunchSessionDirect,
  onSelectCompetition,
}: MyPlanWeekCardProps) {
  const todayIdx = isCurrent ? todayPlanDayIndex() : -1;
  const style = PHASE_STYLES[instance.phase];
  const hasCompetition = competitions.length > 0;

  const dotColor = hasCompetition
    ? "bg-amber-500"
    : isCurrent
      ? "bg-primary"
      : instance.sessions.length > 0
        ? "bg-emerald-500"
        : "bg-muted-foreground/25";

  return (
    <div className="relative pl-14 mb-3">
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background",
          dotColor,
        )}
      />

      {/* Card */}
      <div className={cn("rounded-xl border bg-card", isCurrent && "ring-2 ring-primary")}>
        {/* Header button */}
        <button
          type="button"
          onClick={onToggleExpand}
          className={cn(
            "w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[48px] hover:bg-muted/40 active:bg-muted/60",
            isExpanded || hasCompetition ? "rounded-t-xl" : "rounded-xl",
          )}
        >
          <span className="text-xs font-bold tabular-nums text-foreground shrink-0">
            S{instance.week.weekNumber}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {fmtDD_MM(instance.week.monday)} – {fmtDD_MM(instance.week.sunday)}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border-0 shrink-0",
              style.bg,
              style.text,
            )}
          >
            {instance.phase.toUpperCase()}
          </span>
          {/* Session preview dots */}
          {instance.sessions.length > 0 && (
            <div className="flex items-center gap-0.5">
              {instance.sessions.slice(0, 7).map((_, i) => (
                <span key={i} className={cn("h-[6px] w-[6px] rounded-full", style.dot)} />
              ))}
            </div>
          )}
          <div className="flex-1" />
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground/60 flex items-center"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>

        {/* Competition chips */}
        {competitions.length > 0 && (
          <div className={cn("px-3 pb-2.5 flex flex-wrap gap-1", isExpanded && "border-b border-border/50")}>
            {competitions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCompetition(c);
                }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
              >
                <Trophy className="h-2.5 w-2.5 shrink-0" />
                {c.name}
                {c.date && (
                  <span className="opacity-60 ml-0.5">
                    {fmtDD_MM(new Date(c.date + "T00:00:00"))}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Expanded day grid */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="expand"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="bg-muted/20 px-3 py-2 rounded-b-xl space-y-1">
                {DAY_LABELS.map((label, dayIdx) => {
                  const daySessions = instance.sessions.filter(
                    (ws) => ws.dayIndex === dayIdx,
                  );
                  const dayComps = getDayCompetitions(instance.week.monday, dayIdx);

                  return (
                    <div key={dayIdx} className="grid grid-cols-[48px_1fr] gap-1 items-start">
                      <span className="text-[11px] font-medium text-muted-foreground pt-2.5 select-none">
                        {label}
                      </span>
                      <div className="space-y-1">
                        {/* Competition slot */}
                        {dayComps.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => onSelectCompetition(c)}
                            className="w-full flex items-center gap-2 h-10 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400"
                          >
                            <Trophy className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-[12px] font-medium truncate flex-1">
                              {c.name}
                            </span>
                          </button>
                        ))}
                        {/* Session rows */}
                        {daySessions.map((ws) => {
                          const isToday = dayIdx === todayIdx;
                          return (
                            <div key={ws.session.id} className="space-y-1">
                              <MyPlanSessionRow
                                weekSession={ws}
                                onSelect={() => onSelectSession(ws.session)}
                              />
                              {/* "Démarrer maintenant" CTA only on today's row,
                                  current week, when the parent supplied a direct
                                  launch handler. The plain row tap still routes
                                  to the reader for swimmers who want a preview. */}
                              {isToday && onLaunchSessionDirect && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLaunchSessionDirect(ws.session);
                                  }}
                                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 h-9 text-xs font-semibold text-primary-foreground active:scale-[0.98] transition shadow-sm"
                                >
                                  <Play className="h-3.5 w-3.5 fill-current" />
                                  Démarrer maintenant
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {/* Empty day */}
                        {daySessions.length === 0 && dayComps.length === 0 && (
                          <div className="h-10 flex items-center px-2.5">
                            <span className="text-[11px] text-muted-foreground/30">—</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Sessions without day prefix */}
                {instance.sessions
                  .filter((ws) => ws.dayIndex === -1)
                  .map((ws) => (
                    <div key={ws.session.id} className="grid grid-cols-[48px_1fr] gap-1 items-start">
                      <span className="text-[11px] font-medium text-muted-foreground pt-2.5 select-none">
                        —
                      </span>
                      <MyPlanSessionRow
                        weekSession={ws}
                        onSelect={() => onSelectSession(ws.session)}
                      />
                    </div>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

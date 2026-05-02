/**
 * SwimmerWeekMatrixCard — Compact at-a-glance "Ma semaine" card for the swimmer
 * home page. Mirrors the matrix layout of the coach card on Coach.tsx so a
 * swimmer can scan in one glance:
 *   • which slots have a coach session assigned vs. empty;
 *   • which past sessions are missing a feedback (ressenti).
 *
 * Tap → /natation (the detailed swim calendar).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Session } from "@/lib/api";
import { useSlotCalendar, getSlotScheduleBucket, type SlotInstance } from "@/hooks/useSlotCalendar";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Sunrise,
  Sunset,
} from "lucide-react";
import {
  classifyCell,
  foldCellStates,
  type CellState,
} from "./swimmerWeekMatrix";

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

function isVisibleAssignmentInstance(inst: SlotInstance): boolean {
  return inst.state === "published" && inst.assignment != null;
}

type CellInfo = {
  state: CellState;
  count: number;
};

function buildCompletionLookup(sessions: Session[] | undefined | null): {
  assignmentIds: Set<number>;
  slotKeys: Set<string>;
} {
  const assignmentIds = new Set<number>();
  const slotKeys = new Set<string>();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (typeof s.assignment_id === "number" && Number.isFinite(s.assignment_id)) {
      assignmentIds.add(s.assignment_id);
    }
    const iso = String(s.date ?? "").slice(0, 10);
    if (!iso) continue;
    const slot = s.slot === "Soir" ? "PM" : "AM";
    slotKeys.add(`${iso}__${slot}`);
  }
  return { assignmentIds, slotKeys };
}

function hasFeedbackFor(
  inst: SlotInstance,
  bucket: "morning" | "evening",
  lookup: { assignmentIds: Set<number>; slotKeys: Set<string> },
): boolean {
  const assignmentId = inst.assignment?.id;
  if (typeof assignmentId === "number" && lookup.assignmentIds.has(assignmentId)) {
    return true;
  }
  const slot = bucket === "morning" ? "AM" : "PM";
  return lookup.slotKeys.has(`${inst.date}__${slot}`);
}

function CellDot({ state, count, isToday }: { state: CellState; count: number; isToday: boolean }) {
  const ringClass = isToday ? "ring-1 ring-primary/30 ring-offset-1 ring-offset-card" : "";

  if (state === "none") {
    return (
      <div className="flex h-9 items-center justify-center">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/20" aria-hidden />
        <span className="sr-only">Aucun créneau</span>
      </div>
    );
  }

  if (state === "past-no-session") {
    return (
      <div className="flex h-9 items-center justify-center">
        <span
          className={[
            "h-1.5 w-1.5 rounded-full bg-muted-foreground/30",
            isToday ? "ring-1 ring-primary/30 ring-offset-1 ring-offset-card" : "",
          ].join(" ")}
          aria-label="Créneau passé sans séance"
        />
      </div>
    );
  }

  if (state === "unassigned") {
    return (
      <div className="flex h-9 items-center justify-center">
        <div
          className={[
            "relative flex h-7 w-7 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-amber-400 bg-amber-50/80 dark:border-amber-500/60 dark:bg-amber-950/30",
            ringClass,
          ].join(" ")}
          aria-label="Pas de séance assignée"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" aria-hidden />
        </div>
      </div>
    );
  }

  if (state === "missed-feedback") {
    return (
      <div className="flex h-9 items-center justify-center">
        <div
          className={[
            "relative flex h-7 w-7 items-center justify-center rounded-[10px] bg-rose-500 text-white shadow-sm shadow-rose-500/30 dark:bg-rose-500/90",
            ringClass,
          ].join(" ")}
          aria-label="Ressenti manquant"
        >
          <AlertCircle className="h-3.5 w-3.5 stroke-[2.5]" />
          {count > 1 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-700 px-0.5 text-[8px] font-black tabular-nums leading-none text-white ring-1 ring-card">
              {count}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex h-9 items-center justify-center">
        <div
          className={[
            "flex h-7 w-7 items-center justify-center rounded-[10px] bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 dark:bg-emerald-500/90",
            ringClass,
          ].join(" ")}
          aria-label={count > 1 ? `${count} séances faites` : "Ressenti saisi"}
        >
          {count > 1 ? (
            <span className="text-[10px] font-black tabular-nums leading-none">{count}</span>
          ) : (
            <Check className="h-3.5 w-3.5 stroke-[3]" />
          )}
        </div>
      </div>
    );
  }

  // assigned-future / assigned-today
  const isToday2 = state === "assigned-today";
  return (
    <div className="flex h-9 items-center justify-center">
      <div
        className={[
          "flex h-7 w-7 items-center justify-center rounded-[10px] text-white shadow-sm",
          isToday2
            ? "bg-primary shadow-primary/30 dark:bg-primary/90"
            : "bg-sky-500 shadow-sky-500/30 dark:bg-sky-500/85",
          ringClass,
        ].join(" ")}
        aria-label={count > 1 ? `${count} séances à venir` : "Séance assignée"}
      >
        {count > 1 ? (
          <span className="text-[10px] font-black tabular-nums leading-none">{count}</span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
        )}
      </div>
    </div>
  );
}

export default function SwimmerWeekMatrixCard() {
  const userId = useAuth((s) => s.userId);
  const user = useAuth((s) => s.user);
  const [, navigate] = useLocation();

  const { mondayIso, weekDates, instancesByDate, isLoading } = useSlotCalendar();

  // Reuse the same query key as SwimmerHome — react-query dedupes.
  const { data: sessions } = useQuery({
    queryKey: ["sessions", userId ?? user],
    queryFn: () => api.getSessions(user!, userId),
    enabled: !!user,
  });

  const today = useMemo(() => todayIso(), []);

  const todayIndex = useMemo(() => {
    const [y, m, d] = mondayIso.split("-").map(Number);
    const monday = new Date(y, m - 1, d);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const diff = Math.round((todayDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0 || diff > 6) return -1;
    return diff;
  }, [mondayIso]);

  const completionLookup = useMemo(() => buildCompletionLookup(sessions), [sessions]);

  const grid = useMemo(() => {
    const morning: CellInfo[] = [];
    const evening: CellInfo[] = [];
    let plannedPast = 0;
    let donePast = 0;
    let missedCount = 0;
    let assignedFutureCount = 0;
    let totalSlots = 0;

    for (let i = 0; i < weekDates.length; i += 1) {
      const dateIso = weekDates[i];
      const dayInstances = instancesByDate.get(dateIso) ?? [];
      const isPastDay = dateIso < today;
      const isTodayDay = dateIso === today;

      const morningStates: CellState[] = [];
      const eveningStates: CellState[] = [];
      let morningCount = 0;
      let eveningCount = 0;

      for (const inst of dayInstances) {
        const bucket = getSlotScheduleBucket(inst.slot.start_time);
        if (bucket === null) continue;
        totalSlots += 1;

        const hasAssignment = isVisibleAssignmentInstance(inst);
        const hasFeedback = hasAssignment
          ? hasFeedbackFor(inst, bucket, completionLookup)
          : false;

        const cellState = classifyCell({
          state: inst.state,
          hasAssignment,
          hasFeedback,
          isPast: isPastDay,
          isToday: isTodayDay,
        });

        if (hasAssignment) {
          if (isPastDay) {
            plannedPast += 1;
            if (hasFeedback) donePast += 1;
            else missedCount += 1;
          } else {
            assignedFutureCount += 1;
          }
        }

        if (bucket === "morning") {
          morningStates.push(cellState);
          morningCount += 1;
        } else {
          eveningStates.push(cellState);
          eveningCount += 1;
        }
      }

      morning.push({
        state: morningStates.length > 0 ? foldCellStates(morningStates) : "none",
        count: morningCount,
      });
      evening.push({
        state: eveningStates.length > 0 ? foldCellStates(eveningStates) : "none",
        count: eveningCount,
      });
    }

    return {
      morning,
      evening,
      plannedPast,
      donePast,
      missedCount,
      assignedFutureCount,
      totalSlots,
    };
  }, [weekDates, instancesByDate, completionLookup, today]);

  const handleTap = () => navigate("/natation");

  if (isLoading && grid.totalSlots === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Ma semaine
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          <div className="h-20 w-full animate-pulse rounded bg-muted" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Ma semaine
      </h2>

      <button
        type="button"
        onClick={handleTap}
        className="block w-full rounded-2xl border bg-card p-4 text-left transition-colors active:bg-muted"
      >
        <div
          className="grid items-center gap-y-1.5"
          style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}
        >
          {/* Header row */}
          <div aria-hidden />
          {DAY_LABELS.map((label, i) => {
            const [y, m, d] = mondayIso.split("-").map(Number);
            const dayDate = new Date(y, m - 1, d);
            dayDate.setDate(dayDate.getDate() + i);
            const isToday = i === todayIndex;
            return (
              <div
                key={`h-${i}`}
                className="flex flex-col items-center gap-0.5 pb-1 leading-none"
              >
                <span
                  className={[
                    "text-[9px] font-black uppercase tracking-[0.18em]",
                    isToday ? "text-primary" : "text-muted-foreground/60",
                  ].join(" ")}
                >
                  {label}
                </span>
                <span
                  className={[
                    "text-[11px] tabular-nums",
                    isToday ? "font-black text-primary" : "font-semibold text-muted-foreground/50",
                  ].join(" ")}
                >
                  {dayDate.getDate()}
                </span>
                <span
                  className={[
                    "h-[2px] w-4 rounded-full",
                    isToday ? "bg-primary" : "bg-transparent",
                  ].join(" ")}
                  aria-hidden
                />
              </div>
            );
          })}

          {/* Matin row */}
          <div className="flex items-center justify-end gap-1 pr-1.5 whitespace-nowrap">
            <Sunrise className="h-3 w-3 shrink-0 text-amber-500/80" />
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-muted-foreground">
              Matin
            </span>
          </div>
          {grid.morning.map((cell, i) => (
            <CellDot
              key={`m-${i}`}
              state={cell.state}
              count={cell.count}
              isToday={i === todayIndex}
            />
          ))}

          {/* Aprèm row */}
          <div className="flex items-center justify-end gap-1 pr-1.5 whitespace-nowrap">
            <Sunset className="h-3 w-3 shrink-0 text-rose-400/90" />
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-muted-foreground">
              Aprèm
            </span>
          </div>
          {grid.evening.map((cell, i) => (
            <CellDot
              key={`a-${i}`}
              state={cell.state}
              count={cell.count}
              isToday={i === todayIndex}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-black tabular-nums leading-none">
              {grid.donePast}
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
              / {grid.plannedPast} séance{grid.plannedPast > 1 ? "s" : ""} faite{grid.donePast > 1 ? "s" : ""}
            </span>
          </div>
          {grid.totalSlots === 0 ? (
            <span className="text-[11px] italic text-muted-foreground">
              Aucun créneau cette semaine
            </span>
          ) : grid.missedCount > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {grid.missedCount} ressenti{grid.missedCount > 1 ? "s" : ""} à compléter
            </span>
          ) : grid.plannedPast > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Tout est à jour
            </span>
          ) : grid.assignedFutureCount > 0 ? (
            <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              {grid.assignedFutureCount} séance{grid.assignedFutureCount > 1 ? "s" : ""} à venir
            </span>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">
              Aucune séance assignée
            </span>
          )}
        </div>
      </button>
    </section>
  );
}

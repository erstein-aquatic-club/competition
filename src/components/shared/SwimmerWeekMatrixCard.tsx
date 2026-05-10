/**
 * SwimmerWeekMatrixCard — Compact at-a-glance "Ma semaine" card for the swimmer
 * home page. Mirrors the matrix layout of the coach card on Coach.tsx so a
 * swimmer can scan in one glance:
 *   • which slots have a coach session actually planned for THIS swimmer;
 *   • which past sessions are missing a feedback (ressenti).
 *
 * Data source: get_swimmer_sessions RPC (per-swimmer resolution including
 * individual / subgroup / group precedence and absences). Slots that don't
 * apply to this swimmer this week never appear.
 *
 * Tap → /natation (the detailed swim calendar).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { getSessions } from "@/lib/api";
import type { Session } from "@/lib/api";
import { getSwimmerSessions } from "@/lib/api/swimmerSessions";
import type { SwimmerSession } from "@/lib/api/types";
import { getMondayOfWeek } from "@/hooks/useSlotCalendar";
import { toISODate, addDaysIso } from "@/lib/date";
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

function todayIso(): string {
  return toISODate(new Date());
}

function buildWeekDates(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(mondayIso, i));
}

type CellInfo = {
  state: CellState;
  count: number;
};

type CompletionLookup = {
  assignmentIds: Set<number>;
  slotKeys: Set<string>;
};

function buildCompletionLookup(sessions: Session[] | undefined | null): CompletionLookup {
  const assignmentIds = new Set<number>();
  const slotKeys = new Set<string>();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (typeof s.assignment_id === "number" && Number.isFinite(s.assignment_id)) {
      assignmentIds.add(s.assignment_id);
    }
    const iso = String(s.date ?? "").slice(0, 10);
    if (!iso) continue;
    const bucket = s.slot === "Soir" ? "evening" : "morning";
    slotKeys.add(`${iso}__${bucket}`);
  }
  return { assignmentIds, slotKeys };
}

function rowHasFeedback(row: SwimmerSession, lookup: CompletionLookup): boolean {
  if (typeof row.assignment_id === "number" && lookup.assignmentIds.has(row.assignment_id)) {
    return true;
  }
  return lookup.slotKeys.has(`${row.scheduled_date}__${row.bucket}`);
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

  const mondayIso = useMemo(() => getMondayOfWeek(0), []);
  const sundayIso = useMemo(() => addDaysIso(mondayIso, 6), [mondayIso]);
  const weekDates = useMemo(() => buildWeekDates(mondayIso), [mondayIso]);

  const { data: rawRows, isLoading } = useQuery({
    queryKey: ["swimmer-sessions-week", userId, mondayIso, sundayIso],
    queryFn: () => getSwimmerSessions(userId!, mondayIso, sundayIso, false),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });

  // The get_swimmer_sessions RPC returns log_session_id = NULL unconditionally
  // (migration 00132), so we cross-reference with the swimmer's logged sessions
  // to detect feedback presence. Same query key as SwimmerHome → cache dedupe.
  const { data: loggedSessions } = useQuery({
    queryKey: ["sessions", userId ?? user],
    queryFn: () => getSessions(user!, userId),
    enabled: !!user,
  });

  const completionLookup = useMemo(
    () => buildCompletionLookup(loggedSessions),
    [loggedSessions],
  );

  const rows: SwimmerSession[] = useMemo(() => rawRows ?? [], [rawRows]);
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

  const grid = useMemo(() => {
    const morning: CellInfo[] = [];
    const evening: CellInfo[] = [];
    let plannedPast = 0;
    let donePast = 0;
    let missedCount = 0;
    let assignedFutureCount = 0;
    let totalSlots = 0;

    // Index relevant rows by date+bucket — swim only (muscu is shown elsewhere).
    const byDateBucket = new Map<string, SwimmerSession[]>();
    for (const row of rows) {
      if (row.slot_session_type !== "swim") continue;
      // Skip absences — the swimmer is excused, the slot doesn't apply this day.
      if (row.is_absent) continue;
      const key = `${row.scheduled_date}__${row.bucket}`;
      const list = byDateBucket.get(key) ?? [];
      list.push(row);
      byDateBucket.set(key, list);
    }

    for (let i = 0; i < weekDates.length; i += 1) {
      const dateIso = weekDates[i];
      const isPastDay = dateIso < today;
      const isTodayDay = dateIso === today;

      for (const bucket of ["morning", "evening"] as const) {
        const list = byDateBucket.get(`${dateIso}__${bucket}`) ?? [];
        const cellStates: CellState[] = [];
        const count = list.length;

        for (const row of list) {
          totalSlots += 1;
          const hasAssignment = row.assignment_id != null;
          const hasFeedback = hasAssignment && rowHasFeedback(row, completionLookup);

          const cellState = classifyCell({
            // The RPC returns rows for slots that apply to the swimmer, so any
            // row implies an existing "published"-equivalent slot context.
            state: "published",
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

          cellStates.push(cellState);
        }

        const cell: CellInfo = {
          state: cellStates.length > 0 ? foldCellStates(cellStates) : "none",
          count,
        };

        if (bucket === "morning") morning.push(cell);
        else evening.push(cell);
      }
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
  }, [rows, weekDates, today, completionLookup]);

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
                    "text-[9px] font-black uppercase tracking-eyebrow-lg",
                    isToday ? "text-primary" : "text-muted-foreground/60",
                  ].join(" ")}
                >
                  {label}
                </span>
                <span
                  className={[
                    "text-[11px] tabular-nums",
                    isToday ? "font-black text-primary" : "font-semibold text-muted-foreground/70",
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
            <span className="text-[9px] font-black uppercase tracking-eyebrow-sm text-muted-foreground">
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
            <span className="text-[9px] font-black uppercase tracking-eyebrow-sm text-muted-foreground">
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
            <span className="text-[10px] uppercase tracking-eyebrow text-muted-foreground/70">
              / {grid.plannedPast} séance{grid.plannedPast > 1 ? "s" : ""} faite{grid.donePast > 1 ? "s" : ""}
            </span>
          </div>
          {grid.totalSlots === 0 ? (
            <span className="text-[11px] italic text-muted-foreground">
              Aucune séance cette semaine
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

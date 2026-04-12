/**
 * SwimmerWeekSlots — Read-only weekly training slots view for swimmers.
 *
 * Displays group slots (from useSlotCalendar) or personal slots (SwimmerTrainingSlot[])
 * with week navigation. Swimmer-facing: no edit actions, no bottom sheets.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  XCircle,
} from "lucide-react";
import {
  useSlotCalendar,
  type SlotInstance,
} from "@/hooks/useSlotCalendar";
import type { SwimmerTrainingSlot } from "@/lib/api/types";

// ── Props ───────────────────────────────────────────────────

export interface SwimmerWeekSlotsProps {
  swimmerSlots?: SwimmerTrainingSlot[];
}

// ── Helpers ─────────────────────────────────────────────────

const DAY_ABBREVS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

function formatWeekRange(mondayIso: string, sundayIso: string): string {
  const [, mM, mD] = mondayIso.split("-").map(Number);
  const [, sM, sD] = sundayIso.split("-").map(Number);
  const monday = new Date(Number(mondayIso.split("-")[0]), mM - 1, mD);
  const sunday = new Date(Number(sundayIso.split("-")[0]), sM - 1, sD);
  const mondayMonth = monday.toLocaleDateString("fr-FR", { month: "long" });
  const sundayMonth = sunday.toLocaleDateString("fr-FR", { month: "long" });
  const year = sunday.getFullYear();
  if (mondayMonth === sundayMonth) {
    return `${mD} – ${sD} ${mondayMonth} ${year}`;
  }
  return `${mD} ${mondayMonth} – ${sD} ${sundayMonth} ${year}`;
}

function formatDayHeader(isoDate: string): { abbrev: string; label: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayIndex = (date.getDay() + 6) % 7; // Monday=0
  return { abbrev: DAY_ABBREVS[dayIndex], label: `${d}` };
}

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

// ── Materialize personal slots for a week ───────────────────

interface PersonalSlotInstance {
  date: string;
  slot: SwimmerTrainingSlot;
}

function materializePersonalSlots(
  slots: SwimmerTrainingSlot[],
  weekDates: string[],
): PersonalSlotInstance[] {
  const instances: PersonalSlotInstance[] = [];
  for (const dateIso of weekDates) {
    const [y, m, d] = dateIso.split("-").map(Number);
    const jsDate = new Date(y, m - 1, d);
    // day_of_week in DB: 0=Monday..6=Sunday (same as useSlotCalendar convention)
    const dow = (jsDate.getDay() + 6) % 7;
    for (const slot of slots) {
      if (slot.day_of_week === dow && slot.is_active) {
        instances.push({ date: dateIso, slot });
      }
    }
  }
  instances.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.slot.start_time.localeCompare(b.slot.start_time);
  });
  return instances;
}

// ── Skeleton ────────────────────────────────────────────────

function SlotCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-3 space-y-2 animate-pulse motion-reduce:animate-none">
      <Skeleton className="h-3.5 w-24 rounded-md" />
      <Skeleton className="h-3.5 w-3/4 rounded-md" />
      <Skeleton className="h-3 w-20 rounded-md" />
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-16 rounded-md" />
      <SlotCardSkeleton />
    </div>
  );
}

// ── Toggle pill ─────────────────────────────────────────────

type SlotMode = "groupe" | "perso";

function ModePill({
  mode,
  onChange,
}: {
  mode: SlotMode;
  onChange: (m: SlotMode) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-muted/60 p-0.5 text-xs font-medium">
      <button
        type="button"
        onClick={() => onChange("groupe")}
        className={`rounded-full px-3 py-1 transition-all ${
          mode === "groupe"
            ? "bg-background shadow text-foreground"
            : "text-muted-foreground"
        }`}
      >
        Groupe
      </button>
      <button
        type="button"
        onClick={() => onChange("perso")}
        className={`rounded-full px-3 py-1 transition-all ${
          mode === "perso"
            ? "bg-background shadow text-foreground"
            : "text-muted-foreground"
        }`}
      >
        Perso
      </button>
    </div>
  );
}

// ── Group slot card (read-only) ─────────────────────────────

function GroupSlotCard({ instance }: { instance: SlotInstance }) {
  const isCancelled = instance.state === "cancelled";

  const accentClass =
    instance.state === "published"
      ? "border-l-emerald-500"
      : instance.state === "cancelled"
        ? "border-l-destructive/50"
        : "border-l-border";

  const bgClass = isCancelled
    ? "bg-muted/30 opacity-60"
    : instance.state === "published"
      ? "bg-card"
      : "bg-card/40 border-dashed";

  return (
    <div
      className={`rounded-xl border border-l-4 p-3 ${accentClass} ${bgClass}`}
    >
      {/* Time */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 opacity-60" />
        <span className={isCancelled ? "line-through" : ""}>
          {formatTimeRange(instance.slot.start_time, instance.slot.end_time)}
        </span>
        {isCancelled && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            <XCircle className="h-3 w-3" />
            Annulé
          </span>
        )}
      </div>

      {/* Session name + distance */}
      {instance.state === "published" && instance.assignment?.session_name && (
        <p className="text-sm font-semibold mt-1.5 leading-snug text-foreground">
          {instance.assignment.session_name}
          {instance.assignment.session_distance != null &&
            instance.assignment.session_distance > 0 && (
              <span className="font-normal text-xs text-muted-foreground ml-1.5">
                {instance.assignment.session_distance}m
              </span>
            )}
        </p>
      )}

      {/* Empty state label */}
      {instance.state === "empty" && (
        <p className="text-xs text-muted-foreground/60 mt-1">
          Aucune séance
        </p>
      )}

      {/* Location */}
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 opacity-50" />
        <span className={isCancelled ? "line-through" : ""}>
          {instance.slot.location}
        </span>
      </div>

      {/* Cancellation reason */}
      {isCancelled && instance.override?.reason && (
        <p className="text-[10px] text-muted-foreground mt-1.5 italic">
          {instance.override.reason}
        </p>
      )}
    </div>
  );
}

// ── Personal slot card (read-only) ──────────────────────────

function PersonalSlotCard({ slot }: { slot: SwimmerTrainingSlot }) {
  return (
    <div className="rounded-xl border border-l-4 border-l-primary/40 bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 opacity-60" />
        {formatTimeRange(slot.start_time, slot.end_time)}
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 opacity-50" />
        {slot.location}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function SwimmerWeekSlots({
  swimmerSlots,
}: SwimmerWeekSlotsProps) {
  const {
    weekOffset,
    mondayIso,
    sundayIso,
    weekDates,
    instancesByDate,
    isLoading,
    navigateToday,
    prevWeek,
    nextWeek,
  } = useSlotCalendar();

  const hasPersoSlots = (swimmerSlots?.length ?? 0) > 0;
  const [mode, setMode] = useState<SlotMode>("groupe");

  const today = useMemo(() => todayIso(), []);
  const weekLabel = useMemo(
    () => formatWeekRange(mondayIso, sundayIso),
    [mondayIso, sundayIso],
  );

  // Group mode: filter out draft (swimmer should not see drafts)
  const visibleGroupByDate = useMemo(() => {
    const map = new Map<string, SlotInstance[]>();
    for (const dateIso of weekDates) {
      const dayInstances = instancesByDate.get(dateIso) ?? [];
      const visible = dayInstances.filter((i) => i.state !== "draft");
      if (visible.length > 0) {
        map.set(dateIso, visible);
      }
    }
    return map;
  }, [weekDates, instancesByDate]);

  // Personal mode: materialize personal slots
  const personalByDate = useMemo(() => {
    if (!swimmerSlots || swimmerSlots.length === 0) return new Map<string, PersonalSlotInstance[]>();
    const instances = materializePersonalSlots(swimmerSlots, weekDates);
    const map = new Map<string, PersonalSlotInstance[]>();
    for (const inst of instances) {
      const list = map.get(inst.date) ?? [];
      list.push(inst);
      map.set(inst.date, list);
    }
    return map;
  }, [swimmerSlots, weekDates]);

  return (
    <section className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Ma semaine
        </h2>
        {hasPersoSlots && (
          <ModePill mode={mode} onChange={setMode} />
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={prevWeek}
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <p className="flex-1 text-center text-xs font-semibold capitalize tabular-nums text-foreground/80">
          {weekLabel}
        </p>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={nextWeek}
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {weekOffset !== 0 && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-[10px] px-2.5 h-7"
            onClick={navigateToday}
          >
            Auj.
          </Button>
        )}
      </div>

      {/* Day sections */}
      {mode === "groupe" && isLoading ? (
        <div className="space-y-3">
          <DaySkeleton />
          <DaySkeleton />
          <DaySkeleton />
        </div>
      ) : mode === "groupe" ? (
        <div className="space-y-3">
          {weekDates.map((dateIso) => {
            const slots = visibleGroupByDate.get(dateIso);
            if (!slots || slots.length === 0) return null;
            const isToday = dateIso === today;
            const { abbrev, label } = formatDayHeader(dateIso);

            return (
              <div
                key={dateIso}
                className={`rounded-xl p-2 ${isToday ? "bg-primary/[0.04]" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {abbrev}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      isToday ? "text-foreground" : "text-foreground/70"
                    }`}
                  >
                    {label}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full ml-auto">
                      Aujourd'hui
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {slots.map((instance) => (
                    <GroupSlotCard
                      key={`${instance.slot.id}-${instance.date}`}
                      instance={instance}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {visibleGroupByDate.size === 0 && (
            <p className="text-center text-xs text-muted-foreground/60 py-6">
              Aucun créneau cette semaine
            </p>
          )}
        </div>
      ) : (
        /* Personal mode */
        <div className="space-y-3">
          {weekDates.map((dateIso) => {
            const slots = personalByDate.get(dateIso);
            if (!slots || slots.length === 0) return null;
            const isToday = dateIso === today;
            const { abbrev, label } = formatDayHeader(dateIso);

            return (
              <div
                key={dateIso}
                className={`rounded-xl p-2 ${isToday ? "bg-primary/[0.04]" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {abbrev}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      isToday ? "text-foreground" : "text-foreground/70"
                    }`}
                  >
                    {label}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full ml-auto">
                      Aujourd'hui
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {slots.map((inst) => (
                    <PersonalSlotCard
                      key={inst.slot.id}
                      slot={inst.slot}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {personalByDate.size === 0 && (
            <p className="text-center text-xs text-muted-foreground/60 py-6">
              Aucun créneau personnel
            </p>
          )}
        </div>
      )}
    </section>
  );
}

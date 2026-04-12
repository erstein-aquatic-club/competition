# Swimmer Week Slots (Read-Only) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only weekly training slots view at the bottom of the swimmer home page, with group/personal toggle and week navigation.

**Architecture:** New `SwimmerWeekSlots` component reusing the existing `useSlotCalendar` hook for group slots, with a simple day-of-week materialization for personal slots. Integrated as Section G in `SwimmerHome.tsx`.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, `useSlotCalendar` hook, `SwimmerTrainingSlot` type

---

### Task 1: Create SwimmerWeekSlots component (group mode)

**Files:**
- Create: `src/components/shared/SwimmerWeekSlots.tsx`

**Step 1: Create the component with week navigation and group slots rendering**

```tsx
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSlotCalendar, type SlotInstance } from "@/hooks/useSlotCalendar";
import { Skeleton } from "@/components/ui/skeleton";
import type { SwimmerTrainingSlot } from "@/lib/api/types";

// ── Helpers ────────────────────────────────────────────────

const DAY_ABBREVS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

function formatDayHeader(isoDate: string): { abbrev: string; label: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayIndex = (date.getDay() + 6) % 7;
  const abbrev = DAY_ABBREVS[dayIndex];
  const monthName = date.toLocaleDateString("fr-FR", { month: "long" });
  return { abbrev, label: `${d} ${monthName}` };
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

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

function todayIso(): string {
  const n = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── Props ──────────────────────────────────────────────────

interface SwimmerWeekSlotsProps {
  swimmerSlots?: SwimmerTrainingSlot[];
}

// ── Sub-components ─────────────────────────────────────────

function SlotCard({ instance }: { instance: SlotInstance }) {
  const isCancelled = instance.state === "cancelled";
  const hasSession = instance.state === "published" && instance.assignment?.session_name;

  return (
    <div
      className={`
        rounded-xl border p-3 transition-colors
        ${isCancelled ? "border-border/40 bg-muted/30 opacity-60" : hasSession ? "border-emerald-500/30 bg-card" : "border-border/50 bg-card/60"}
      `}
    >
      {/* Time + cancelled badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 opacity-60" />
          <span className={isCancelled ? "line-through" : ""}>
            {formatTimeRange(instance.slot.start_time, instance.slot.end_time)}
          </span>
        </div>
        {isCancelled && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive/80">
            <XCircle className="h-3 w-3" />
            Annulé
          </span>
        )}
      </div>

      {/* Session name */}
      {hasSession ? (
        <p className="text-sm font-semibold mt-1.5 leading-snug text-foreground">
          {instance.assignment!.session_name}
          {instance.assignment!.session_distance != null && instance.assignment!.session_distance > 0 && (
            <span className="font-normal text-xs text-muted-foreground ml-1.5">
              {instance.assignment!.session_distance}m
            </span>
          )}
        </p>
      ) : !isCancelled ? (
        <p className="text-xs text-muted-foreground/60 mt-1.5 italic">Pas de séance</p>
      ) : null}

      {/* Location */}
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground/70">
        <MapPin className="h-3 w-3 opacity-50" />
        <span className={isCancelled ? "line-through" : ""}>{instance.slot.location}</span>
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

function PersonalSlotCard({ slot, date }: { slot: SwimmerTrainingSlot; date: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 opacity-60" />
        <span>{formatTimeRange(slot.start_time, slot.end_time)}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground/70">
        <MapPin className="h-3 w-3 opacity-50" />
        <span>{slot.location}</span>
      </div>
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-32 rounded-md" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export function SwimmerWeekSlots({ swimmerSlots = [] }: SwimmerWeekSlotsProps) {
  const [mode, setMode] = useState<"group" | "perso">("group");
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

  const today = useMemo(() => todayIso(), []);
  const weekLabel = useMemo(() => formatWeekRange(mondayIso, sundayIso), [mondayIso, sundayIso]);

  // Personal slots materialized by weekDate
  const personalByDate = useMemo(() => {
    if (mode !== "perso" || !swimmerSlots.length) return new Map<string, SwimmerTrainingSlot[]>();
    const map = new Map<string, SwimmerTrainingSlot[]>();
    for (const dateIso of weekDates) {
      const [y, m, d] = dateIso.split("-").map(Number);
      const jsDay = new Date(y, m - 1, d).getDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;
      const matching = swimmerSlots.filter((s) => s.day_of_week === dayOfWeek && s.is_active);
      if (matching.length > 0) map.set(dateIso, matching);
    }
    return map;
  }, [mode, swimmerSlots, weekDates]);

  const hasPersonalSlots = swimmerSlots.length > 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
          Ma semaine
        </p>
        {hasPersonalSlots && (
          <div className="flex rounded-full border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setMode("group")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                mode === "group"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Groupe
            </button>
            <button
              type="button"
              onClick={() => setMode("perso")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                mode === "perso"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Perso
            </button>
          </div>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={prevWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="flex-1 text-center text-xs font-semibold capitalize tabular-nums">
          {weekLabel}
        </p>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={nextWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {weekOffset !== 0 && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-[10px] px-2 py-0.5 h-6"
            onClick={navigateToday}
          >
            Auj.
          </Button>
        )}
      </div>

      {/* Day sections */}
      <div className="space-y-3">
        {isLoading && mode === "group" ? (
          <>
            <DaySkeleton />
            <DaySkeleton />
            <DaySkeleton />
          </>
        ) : (
          weekDates.map((dateIso) => {
            const isToday = dateIso === today;
            const { abbrev, label } = formatDayHeader(dateIso);

            if (mode === "group") {
              // Filter: only show published, cancelled, or empty — hide drafts
              const allSlots = instancesByDate.get(dateIso) ?? [];
              const visibleSlots = allSlots.filter((i) => i.state !== "draft");
              if (visibleSlots.length === 0) return null;

              return (
                <div
                  key={dateIso}
                  className={`rounded-xl p-2 ${isToday ? "bg-primary/[0.04]" : ""}`}
                >
                  <p className={`text-xs font-semibold mb-1.5 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {abbrev} {label}
                  </p>
                  <div className="space-y-1.5">
                    {visibleSlots.map((instance) => (
                      <SlotCard key={`${instance.slot.id}-${instance.date}`} instance={instance} />
                    ))}
                  </div>
                </div>
              );
            }

            // Personal mode
            const personalSlots = personalByDate.get(dateIso);
            if (!personalSlots || personalSlots.length === 0) return null;

            return (
              <div
                key={dateIso}
                className={`rounded-xl p-2 ${isToday ? "bg-primary/[0.04]" : ""}`}
              >
                <p className={`text-xs font-semibold mb-1.5 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {abbrev} {label}
                </p>
                <div className="space-y-1.5">
                  {personalSlots.map((slot) => (
                    <PersonalSlotCard key={slot.id} slot={slot} date={dateIso} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/components/shared/SwimmerWeekSlots.tsx
git commit -m "feat: add SwimmerWeekSlots read-only component"
```

---

### Task 2: Integrate into SwimmerHome

**Files:**
- Modify: `src/pages/SwimmerHome.tsx`

**Step 1: Import and add Section G after Section F (Accès rapides)**

Add import at top:
```tsx
import { SwimmerWeekSlots } from "@/components/shared/SwimmerWeekSlots";
```

Add Section G after the "Accès rapides" `</motion.div>` (after line ~711):
```tsx
        {/* Section G — Ma semaine */}
        <motion.div variants={slideUp}>
          <SwimmerWeekSlots swimmerSlots={swimmerSlots ?? []} />
        </motion.div>
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Visual verification**

Run: `npm run dev`
Navigate to swimmer home, scroll down past "Accès rapides". Verify:
- Week navigation works (chevrons, "Auj." button)
- Group slots display with time, session name, location
- Toggle to "Perso" shows personal slots
- Today's day is highlighted
- Cancelled slots show "Annulé" badge
- Draft slots are hidden

**Step 4: Commit**

```bash
git add src/pages/SwimmerHome.tsx
git commit -m "feat: integrate SwimmerWeekSlots in swimmer home (Section G)"
```

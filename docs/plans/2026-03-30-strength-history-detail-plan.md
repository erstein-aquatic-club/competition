# Strength History Detail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add expandable inline summary + bottom sheet detail view to the strength session history list.

**Architecture:** Client-side only. The logs are already loaded via `getStrengthHistory()` (`run.logs` / `run.strength_set_logs`). New helper functions compute tonnage, sRPE, and group logs by exercise. The `HistoryTable` gets expand/collapse state per run. A new `RunDetailSheet` component renders the full detail view using Shadcn Sheet.

**Tech Stack:** React 19, TypeScript, framer-motion (AnimatePresence), Shadcn Sheet, Lucide icons, `computeSRPE` from `trainingLoadHelpers.ts`

---

### Task 1: Create helper functions (`strengthHistoryUtils.ts`)

**Files:**
- Create: `src/lib/strengthHistoryUtils.ts`
- Test: `src/__tests__/strengthHistoryUtils.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/__tests__/strengthHistoryUtils.test.ts
import { describe, it, expect } from "vitest";
import {
  computeRunTonnage,
  computeRunTotalReps,
  computeRunSRPE,
  groupLogsByExercise,
  computeAvgDifficulty,
} from "../lib/strengthHistoryUtils";
import type { SetLogEntry } from "../lib/types";

const makeLogs = (entries: Partial<SetLogEntry>[]): SetLogEntry[] =>
  entries.map((e, i) => ({ exercise_id: e.exercise_id ?? 1, set_index: i, ...e }));

describe("computeRunTonnage", () => {
  it("sums weight * reps for all logs", () => {
    const logs = makeLogs([
      { weight: 80, reps: 10 },
      { weight: 85, reps: 8 },
      { weight: 90, reps: 6 },
    ]);
    expect(computeRunTonnage(logs)).toBe(80 * 10 + 85 * 8 + 90 * 6);
  });

  it("ignores logs with null weight or reps", () => {
    const logs = makeLogs([
      { weight: 80, reps: 10 },
      { weight: null, reps: 8 },
      { weight: 60, reps: null },
    ]);
    expect(computeRunTonnage(logs)).toBe(800);
  });

  it("returns 0 for empty logs", () => {
    expect(computeRunTonnage([])).toBe(0);
  });
});

describe("computeRunTotalReps", () => {
  it("sums reps", () => {
    const logs = makeLogs([{ reps: 10 }, { reps: 8 }, { reps: 6 }]);
    expect(computeRunTotalReps(logs)).toBe(24);
  });

  it("skips null reps", () => {
    const logs = makeLogs([{ reps: 10 }, { reps: null }]);
    expect(computeRunTotalReps(logs)).toBe(10);
  });
});

describe("computeRunSRPE", () => {
  it("uses run rpe * duration when available", () => {
    expect(computeRunSRPE(7, 45)).toBe(315);
  });

  it("returns 0 when rpe is null", () => {
    expect(computeRunSRPE(null, 45)).toBe(0);
  });

  it("returns 0 when duration is null", () => {
    expect(computeRunSRPE(7, null)).toBe(0);
  });
});

describe("groupLogsByExercise", () => {
  it("groups logs by exercise_id preserving order", () => {
    const logs = makeLogs([
      { exercise_id: 1, weight: 80, reps: 10 },
      { exercise_id: 1, weight: 85, reps: 8 },
      { exercise_id: 2, weight: 40, reps: 12 },
      { exercise_id: 2, weight: 45, reps: 10 },
    ]);
    const exerciseMap = new Map([[1, "Squat"], [2, "Curl"]]);
    const groups = groupLogsByExercise(logs, exerciseMap);
    expect(groups).toHaveLength(2);
    expect(groups[0].exerciseId).toBe(1);
    expect(groups[0].exerciseName).toBe("Squat");
    expect(groups[0].sets).toHaveLength(2);
    expect(groups[1].exerciseId).toBe(2);
    expect(groups[1].sets).toHaveLength(2);
  });

  it("uses fallback name when exercise not in map", () => {
    const logs = makeLogs([{ exercise_id: 99, weight: 50, reps: 10 }]);
    const groups = groupLogsByExercise(logs, new Map());
    expect(groups[0].exerciseName).toBe("Exercice #99");
  });
});

describe("computeAvgDifficulty", () => {
  it("averages difficulty values", () => {
    const logs = makeLogs([{ difficulty: 3 }, { difficulty: 5 }, { difficulty: 4 }]);
    expect(computeAvgDifficulty(logs)).toBe(4);
  });

  it("skips null difficulty", () => {
    const logs = makeLogs([{ difficulty: 3 }, { difficulty: null }, { difficulty: 5 }]);
    expect(computeAvgDifficulty(logs)).toBe(4);
  });

  it("returns 0 for no difficulty data", () => {
    expect(computeAvgDifficulty([])).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/strengthHistoryUtils.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/strengthHistoryUtils.ts
import type { SetLogEntry } from "@/lib/types";

/** Sum of (weight × reps) for all logs */
export function computeRunTonnage(logs: SetLogEntry[]): number {
  let total = 0;
  for (const log of logs) {
    const w = Number(log.weight ?? 0);
    const r = Number(log.reps ?? 0);
    if (w > 0 && r > 0) total += w * r;
  }
  return total;
}

/** Sum of reps across all logs */
export function computeRunTotalReps(logs: SetLogEntry[]): number {
  let total = 0;
  for (const log of logs) {
    const r = Number(log.reps ?? 0);
    if (r > 0) total += r;
  }
  return total;
}

/** sRPE = RPE × duration (minutes). Returns 0 if either is missing. */
export function computeRunSRPE(rpe: number | null | undefined, duration: number | null | undefined): number {
  if (!rpe || !duration) return 0;
  return Math.round(rpe * duration);
}

export interface ExerciseGroup {
  exerciseId: number;
  exerciseName: string;
  sets: SetLogEntry[];
  volume: number;
  maxWeight: number;
}

/** Group logs by exercise_id, preserving first-seen order */
export function groupLogsByExercise(
  logs: SetLogEntry[],
  exerciseNames: Map<number, string>,
): ExerciseGroup[] {
  const map = new Map<number, SetLogEntry[]>();
  const order: number[] = [];

  for (const log of logs) {
    const eid = Number(log.exercise_id);
    if (!eid) continue;
    if (!map.has(eid)) {
      map.set(eid, []);
      order.push(eid);
    }
    map.get(eid)!.push(log);
  }

  return order.map((eid) => {
    const sets = map.get(eid)!;
    let volume = 0;
    let maxWeight = 0;
    for (const s of sets) {
      const w = Number(s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (w > 0 && r > 0) volume += w * r;
      if (w > maxWeight) maxWeight = w;
    }
    return {
      exerciseId: eid,
      exerciseName: exerciseNames.get(eid) ?? `Exercice #${eid}`,
      sets,
      volume,
      maxWeight,
    };
  });
}

/** Average difficulty (1-5) across logs that have a value. Rounds to nearest int. */
export function computeAvgDifficulty(logs: SetLogEntry[]): number {
  const vals = logs
    .map((l) => l.difficulty)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/strengthHistoryUtils.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/strengthHistoryUtils.ts src/__tests__/strengthHistoryUtils.test.ts
git commit -m "feat(strength): add history detail helper functions with tests"
```

---

### Task 2: Add expand/collapse to HistoryTable

**Files:**
- Modify: `src/components/strength/HistoryTable.tsx`

**Step 1: Add state + expand panel to HistoryTable**

In `HistoryTable.tsx`, add:
- `expandedRunId` state (`useState<number | null>(null)`)
- `selectedRun` state for the sheet (`useState<LocalStrengthRun | null>(null)`)
- Build an `exerciseNames` Map from the existing `exercises` query
- Make each run card clickable (toggle `expandedRunId`)
- Add a chevron icon that rotates on expand
- Below each card, render `AnimatePresence` + `motion.div` with:
  - Exercise names as pills
  - sRPE (via `computeRunSRPE`)
  - Tonnage (via `computeRunTonnage`)
  - "Voir détails" button that sets `selectedRun`

Key changes to the existing `motion.div` card (line ~126-173):
- Wrap with `button` behavior: `onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}`
- Add chevron icon with rotation: `<ChevronDown className={cn("transition-transform", expandedRunId === run.id && "rotate-180")} />`
- After the card, add the expand panel inside `AnimatePresence`

The expand panel content:
```tsx
<AnimatePresence>
  {expandedRunId === run.id && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-2.5 pb-2.5 pt-1 space-y-2">
        {/* Exercise pills */}
        <div className="flex flex-wrap gap-1">
          {exerciseGroups.map((g) => (
            <span key={g.exerciseId} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {g.exerciseName}
            </span>
          ))}
        </div>
        {/* Stats row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span><Zap className="inline h-3 w-3 mr-0.5 text-amber-500" />sRPE {srpe}</span>
          <span><Dumbbell className="inline h-3 w-3 mr-0.5 text-primary" />{tonnage.toLocaleString("fr-FR")} kg</span>
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
  )}
</AnimatePresence>
```

**Step 2: Add imports**

Add to top of file:
```typescript
import { AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { computeRunTonnage, computeRunSRPE, groupLogsByExercise } from "@/lib/strengthHistoryUtils";
import { RunDetailSheet } from "./RunDetailSheet";
```

**Step 3: Add the Sheet at the bottom of the component (before closing `</div>`)**

```tsx
{selectedRun && (
  <RunDetailSheet
    run={selectedRun}
    exerciseNames={exerciseNames}
    open={!!selectedRun}
    onOpenChange={(open) => { if (!open) setSelectedRun(null); }}
  />
)}
```

**Step 4: Build the exerciseNames Map (in useMemo)**

```typescript
const exerciseNames = useMemo(() => {
  const map = new Map<number, string>();
  if (exercises) {
    for (const ex of exercises) {
      map.set(ex.id, ex.nom_exercice ?? `Exercice #${ex.id}`);
    }
  }
  return map;
}, [exercises]);
```

**Step 5: Verify dev server**

Run: `npm run dev`
Navigate to strength history, click on a run, verify expand/collapse works.

**Step 6: Commit**

```bash
git add src/components/strength/HistoryTable.tsx
git commit -m "feat(strength): add expandable inline summary to history rows"
```

---

### Task 3: Create RunDetailSheet component

**Files:**
- Create: `src/components/strength/RunDetailSheet.tsx`

**Step 1: Create the full component**

```tsx
// src/components/strength/RunDetailSheet.tsx
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
import { Dumbbell, Clock, Zap, Activity, Flame, Heart, MessageSquare } from "lucide-react";
import { staggerChildren, listItem } from "@/lib/animations";
import type { LocalStrengthRun } from "@/lib/types";
import {
  computeRunTonnage,
  computeRunTotalReps,
  computeRunSRPE,
  groupLogsByExercise,
  computeAvgDifficulty,
} from "@/lib/strengthHistoryUtils";

// ── Status styles (shared with HistoryTable) ──
const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "Terminée" },
  in_progress: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "En cours" },
  abandoned: { bg: "bg-red-400/10", text: "text-red-500 dark:text-red-400", label: "Abandonnée" },
};

// ── Difficulty colors ──
function difficultyColor(d: number | null | undefined): string {
  if (!d) return "bg-muted";
  if (d <= 2) return "bg-emerald-500";
  if (d <= 3) return "bg-amber-400";
  if (d <= 4) return "bg-orange-500";
  return "bg-red-500";
}

// ── KPI Card ──
function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-muted/40 px-3 py-2.5 min-w-[70px]">
      {icon}
      <span className="text-[15px] font-bold tabular-nums leading-none">{value}</span>
      <span className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wide">{label}</span>
    </div>
  );
}

// ── Feeling gauge (mini circle) ──
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

// ── Props ──
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
            {run.duration && run.duration > 0 && (
              <span className="text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-3 w-3" />{run.duration} min
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* ── KPI Cards ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <KpiCard icon={<Dumbbell className="h-4 w-4 text-primary" />} label="Tonnage" value={`${tonnage.toLocaleString("fr-FR")} kg`} />
          <KpiCard icon={<Activity className="h-4 w-4 text-blue-500" />} label="Séries" value={String(logs.length)} />
          <KpiCard icon={<Activity className="h-4 w-4 text-violet-500" />} label="Reps" value={String(totalReps)} />
          {srpe > 0 && <KpiCard icon={<Zap className="h-4 w-4 text-amber-500" />} label="sRPE" value={String(srpe)} />}
        </div>

        {/* ── Exercises ── */}
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
                          {/* Difficulty dots */}
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

        {/* ── Ressenti ── */}
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

        {/* ── Comments ── */}
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
```

**Step 2: Verify in dev server**

Run: `npm run dev`
Click on a history run → expand → "Voir détails" → verify sheet opens with all sections.

**Step 3: Commit**

```bash
git add src/components/strength/RunDetailSheet.tsx
git commit -m "feat(strength): add RunDetailSheet bottom sheet for session detail"
```

---

### Task 4: Type check + final verification

**Files:**
- Check: all modified/created files

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors (pre-existing storybook errors are OK)

**Step 2: Run tests**

Run: `npx vitest run src/__tests__/strengthHistoryUtils.test.ts`
Expected: ALL PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: No regressions (pre-existing TimesheetHelpers failure is OK)

**Step 4: Update CLAUDE.md**

Add to the "Fichiers clés" table:
- `src/components/strength/RunDetailSheet.tsx` — Bottom sheet détail séance musculation
- `src/lib/strengthHistoryUtils.ts` — Helpers calcul historique (tonnage, sRPE, groupByExercise)

**Step 5: Update implementation-log.md**

Add entry for this feature (§94 or next available number).

**Step 6: Commit**

```bash
git add CLAUDE.md docs/implementation-log.md
git commit -m "docs: add strength history detail to implementation log and CLAUDE.md"
```

# Rest Screen Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the strength workout rest screen with better set progress tracking, editable athlete notes, 1RM history sparkline, fixed swipe/scroll conflict, and proper GIF display.

**Architecture:** 5 independent improvements to RestScreen and its 3 tab sub-components. Props flow from WorkoutRunner → RestScreen → tabs. One hook enhancement (useSwipeNavigation). Reuses existing `useExerciseHistory` hook and `ExerciseProgressChart` component.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Framer Motion, Recharts, Radix UI/Shadcn

---

### Task 1: GIF full ratio (RestExerciseTab)

**Files:**
- Modify: `src/components/strength/RestExerciseTab.tsx:37-53`

**Step 1: Update GIF container and img styling**

In `RestExerciseTab.tsx`, replace the GIF container block (lines 37-53):

```tsx
{/* GIF illustration */}
<div className="flex justify-center">
  {exercise?.illustration_gif ? (
    <div className="max-h-[220px] w-full max-w-[300px] overflow-hidden rounded-2xl border border-border/50 bg-muted/20 shadow-sm">
      <img
        src={exercise.illustration_gif}
        alt={exercise.nom_exercice}
        className="h-full w-full object-contain max-h-[220px]"
        loading="eager"
        decoding="async"
      />
    </div>
  ) : (
    <div className="flex h-[170px] w-full max-w-[300px] items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/30">
      <Dumbbell className="h-10 w-10 text-muted-foreground/40" />
    </div>
  )}
</div>
```

Key changes: `h-[170px]` → removed (height auto from content), `max-w-[260px]` → `max-w-[300px]`, `object-cover` → `object-contain`, added `bg-muted/20` for bands, added `max-h-[220px]` on both container and img.

**Step 2: Visual test**

Run: `npm run dev`
Open a strength session in focus mode, trigger rest timer on an exercise with a rectangular GIF. Verify the full GIF is visible without crop.

**Step 3: Commit**

```bash
git add src/components/strength/RestExerciseTab.tsx
git commit -m "fix(rest): display GIF with object-contain for full ratio (§95)"
```

---

### Task 2: Fix scroll/swipe conflict (useSwipeNavigation + RestScreen)

**Files:**
- Modify: `src/hooks/useSwipeNavigation.ts`
- Modify: `src/components/strength/RestScreen.tsx:189-232`

**Step 1: Rewrite useSwipeNavigation with directional lock**

Replace the entire content of `src/hooks/useSwipeNavigation.ts`:

```ts
import { useRef, useCallback } from "react";

interface UseSwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

type SwipeLock = "none" | "horizontal" | "vertical";

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  velocityThreshold = 500,
}: UseSwipeNavigationOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const lock = useRef<SwipeLock>("none");

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    lock.current = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (lock.current !== "none") return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startX.current);
    const dy = Math.abs(touch.clientY - startY.current);
    // Wait for minimum movement before locking direction
    if (dx < 10 && dy < 10) return;
    lock.current = dx > dy ? "horizontal" : "vertical";
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (lock.current !== "horizontal") return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX.current;
      const dt = (Date.now() - startTime.current) / 1000; // seconds
      const velocity = dt > 0 ? Math.abs(dx) / dt : 0;

      if (dx < -threshold || velocity > velocityThreshold) {
        onSwipeLeft?.();
      } else if (dx > threshold || velocity > velocityThreshold) {
        onSwipeRight?.();
      }
    },
    [onSwipeLeft, onSwipeRight, threshold, velocityThreshold],
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}
```

**Step 2: Update RestScreen to use touch-based swipe instead of framer-motion drag**

In `RestScreen.tsx`, the swipable tabs area (lines 189-232) currently uses framer-motion `drag="x"` via `{...swipeProps}`. Replace with the new touch handlers:

Replace the swipe hook call (lines 75-78):
```tsx
const swipeProps = useSwipeNavigation({
  onSwipeLeft: () => goTo(activeTab + 1),
  onSwipeRight: () => goTo(activeTab - 1),
});
```

Then in the `motion.div` (line 200-202), remove `{...swipeProps}` (which previously spread `drag`, `dragConstraints`, etc.) and instead spread the new touch handlers on a wrapper:

Replace lines 189-233:
```tsx
{/* Swipable tabs area */}
<div className="flex-1 overflow-hidden relative" {...swipeProps}>
  <AnimatePresence initial={false} custom={direction} mode="popLayout">
    <motion.div
      key={activeTab}
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
      className="absolute inset-0 overflow-y-auto px-5 pt-1"
    >
      {activeTab === 0 && (
        <RestExerciseTab
          exercise={displayExercise}
          block={displayBlock}
          targetWeight={targetWeight}
          muscleTags={muscleTags}
          note={note}
          isTransition={restType === "exercise"}
        />
      )}
      {activeTab === 1 && (
        <RestSessionTab
          items={items}
          logs={logs}
          exercises={exercises}
          currentStep={currentStep}
          progressPct={progressPct}
        />
      )}
      {activeTab === 2 && (
        <RestPerfsTab
          exerciseName={displayExercise?.nom_exercice ?? "—"}
          oneRmWeight={oneRmWeight}
          targetWeight={targetWeight}
          percentOneRm={percentOneRm}
          todayLogs={todayLogs}
        />
      )}
    </motion.div>
  </AnimatePresence>
</div>
```

Key change: `{...swipeProps}` moves from inner `motion.div` to outer wrapper `div`, and the swipeProps no longer contain framer-motion drag props — just touch handlers.

**Step 3: Check other usages of useSwipeNavigation**

Run: `grep -r "useSwipeNavigation" src/` — verify no other consumer relies on the old framer-motion drag return shape. If there are other consumers, keep backward compatibility by adding a `mode` parameter. (Based on exploration, `useSwipeNavigation` is also used in calendar components — check if they use `drag` prop.)

**Step 4: Visual test**

Run: `npm run dev`
Open rest screen → verify:
1. Vertical scroll works on tall content (Séance tab exercise list)
2. Horizontal swipe changes tabs
3. Diagonal gestures don't cause jank

**Step 5: Commit**

```bash
git add src/hooks/useSwipeNavigation.ts src/components/strength/RestScreen.tsx
git commit -m "fix(rest): directional lock for swipe vs scroll conflict (§95)"
```

---

### Task 3: Editable athlete notes (RestExerciseTab)

**Files:**
- Modify: `src/components/strength/RestExerciseTab.tsx`
- Modify: `src/components/strength/RestScreen.tsx`
- Modify: `src/components/strength/WorkoutRunner.tsx`

**Step 1: Add note props to RestExerciseTab**

Update `RestExerciseTabProps` interface and component:

```tsx
import React, { useState, useRef, useCallback } from "react";
import { Dumbbell, StickyNote, Pencil } from "lucide-react";
```

Add to interface:
```tsx
export interface RestExerciseTabProps {
  exercise: Exercise | null;
  block: StrengthSessionItem | null;
  targetWeight: number;
  muscleTags: string[];
  note: string | null | undefined;
  isTransition: boolean;
  athleteNote: string;
  exerciseId: number;
  onUpdateNote?: (exerciseId: number, note: string | null) => void;
}
```

**Step 2: Add editable note block after coach note**

Inside `RestExerciseTab`, add state and debounce logic, then add the JSX block after the coach note `{note ? (...) : null}`:

```tsx
// Inside the component, before return:
const [localAthleteNote, setLocalAthleteNote] = useState(athleteNote);
const noteTimerRef = useRef<ReturnType<typeof setTimeout>>();

// Sync when exercise changes
React.useEffect(() => {
  setLocalAthleteNote(athleteNote);
}, [athleteNote, exerciseId]);

const handleAthleteNoteChange = useCallback(
  (value: string) => {
    setLocalAthleteNote(value);
    clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => {
      onUpdateNote?.(exerciseId, value || null);
    }, 800);
  },
  [exerciseId, onUpdateNote],
);
```

JSX block to add after coach notes (before `</div>` closing the flex-col):

```tsx
{/* Athlete note — editable */}
{onUpdateNote && exerciseId > 0 && (
  <div className="rounded-2xl border border-dashed border-border/50 bg-card/50 p-3.5 flex gap-2.5 items-start">
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Ma note</p>
      <textarea
        value={localAthleteNote}
        onChange={(e) => handleAthleteNoteChange(e.target.value)}
        placeholder="Ajouter une note..."
        rows={1}
        className="w-full resize-none bg-transparent text-sm text-foreground/80 leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none"
        style={{ maxHeight: "4.5em", overflow: "auto" }}
      />
    </div>
  </div>
)}
```

**Step 3: Thread props through RestScreen**

In `RestScreen.tsx`, add to `RestScreenProps`:
```tsx
athleteNote: string;
exerciseId: number;
onUpdateNote?: (exerciseId: number, note: string | null) => void;
```

Destructure them and pass to `RestExerciseTab`:
```tsx
<RestExerciseTab
  exercise={displayExercise}
  block={displayBlock}
  targetWeight={targetWeight}
  muscleTags={muscleTags}
  note={note}
  isTransition={restType === "exercise"}
  athleteNote={athleteNote}
  exerciseId={exerciseId}
  onUpdateNote={onUpdateNote}
/>
```

**Step 4: Pass from WorkoutRunner**

In `WorkoutRunner.tsx`, add to the `<RestScreen>` call (~line 953):
```tsx
athleteNote={exerciseNotes?.[currentBlock?.exercise_id ?? -1] ?? ""}
exerciseId={currentBlock?.exercise_id ?? -1}
onUpdateNote={onUpdateNote}
```

Note: `exerciseNotes` contains the athlete's own notes (not coach notes). The `note` prop already passes the coach note. This distinction is correct.

**Step 5: Visual test**

Run: `npm run dev`
Open rest screen → Exercice tab should show "Ma note" textarea. Type something, wait 1s, close rest screen → note should persist on the exercise.

**Step 6: Commit**

```bash
git add src/components/strength/RestExerciseTab.tsx src/components/strength/RestScreen.tsx src/components/strength/WorkoutRunner.tsx
git commit -m "feat(rest): editable athlete notes on rest exercise tab (§95)"
```

---

### Task 4: Set progress indicators + time estimate (RestSessionTab)

**Files:**
- Modify: `src/components/strength/RestSessionTab.tsx`
- Modify: `src/components/strength/RestScreen.tsx`
- Modify: `src/components/strength/WorkoutRunner.tsx`

**Step 1: Add new props to RestSessionTab**

```tsx
export interface RestSessionTabProps {
  items: StrengthSessionItem[];
  logs: SetLogEntry[];
  exercises: Exercise[];
  currentStep: number;
  progressPct: number;
  currentSetIndex: number;
  totalSets: number;
  restSecondsPerSet: number;
  restSecondsPerExercise: number;
}
```

**Step 2: Add set dots indicator after the progress bar**

Inside `RestSessionTab`, after the progress bar `<div>` block (after line 61), add:

```tsx
{/* Current exercise set progress */}
{totalSets > 0 && (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalSets }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            i < currentSetIndex
              ? "bg-primary"
              : i === currentSetIndex
                ? "bg-primary/40 ring-2 ring-primary/30"
                : "bg-muted-foreground/20",
          )}
        />
      ))}
    </div>
    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
      Série {currentSetIndex}/{totalSets}
    </span>
  </div>
)}
```

**Step 3: Add time estimate after set dots**

Compute and display estimated remaining time:

```tsx
{/* Estimated remaining time */}
{(() => {
  // Sets remaining in current exercise
  const setsLeft = Math.max(0, totalSets - currentSetIndex);
  // Exercises remaining after current (currentStep is 1-based index of current exercise)
  const exercisesLeft = items.slice(currentStep).reduce((acc, item) => acc + item.sets, 0);
  // Time = remaining sets * set rest + remaining exercise sets * set rest (approximation)
  const totalSecsLeft =
    setsLeft * restSecondsPerSet +
    exercisesLeft * restSecondsPerSet +
    Math.max(0, items.length - currentStep) * restSecondsPerExercise;
  if (totalSecsLeft <= 0) return null;
  const mins = Math.ceil(totalSecsLeft / 60);
  return (
    <p className="text-xs text-muted-foreground/60 text-center">
      ~{mins} min restante{mins > 1 ? "s" : ""}
    </p>
  );
})()}
```

**Step 4: Thread props through RestScreen**

Add to `RestScreenProps`:
```tsx
currentSetIndex: number;
totalSets: number;
restSecondsPerSet: number;
restSecondsPerExercise: number;
```

Pass to `RestSessionTab`:
```tsx
<RestSessionTab
  items={items}
  logs={logs}
  exercises={exercises}
  currentStep={currentStep}
  progressPct={progressPct}
  currentSetIndex={currentSetIndex}
  totalSets={totalSets}
  restSecondsPerSet={restSecondsPerSet}
  restSecondsPerExercise={restSecondsPerExercise}
/>
```

**Step 5: Pass from WorkoutRunner**

In `WorkoutRunner.tsx` `<RestScreen>` call, add:
```tsx
currentSetIndex={currentSetIndex}
totalSets={currentBlock?.sets ?? 0}
restSecondsPerSet={currentBlock?.rest_seconds ?? 0}
restSecondsPerExercise={currentBlock?.rest_seconds ?? 0}
```

Note: `restSecondsPerSet` and `restSecondsPerExercise` use the same value (`rest_seconds` from the block) since there's no separate inter-exercise rest time defined in the schema. This is a reasonable approximation.

**Step 6: Visual test**

Run: `npm run dev`
Open rest screen → Séance tab should show set dots (●●●○○) with "Série 3/5" and "~8 min restantes".

**Step 7: Commit**

```bash
git add src/components/strength/RestSessionTab.tsx src/components/strength/RestScreen.tsx src/components/strength/WorkoutRunner.tsx
git commit -m "feat(rest): set progress dots + estimated time remaining (§95)"
```

---

### Task 5: 1RM sparkline + full chart access (RestPerfsTab)

**Files:**
- Modify: `src/components/strength/RestPerfsTab.tsx`
- Modify: `src/components/strength/RestScreen.tsx`
- Modify: `src/components/strength/WorkoutRunner.tsx`

**Step 1: Add new props to RestPerfsTab**

```tsx
export interface RestPerfsTabProps {
  exerciseName: string;
  oneRmWeight: number;
  targetWeight: number;
  percentOneRm: number;
  todayLogs: SetLogEntry[];
  exerciseId: number;
  userId: number;
}
```

**Step 2: Add sparkline and chart trigger**

Add imports at top of `RestPerfsTab.tsx`:
```tsx
import { useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { useExerciseHistory } from "@/hooks/useExerciseHistory";
import { ExerciseProgressChart } from "./ExerciseProgressChart";
```

Inside the component, add the hook call and chart state:
```tsx
const { sessions, current1rm, delta1rm, isLoading: historyLoading } = useExerciseHistory({
  exerciseId,
  userId,
  months: 3,
});
const [chartOpen, setChartOpen] = useState(false);
```

Add JSX block after the "Meilleure série" card (before closing `</div>`):

```tsx
{/* 1RM sparkline */}
{sessions.length >= 2 && (
  <button
    type="button"
    className="w-full max-w-xs rounded-2xl border border-border/50 bg-card p-4 shadow-sm active:scale-[0.98] transition-transform"
    onClick={() => setChartOpen(true)}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        Évolution 1RM
      </span>
      {delta1rm !== 0 && (
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            delta1rm >= 0 ? "text-emerald-600" : "text-red-500",
          )}
        >
          {delta1rm >= 0 ? "+" : ""}{delta1rm.toFixed(1)} kg
        </span>
      )}
    </div>
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={sessions} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="estimated1rm"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          fill="url(#sparkGrad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
    <p className="text-[10px] text-muted-foreground/50 text-center mt-1">
      Tap pour voir le détail
    </p>
  </button>
)}

{/* Full chart sheet */}
{exerciseId > 0 && userId > 0 && (
  <ExerciseProgressChart
    exerciseId={exerciseId}
    userId={userId}
    exerciseName={exerciseName}
    open={chartOpen}
    onOpenChange={setChartOpen}
  />
)}
```

Add `cn` import if not present:
```tsx
import { cn } from "@/lib/utils";
```

**Step 3: Thread props through RestScreen**

Add to `RestScreenProps`:
```tsx
exerciseId: number;
userId: number;
```

Pass to `RestPerfsTab`:
```tsx
<RestPerfsTab
  exerciseName={displayExercise?.nom_exercice ?? "—"}
  oneRmWeight={oneRmWeight}
  targetWeight={targetWeight}
  percentOneRm={percentOneRm}
  todayLogs={todayLogs}
  exerciseId={displayExerciseId}
  userId={userId}
/>
```

**Step 4: Pass userId from WorkoutRunner**

Add `userId` prop to `WorkoutRunner`:
```tsx
// In WorkoutRunner props interface, add:
userId: number;
```

In `Strength.tsx` where `<WorkoutRunner>` is rendered (~line 686), add:
```tsx
userId={userId ?? 0}
```

Then in `WorkoutRunner.tsx` `<RestScreen>` call, add:
```tsx
exerciseId={currentBlock?.exercise_id ?? -1}
userId={userId}
```

**Step 5: Visual test**

Run: `npm run dev`
Open rest screen → Perfs tab → if exercise has history data, sparkline should appear with delta. Tap sparkline → full bottom sheet opens with charts and details.

**Step 6: Commit**

```bash
git add src/components/strength/RestPerfsTab.tsx src/components/strength/RestScreen.tsx src/components/strength/WorkoutRunner.tsx src/pages/Strength.tsx
git commit -m "feat(rest): 1RM sparkline + full chart access on perfs tab (§95)"
```

---

### Task 6: Type check + final verification

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Fix any type errors introduced by the new props.

**Step 2: Run tests**

Run: `npm test`
Verify existing tests pass (especially `RestScreen.test.tsx` — may need updated props).

**Step 3: Update RestScreen test**

In `src/components/strength/__tests__/RestScreen.test.tsx`, update the test props to include the new required props:
```tsx
athleteNote=""
exerciseId={1}
onUpdateNote={vi.fn()}
currentSetIndex={2}
totalSets={5}
restSecondsPerSet={90}
restSecondsPerExercise={120}
userId={1}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "test(rest): update RestScreen tests for new props (§95)"
```

---

### Task 7: Documentation

**Step 1: Add entry to implementation-log.md**

Add a `## §95 — Rest Screen Improvements` section with:
- Context: 5 UX improvements to strength rest screen
- Changes: GIF ratio, swipe fix, notes, set dots, sparkline
- Files modified (list)
- Decisions: touch-based swipe replaces framer-motion drag for directional lock
- Limitations: time estimate is approximate (uses current exercise rest_seconds for all)

**Step 2: Update CLAUDE.md**

No new files to add to the table (all modifications to existing files).

**Step 3: Update ROADMAP.md and FEATURES_STATUS.md**

Add chantier §95 entry.

**Step 4: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md
git commit -m "docs: log rest screen improvements implementation (§95)"
```

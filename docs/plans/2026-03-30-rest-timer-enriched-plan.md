# Rest Timer Enrichi — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrichir l'écran de repos du WorkoutRunner avec 3 tabs swipables (Exercice, Séance, Perfs) sous un timer circulaire fixe.

**Architecture:** Extraire la section repos (`isResting`) du WorkoutRunner dans un composant `RestScreen`. Ce composant contient le timer fixe en haut et un sous-composant `RestTabs` gérant le swipe horizontal entre 3 pages via framer-motion + `useSwipeNavigation`. Chaque tab est un composant pur recevant ses données en props.

**Tech Stack:** React, TypeScript, framer-motion (AnimatePresence + motion.div), Tailwind CSS, lucide-react icons. Hook existant `useSwipeNavigation` pour la gestion du drag.

**Design doc:** `docs/plans/2026-03-30-rest-timer-enriched-design.md`

---

### Task 1: Créer le composant RestExerciseTab

**Files:**
- Create: `src/components/strength/RestExerciseTab.tsx`
- Test: `src/components/strength/__tests__/RestExerciseTab.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/strength/__tests__/RestExerciseTab.test.tsx
import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestExerciseTab } from "@/components/strength/RestExerciseTab";

const exercise = {
  id: 10,
  nom_exercice: "Développé couché",
  description: "Contrôle et amplitude",
  exercise_type: "strength" as const,
  illustration_gif: "https://example.com/gif.gif",
};

const block = {
  exercise_id: 10,
  exercise_name: "Développé couché",
  sets: 3,
  reps: 8,
  rest_seconds: 90,
  percent_1rm: 75,
  order_index: 0,
};

test("RestExerciseTab renders exercise name and prescription", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={60}
      muscleTags={["Pectoraux", "Triceps"]}
      note="Contrôler la descente"
      isTransition={false}
    />,
  );
  assert.ok(markup.includes("Développé couché"));
  assert.ok(markup.includes("3"));
  assert.ok(markup.includes("8"));
  assert.ok(markup.includes("75"));
  assert.ok(markup.includes("Pectoraux"));
  assert.ok(markup.includes("Contrôler la descente"));
  assert.ok(markup.includes("Exercice en cours"));
});

test("RestExerciseTab shows transition label", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={60}
      muscleTags={[]}
      note={null}
      isTransition={true}
    />,
  );
  assert.ok(markup.includes("Prochain exercice"));
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/strength/__tests__/RestExerciseTab.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/strength/RestExerciseTab.tsx
import { Dumbbell, StickyNote } from "lucide-react";
import type { Exercise, StrengthSessionItem } from "@/lib/api";

interface RestExerciseTabProps {
  exercise: Exercise | null;
  block: StrengthSessionItem | null;
  targetWeight: number;
  muscleTags: string[];
  note: string | null | undefined;
  isTransition: boolean;
}

const formatVal = (v?: number | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(n) : "—";
};

export function RestExerciseTab({ exercise, block, targetWeight, muscleTags, note, isTransition }: RestExerciseTabProps) {
  if (!exercise || !block) return null;

  return (
    <div className="flex flex-col items-center gap-3 px-5 pb-4 overflow-y-auto">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {isTransition ? "Prochain exercice" : "Exercice en cours"}
      </div>

      {/* GIF illustration */}
      {exercise.illustration_gif ? (
        <div className="h-44 w-full max-w-xs overflow-hidden rounded-2xl border bg-muted/20">
          <img src={exercise.illustration_gif} alt="" className="h-full w-full object-cover" loading="eager" decoding="async" />
        </div>
      ) : (
        <div className="flex h-44 w-full max-w-xs items-center justify-center rounded-2xl border bg-muted/20">
          <Dumbbell className="h-12 w-12 text-muted-foreground" />
        </div>
      )}

      {/* Name */}
      <p className="text-lg font-bold text-center">{exercise.nom_exercice}</p>

      {/* Prescription */}
      <p className="text-sm text-muted-foreground">
        {formatVal(block.sets)}×{formatVal(block.reps)}
        {block.percent_1rm ? ` · ${formatVal(block.percent_1rm)}% 1RM` : ""}
        {targetWeight > 0 ? ` · ${targetWeight} kg` : ""}
      </p>

      {/* Muscle tags */}
      {muscleTags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {muscleTags.map((tag: string) => (
            <span key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Coach notes */}
      {note && (
        <div className="w-full max-w-xs rounded-xl bg-muted/40 p-3 mt-1">
          <div className="flex items-center gap-1.5 mb-1">
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Note coach</span>
          </div>
          <p className="text-sm text-foreground/80">{note}</p>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/strength/__tests__/RestExerciseTab.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/strength/RestExerciseTab.tsx src/components/strength/__tests__/RestExerciseTab.test.tsx
git commit -m "feat(strength): add RestExerciseTab component for enriched rest screen"
```

---

### Task 2: Créer le composant RestSessionTab

**Files:**
- Create: `src/components/strength/RestSessionTab.tsx`
- Test: `src/components/strength/__tests__/RestSessionTab.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/strength/__tests__/RestSessionTab.test.tsx
import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestSessionTab } from "@/components/strength/RestSessionTab";

const items = [
  { exercise_id: 10, exercise_name: "Développé couché", sets: 3, reps: 8, rest_seconds: 90, percent_1rm: 0, order_index: 0 },
  { exercise_id: 20, exercise_name: "Rowing", sets: 4, reps: 10, rest_seconds: 60, percent_1rm: 0, order_index: 1 },
  { exercise_id: 30, exercise_name: "Squat", sets: 3, reps: 6, rest_seconds: 120, percent_1rm: 0, order_index: 2 },
];

const logs = [
  { exercise_id: 10, set_index: 1, reps: 8, weight: 60 },
  { exercise_id: 10, set_index: 2, reps: 8, weight: 60 },
  { exercise_id: 10, set_index: 3, reps: 7, weight: 60 },
];

const exercises = [
  { id: 10, nom_exercice: "Développé couché", exercise_type: "strength" as const },
  { id: 20, nom_exercice: "Rowing", exercise_type: "strength" as const },
  { id: 30, nom_exercice: "Squat", exercise_type: "strength" as const },
];

test("RestSessionTab renders progress and volume", () => {
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={logs}
      exercises={exercises}
      currentStep={2}
      progressPct={33}
    />,
  );
  assert.ok(markup.includes("1 / 3"));
  // Volume: 60*8 + 60*8 + 60*7 = 1380
  assert.ok(markup.includes("1 380") || markup.includes("1380"));
  assert.ok(markup.includes("Rowing"));
  assert.ok(markup.includes("Squat"));
});

test("RestSessionTab renders last set summary", () => {
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={logs}
      exercises={exercises}
      currentStep={2}
      progressPct={33}
    />,
  );
  // Last log: 60kg × 7 reps
  assert.ok(markup.includes("60"));
  assert.ok(markup.includes("7"));
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/strength/__tests__/RestSessionTab.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/strength/RestSessionTab.tsx
import { Check, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise, StrengthSessionItem } from "@/lib/api";
import type { SetLogEntry } from "@/lib/types";
import { isBodyweight } from "@/lib/api/client";

interface RestSessionTabProps {
  items: StrengthSessionItem[];
  logs: SetLogEntry[];
  exercises: Exercise[];
  currentStep: number;
  progressPct: number;
}

const formatVolume = (v: number) =>
  v >= 1000 ? `${Math.floor(v / 1000)}\u00A0${String(v % 1000).padStart(3, "0")}` : String(v);

export function RestSessionTab({ items, logs, exercises, currentStep, progressPct }: RestSessionTabProps) {
  const completedCount = currentStep - 1;
  const totalCount = items.length;

  // Total volume
  const totalVolume = logs.reduce((sum, log) => {
    const w = Number(log.weight) || 0;
    const r = Number(log.reps) || 0;
    return sum + (isBodyweight(w) ? 0 : w * r);
  }, 0);

  // Last logged set
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const lastExercise = lastLog ? exercises.find((e) => e.id === lastLog.exercise_id) : null;

  return (
    <div className="flex flex-col gap-4 px-5 pb-4 overflow-y-auto">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Progression</span>
          <span className="text-xs font-semibold text-foreground">{completedCount} / {totalCount}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Last set summary */}
      {lastLog && lastExercise && (
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Dernière série</div>
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{lastExercise.nom_exercice}</span>
            <span className="ml-auto text-sm font-semibold tabular-nums">
              {lastLog.weight ?? "—"} kg × {lastLog.reps ?? "—"}
            </span>
          </div>
        </div>
      )}

      {/* Total volume */}
      {totalVolume > 0 && (
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Volume total</div>
          <span className="text-2xl font-bold tabular-nums">{formatVolume(totalVolume)}</span>
          <span className="text-sm text-muted-foreground ml-1">kg</span>
        </div>
      )}

      {/* Exercise list */}
      <div className="space-y-1">
        {items.map((item, i) => {
          const ex = exercises.find((e) => e.id === item.exercise_id);
          const done = i < completedCount;
          return (
            <div key={`${item.exercise_id}-${i}`} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", done && "opacity-40")}>
              {done ? (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <span className="text-[11px] font-mono text-muted-foreground w-3.5 text-center shrink-0">{i + 1}</span>
              )}
              <span className={cn("truncate flex-1", done && "line-through")}>{ex?.nom_exercice ?? `Exercice ${item.exercise_id}`}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{item.sets}×{item.reps}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/strength/__tests__/RestSessionTab.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/strength/RestSessionTab.tsx src/components/strength/__tests__/RestSessionTab.test.tsx
git commit -m "feat(strength): add RestSessionTab component for session progress"
```

---

### Task 3: Créer le composant RestPerfsTab

**Files:**
- Create: `src/components/strength/RestPerfsTab.tsx`
- Test: `src/components/strength/__tests__/RestPerfsTab.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/strength/__tests__/RestPerfsTab.test.tsx
import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestPerfsTab } from "@/components/strength/RestPerfsTab";

test("RestPerfsTab renders 1RM and target", () => {
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Développé couché"
      oneRmWeight={80}
      targetWeight={60}
      percentOneRm={75}
      todayLogs={[
        { exercise_id: 10, set_index: 1, reps: 8, weight: 60 },
        { exercise_id: 10, set_index: 2, reps: 8, weight: 62.5 },
      ]}
    />,
  );
  assert.ok(markup.includes("80"));
  assert.ok(markup.includes("75%"));
  assert.ok(markup.includes("60"));
});

test("RestPerfsTab renders without 1RM", () => {
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Curl"
      oneRmWeight={0}
      targetWeight={0}
      percentOneRm={0}
      todayLogs={[
        { exercise_id: 20, set_index: 1, reps: 12, weight: 15 },
      ]}
    />,
  );
  assert.ok(markup.includes("Curl"));
  assert.ok(markup.includes("15"));
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/strength/__tests__/RestPerfsTab.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/strength/RestPerfsTab.tsx
import { Trophy, Target, TrendingUp } from "lucide-react";
import type { SetLogEntry } from "@/lib/types";
import { isBodyweight } from "@/lib/api/client";

interface RestPerfsTabProps {
  exerciseName: string;
  oneRmWeight: number;
  targetWeight: number;
  percentOneRm: number;
  todayLogs: SetLogEntry[];
}

export function RestPerfsTab({ exerciseName, oneRmWeight, targetWeight, percentOneRm, todayLogs }: RestPerfsTabProps) {
  // Filter logs for current exercise — compute max weight & best set today
  const maxWeight = todayLogs.reduce((max, log) => {
    const w = Number(log.weight) || 0;
    return isBodyweight(w) ? max : Math.max(max, w);
  }, 0);

  const bestSet = todayLogs.reduce<{ weight: number; reps: number } | null>((best, log) => {
    const w = Number(log.weight) || 0;
    const r = Number(log.reps) || 0;
    if (isBodyweight(w)) return best;
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) return { weight: w, reps: r };
    return best;
  }, null);

  const actualPercent = oneRmWeight > 0 && maxWeight > 0 ? Math.round((maxWeight / oneRmWeight) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-5 px-5 pb-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {exerciseName}
      </div>

      {/* 1RM */}
      {oneRmWeight > 0 && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">1RM estimé</span>
          </div>
          <span className="text-4xl font-bold tabular-nums">{oneRmWeight}</span>
          <span className="text-sm text-muted-foreground ml-1">kg</span>
        </div>
      )}

      {/* Target weight */}
      {targetWeight > 0 && percentOneRm > 0 && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Charge cible ({percentOneRm}%)</span>
          </div>
          <span className="text-2xl font-bold tabular-nums">{targetWeight}</span>
          <span className="text-sm text-muted-foreground ml-1">kg</span>
        </div>
      )}

      {/* Actual % of 1RM today */}
      {actualPercent > 0 && (
        <div className="w-full max-w-xs">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Intensité aujourd'hui</span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, actualPercent)}%` }} />
          </div>
          <p className="text-center text-sm font-semibold mt-1">{actualPercent}% de ton 1RM</p>
        </div>
      )}

      {/* Best set today */}
      {bestSet && (
        <div className="rounded-xl border bg-card p-3 w-full max-w-xs text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Meilleure série aujourd'hui</div>
          <span className="text-lg font-bold tabular-nums">{bestSet.weight} kg × {bestSet.reps}</span>
        </div>
      )}

      {/* Fallback when no 1RM and no target */}
      {oneRmWeight === 0 && targetWeight === 0 && todayLogs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center mt-4">Aucune donnée de performance disponible pour cet exercice.</p>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/strength/__tests__/RestPerfsTab.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/strength/RestPerfsTab.tsx src/components/strength/__tests__/RestPerfsTab.test.tsx
git commit -m "feat(strength): add RestPerfsTab component for performance data"
```

---

### Task 4: Créer le composant RestScreen avec swipe tabs

**Files:**
- Create: `src/components/strength/RestScreen.tsx`
- Test: `src/components/strength/__tests__/RestScreen.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/strength/__tests__/RestScreen.test.tsx
import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestScreen } from "@/components/strength/RestScreen";

const session = {
  id: 1, title: "Test", description: "", cycle: "endurance",
  items: [
    { exercise_id: 10, exercise_name: "Développé couché", sets: 3, reps: 8, rest_seconds: 90, percent_1rm: 0, order_index: 0 },
  ],
};

const exercises = [{ id: 10, nom_exercice: "Développé couché", exercise_type: "strength" as const }];

test("RestScreen renders timer and dots", () => {
  const markup = renderToStaticMarkup(
    <RestScreen
      restTimer={85}
      restDuration={90}
      restType="set"
      exercise={exercises[0]}
      block={session.items[0]}
      nextExercise={null}
      nextBlock={null}
      targetWeight={0}
      muscleTags={[]}
      note={null}
      items={session.items}
      logs={[]}
      exercises={exercises}
      currentStep={1}
      progressPct={0}
      oneRmWeight={0}
      percentOneRm={0}
      onClose={() => {}}
      onSkip={() => {}}
      onAdd30s={() => {}}
    />,
  );
  // Timer text: 1:25
  assert.ok(markup.includes("1:25"));
  // Dots (3 pagination indicators)
  assert.ok(markup.includes("aria-label"));
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/strength/__tests__/RestScreen.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/strength/RestScreen.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { RestExerciseTab } from "./RestExerciseTab";
import { RestSessionTab } from "./RestSessionTab";
import { RestPerfsTab } from "./RestPerfsTab";
import type { Exercise, StrengthSessionItem } from "@/lib/api";
import type { SetLogEntry } from "@/lib/types";

interface RestScreenProps {
  restTimer: number;
  restDuration: number;
  restType: "set" | "exercise";
  exercise: Exercise | null;
  block: StrengthSessionItem | null;
  nextExercise: Exercise | null;
  nextBlock: StrengthSessionItem | null;
  targetWeight: number;
  muscleTags: string[];
  note: string | null | undefined;
  items: StrengthSessionItem[];
  logs: SetLogEntry[];
  exercises: Exercise[];
  currentStep: number;
  progressPct: number;
  oneRmWeight: number;
  percentOneRm: number;
  onClose: () => void;
  onSkip: () => void;
  onAdd30s: () => void;
}

const TAB_LABELS = ["Exercice", "Séance", "Perfs"];
const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
};

export function RestScreen(props: RestScreenProps) {
  const {
    restTimer, restDuration, restType,
    exercise, block, nextExercise, nextBlock,
    targetWeight, muscleTags, note,
    items, logs, exercises, currentStep, progressPct,
    oneRmWeight, percentOneRm,
    onClose, onSkip, onAdd30s,
  } = props;

  const [activeTab, setActiveTab] = useState(0);
  const [direction, setDirection] = useState(0);

  const goTo = (next: number) => {
    if (next < 0 || next >= TAB_LABELS.length || next === activeTab) return;
    setDirection(next > activeTab ? 1 : -1);
    setActiveTab(next);
  };

  const swipeProps = useSwipeNavigation({
    onSwipeLeft: () => goTo(activeTab + 1),
    onSwipeRight: () => goTo(activeTab - 1),
  });

  // Determine which exercise/block to show in tab 1
  const displayExercise = restType === "exercise" ? nextExercise : exercise;
  const displayBlock = restType === "exercise" ? nextBlock : block;
  const isTransition = restType === "exercise";

  // Filter today's logs for current exercise (for perfs tab)
  const exerciseId = displayExercise?.id;
  const todayExerciseLogs = exerciseId ? logs.filter((l) => l.exercise_id === exerciseId) : [];

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="text-sm font-semibold text-muted-foreground">
          {isTransition ? "Transition" : "Repos"}
        </div>
        <button
          type="button"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted active:scale-95 transition-all"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ─── Timer circulaire ─── */}
      <button
        type="button"
        className="flex flex-col items-center justify-center gap-2 px-6 py-4 active:opacity-80 transition-opacity"
        onClick={onSkip}
        aria-label="Passer le repos"
      >
        <div className="relative">
          <svg className="h-44 w-44 -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="8" />
            <circle
              cx="100" cy="100" r="90" fill="none" stroke="currentColor"
              className="text-primary transition-all duration-1000"
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 90}
              strokeDashoffset={restDuration ? 2 * Math.PI * 90 * (1 - restTimer / restDuration) : 0}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-bold tabular-nums tracking-tight">
              {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, "0")}
            </span>
            <span className="text-xs text-muted-foreground mt-1">tap pour passer</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-5 mt-1"
          onClick={(e) => { e.stopPropagation(); onAdd30s(); }}
        >
          +30s
        </Button>
      </button>

      {/* ─── Dots pagination ─── */}
      <div className="flex justify-center gap-1.5 py-2">
        {TAB_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === activeTab ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
            )}
            onClick={() => goTo(i)}
            aria-label={label}
          />
        ))}
      </div>

      {/* ─── Swipable tabs ─── */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence custom={direction} mode="popLayout">
          <motion.div
            key={activeTab}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="absolute inset-0 overflow-y-auto"
            {...swipeProps}
          >
            {activeTab === 0 && (
              <RestExerciseTab
                exercise={displayExercise}
                block={displayBlock}
                targetWeight={targetWeight}
                muscleTags={muscleTags}
                note={note}
                isTransition={isTransition}
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
                exerciseName={displayExercise?.nom_exercice ?? ""}
                oneRmWeight={oneRmWeight}
                targetWeight={targetWeight}
                percentOneRm={percentOneRm}
                todayLogs={todayExerciseLogs}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/strength/__tests__/RestScreen.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/strength/RestScreen.tsx src/components/strength/__tests__/RestScreen.test.tsx
git commit -m "feat(strength): add RestScreen component with swipable tabs"
```

---

### Task 5: Intégrer RestScreen dans WorkoutRunner

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` (lignes ~949-1044)

**Step 1: Add import at top of WorkoutRunner.tsx**

After the existing imports (around line 31), add:
```tsx
import { RestScreen } from "./RestScreen";
```

**Step 2: Replace the rest overlay (lines ~949-1044)**

Replace the entire `{isResting && ( ... )}` block with:

```tsx
{isResting && (
  <RestScreen
    restTimer={restTimer}
    restDuration={restDuration}
    restType={restType}
    exercise={currentExerciseDef ?? null}
    block={currentBlock}
    nextExercise={nextExerciseDef ?? null}
    nextBlock={nextBlock}
    targetWeight={targetWeight}
    muscleTags={muscleTags}
    note={exerciseNotes?.[
      (restType === "exercise" ? nextBlock?.exercise_id : currentBlock?.exercise_id) ?? -1
    ] ?? null}
    items={workoutPlan}
    logs={logs}
    exercises={exercises}
    currentStep={currentStep}
    progressPct={progressPct}
    oneRmWeight={rm}
    percentOneRm={hasPercent ? percentValue : 0}
    onClose={() => { setIsResting(false); setIsRestPaused(false); }}
    onSkip={() => {
      restEndRef.current = 0;
      setIsResting(false);
      setRestTimer(0);
      setIsRestPaused(false);
    }}
    onAdd30s={() => {
      restEndRef.current += 30 * 1000;
      setRestTimer((prev) => prev + 30);
    }}
  />
)}
```

**Step 3: Run existing tests to verify no regression**

Run: `npx vitest run src/pages/__tests__/StrengthRunner.test.tsx`
Expected: PASS

**Step 4: Run full build check**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/strength/WorkoutRunner.tsx
git commit -m "feat(strength): integrate RestScreen into WorkoutRunner, replace old rest overlay"
```

---

### Task 6: Appliquer /frontend-design et polish visuel

**Step 1: Invoke `/frontend-design` skill**

Run `/frontend-design` sur le composant `RestScreen` pour valider les choix visuels (couleurs, spacing, typographie, responsive). Ajuster le design si nécessaire.

**Step 2: Test manuel sur mobile**

- Lancer `npm run dev`
- Naviguer vers Musculation → lancer une séance → compléter une série
- Vérifier : timer s'affiche, swipe fonctionne entre les 3 tabs, dots suivent, données correctes
- Vérifier le mode transition (inter-exercice) affiche "Prochain exercice"

**Step 3: Commit final**

```bash
git add -A
git commit -m "feat(strength): polish RestScreen design with frontend-design review"
```

---

### Task 7: Mise à jour documentation

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/FEATURES_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

**Step 1: Ajouter entrée dans `docs/implementation-log.md`**

Nouvelle section documentant le rest timer enrichi : contexte, composants créés, fichiers modifiés, décisions (pas de fetch API, données en mémoire uniquement).

**Step 2: Mettre à jour `docs/ROADMAP.md`**

Ajouter le chantier 57 "Rest Timer enrichi — tabs swipables" avec statut Fait.

**Step 3: Mettre à jour `CLAUDE.md`**

Ajouter les fichiers clés créés dans la table des fichiers :
- `src/components/strength/RestScreen.tsx`
- `src/components/strength/RestExerciseTab.tsx`
- `src/components/strength/RestSessionTab.tsx`
- `src/components/strength/RestPerfsTab.tsx`

**Step 4: Commit**

```bash
git add docs/implementation-log.md docs/FEATURES_STATUS.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs: add rest timer enriched implementation log and update roadmap"
```

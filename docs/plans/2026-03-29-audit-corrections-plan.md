# Audit Corrections — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 24 critical/major issues identified in the full-stack audit (strength safety, coach workflow, error handling, UI/UX polish).

**Architecture:** 4 independent parallel streams touching non-overlapping files. Each stream is a self-contained worktree-safe unit. Stream A fixes strength/safety critical bugs, Stream B improves coach planning UX, Stream C adds error feedback everywhere, Stream D fixes UI/UX tokens and accessibility.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Shadcn/Radix UI, React Query 5, Zustand 5, Supabase, Vitest

---

## Stream A — Strength Safety (Opus lead)

**Files touched:**
- Modify: `src/pages/Strength.tsx`
- Modify: `src/components/strength/InProgressCard.tsx`
- Modify: `src/components/strength/SessionBrowser.tsx`
- Modify: `src/components/strength/MyPlanTab.tsx`
- Modify: `src/lib/api/strength.ts`
- Create: `src/components/strength/SessionSummary.tsx`

### Task A1: Fix exercise substitution — copy params from new exercise

When a swimmer substitutes an exercise, only `exercise_id` and `exercise_name` are updated. The old exercise's sets/reps/charge persist, which is dangerous (wrong load).

**Files:**
- Modify: `src/pages/Strength.tsx:229-240`

**Step 1: Write the fix**

Replace `handleSubstitute` at line 229:

```typescript
const handleSubstitute = (itemIndex: number, newExercise: Exercise) => {
  const params = resolveExerciseParams(newExercise, cycleType);
  setSubstitutions((prev) => {
    const next = new Map(prev);
    next.set(itemIndex, { originalIndex: itemIndex, exercise: newExercise });
    return next;
  });
  setActiveSession((prev) => {
    if (!prev?.items) return prev;
    const items = [...prev.items];
    items[itemIndex] = {
      ...items[itemIndex],
      exercise_id: newExercise.id,
      exercise_name: newExercise.nom_exercice,
      sets: params.sets ?? items[itemIndex].sets,
      reps: params.reps ?? items[itemIndex].reps,
      rest_seconds: params.restSeries ?? items[itemIndex].rest_seconds,
      percent_1rm: params.percent1rm ?? items[itemIndex].percent_1rm,
    };
    return { ...prev, items };
  });
  toast({
    title: "Exercice remplacé",
    description: `${newExercise.nom_exercice} — paramètres mis à jour.`,
  });
};
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/pages/Strength.tsx
git commit -m "fix(strength): copy exercise params on substitution to prevent wrong loads"
```

---

### Task A2: Lock cycle type at session launch

When launching from "Mon plan", the cycle should be immutable. Currently `setCycleType(cycle)` at line 492 sets it, but the user can change it via the cycle selector in "S'entraîner" tab then come back.

**Files:**
- Modify: `src/pages/Strength.tsx:503-548`

**Step 1: Write the fix**

In `handleLaunchFocus`, capture the cycle at launch time instead of using the live `cycleType` state:

```typescript
const handleLaunchFocus = async () => {
  if (!activeSession) return;
  // Use the session's locked cycle, not the global cycleType selector
  const lockedCycle = activeSession.cycle ?? cycleType;
  const items = resolveStrengthItems(
    activeSession.items ?? [],
    lockedCycle,
    exerciseLookup,
  );
  if (items.length === 0) {
    toast({
      title: "Séance vide",
      description: "Aucun exercice n'est disponible pour cette séance.",
    });
    return;
  }
  if (!activeRunId) {
    const sessionId = activeAssignment?.session_id ?? activeSession?.id ?? null;
    if (!sessionId) {
      toast({
        title: "Session manquante",
        description: "Impossible de démarrer sans session associée.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await startRun.mutateAsync({
        assignment_id: activeAssignment?.id ?? null,
        athlete_id: userId ?? null,
        athleteName: user ?? undefined,
        progress_pct: 0,
        session_id: sessionId,
        cycle_type: lockedCycle,
      });
      if (res?.run_id) {
        setActiveRunId(res.run_id);
        setActiveRunLogs((prev) => prev ?? []);
      }
    } catch (err) {
      toast({
        title: "Erreur de démarrage",
        description: "Impossible de démarrer la séance. Vérifiez votre connexion.",
        variant: "destructive",
      });
      return;
    }
  }
  setActiveSession({
    ...activeSession,
    cycle: lockedCycle,
    items,
  });
  setActiveRunnerStep(1);
  setScreenMode("focus");
};
```

Key changes:
1. Uses `activeSession.cycle` (locked at selection) instead of live `cycleType`
2. Re-resolves items at launch time with locked cycle
3. Adds toast on catch instead of silent return

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/pages/Strength.tsx
git commit -m "fix(strength): lock cycle at launch, add error toast on startRun failure"
```

---

### Task A3: Create SessionSummary component

After completing a workout, the swimmer sees nothing. Create a summary view showing tonnage, exercises completed, best sets.

**Files:**
- Create: `src/components/strength/SessionSummary.tsx`

**Step 1: Create the component**

```tsx
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Dumbbell, TrendingUp, Timer } from "lucide-react";
import { motion } from "framer-motion";
import type { SetLogEntry } from "@/lib/types";

interface SessionSummaryProps {
  sessionTitle: string;
  logs: SetLogEntry[];
  durationMinutes: number | null;
  onClose: () => void;
}

function isBodyweight(w: number | string | null | undefined): boolean {
  if (w == null) return false;
  const s = String(w).trim().toLowerCase();
  return s === "bw" || s === "pdc" || s === "0" || s === "";
}

export function SessionSummary({
  sessionTitle,
  logs,
  durationMinutes,
  onClose,
}: SessionSummaryProps) {
  const stats = useMemo(() => {
    let totalTonnage = 0;
    let totalSets = 0;
    let totalReps = 0;
    const exerciseNames = new Set<string>();
    let bestSet: { name: string; weight: number; reps: number } | null = null;

    for (const log of logs) {
      totalSets++;
      const reps = Number(log.reps) || 0;
      totalReps += reps;
      const name = log.exercise_name ?? `Ex #${log.exercise_id}`;
      exerciseNames.add(name);

      if (!isBodyweight(log.weight)) {
        const weight = Number(log.weight) || 0;
        totalTonnage += weight * reps;
        if (!bestSet || weight > bestSet.weight) {
          bestSet = { name, weight, reps };
        }
      }
    }

    return { totalTonnage, totalSets, totalReps, exerciseCount: exerciseNames.size, bestSet };
  }, [logs]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-md space-y-6 px-4 py-8"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-display font-bold uppercase italic">
          Séance terminée
        </h2>
        <p className="text-sm text-muted-foreground">{sessionTitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Dumbbell className="h-4 w-4" />}
          label="Tonnage"
          value={stats.totalTonnage > 0 ? `${Math.round(stats.totalTonnage)} kg` : "—"}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Séries"
          value={`${stats.totalSets} séries`}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="Durée"
          value={durationMinutes ? `${durationMinutes} min` : "—"}
        />
        <StatCard
          icon={<Dumbbell className="h-4 w-4" />}
          label="Exercices"
          value={`${stats.exerciseCount}`}
        />
      </div>

      {stats.bestSet && (
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Meilleure série</p>
          <p className="mt-1 text-lg font-bold">
            {stats.bestSet.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {stats.bestSet.weight} kg x {stats.bestSet.reps} reps
          </p>
        </div>
      )}

      <Button className="w-full" size="lg" onClick={onClose}>
        Retour
      </Button>
    </motion.div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}
```

**Step 2: Wire SessionSummary into Strength.tsx**

In `Strength.tsx`, add a `"summary"` screen mode. After WorkoutRunner calls `onComplete`, show the summary:

Add to screenMode type (around line 14 or wherever ScreenMode is defined):
```typescript
type ScreenMode = "list" | "reader" | "focus" | "summary";
```

Add state for tracking duration:
```typescript
const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
```

In `handleLaunchFocus`, before `setScreenMode("focus")`:
```typescript
setSessionStartTime(Date.now());
```

Add the summary render block after the WorkoutRunner block (around line 740):
```tsx
{screenMode === "summary" && activeSession && (
  <SessionSummary
    sessionTitle={activeSession.title ?? "Séance"}
    logs={activeRunLogs ?? []}
    durationMinutes={sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : null}
    onClose={() => {
      setScreenMode("list");
      setActiveSession(null);
      setActiveRunId(null);
      setActiveRunLogs(null);
      setSessionStartTime(null);
    }}
  />
)}
```

Update the WorkoutRunner's `onComplete` callback to go to summary instead of list:
```typescript
// Change: setScreenMode("list") → setScreenMode("summary")
```

**Step 3: Also fix InProgressCard "Voir le résumé" button**

In `InProgressCard.tsx`, when `inProgressRunCompleted` is true, the "Voir le résumé" button should navigate to the summary screen. The `onResumeInProgress` callback already navigates to focus mode — for completed runs, it should navigate to summary instead.

The parent (`SessionBrowser.tsx` or `Strength.tsx`) should check if the run is completed and route to `"summary"` screenMode instead of `"focus"`.

**Step 4: Verify build**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/components/strength/SessionSummary.tsx src/pages/Strength.tsx src/components/strength/InProgressCard.tsx
git commit -m "feat(strength): add post-workout summary screen with tonnage and best set"
```

---

### Task A4: Fix 1RM not saved when athlete_id is empty string

**Files:**
- Modify: `src/lib/api/strength.ts:382-387`

**Step 1: Write the fix**

Replace the guard at line 382-387:

```typescript
// Before:
if (
  canUseSupabase() &&
  (athleteId === null || athleteId === undefined || athleteId === "")
) {
  return null;
}

// After:
if (canUseSupabase() && !athleteId && !athleteName) {
  return null;
}
```

This allows saving when `athleteId` is null but `athleteName` is present (which is the fallback path).

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/api/strength.ts
git commit -m "fix(strength): allow 1RM save when athleteName present but athleteId null"
```

---

### Task A5: Add empty state message in MyPlanTab for filtered-out sessions

**Files:**
- Modify: `src/components/strength/MyPlanTab.tsx:98-108`

**Step 1: Write the fix**

After the `sessionsByFolder` memo, add a count of filtered-out sessions and display a message. Below the render section (after the folder list), add:

```tsx
{/* After folder list rendering, if all folders are empty */}
{!foldersLoading && folders.length > 0 && Array.from(sessionsByFolder.values()).every(arr => arr.length === 0) && (
  <div className="rounded-xl border border-dashed p-6 text-center">
    <p className="text-sm text-muted-foreground">
      Les séances de ce plan n'ont pas encore d'exercices configurés.
    </p>
    <p className="text-xs text-muted-foreground mt-1">
      Demande à ton coach de compléter ta planification.
    </p>
  </div>
)}
```

**Step 2: Commit**

```bash
git add src/components/strength/MyPlanTab.tsx
git commit -m "fix(strength): show message when plan sessions have no exercises"
```

---

## Stream B — Coach Workflow (Sonnet)

**Files touched:**
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx`
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx`
- Modify: `src/pages/coach/SwimmerInterviewsTab.tsx`
- Modify: `src/pages/coach/SwimmerObjectivesTab.tsx`

### Task B1: Fix Forme Score — average over last 7 sessions instead of 1

The current `computeFormeScore` only looks at `sessions[0]`. One bad session makes the coach panic.

**Files:**
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx:22-43`

**Step 1: Write the fix**

Replace `computeFormeScore`:

```typescript
function computeFormeScore(sessions: Array<{
  effort: number | null;
  performance: number | null;
  engagement: number | null;
  fatigue: number | null;
}>): number | null {
  if (sessions.length === 0) return null;
  // Average over up to 7 most recent sessions for stability
  const recent = sessions.slice(0, 7);
  const sessionScores: number[] = [];

  for (const s of recent) {
    const values: number[] = [];
    if (s.effort != null) values.push((11 - s.effort) / 2);
    if (s.fatigue != null) values.push((11 - s.fatigue) / 2);
    if (s.performance != null) values.push(s.performance / 2);
    if (s.engagement != null) values.push(s.engagement / 2);
    if (values.length > 0) {
      sessionScores.push(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  if (sessionScores.length === 0) return null;
  return Math.round((sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length) * 10) / 10;
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/pages/coach/CoachSwimmersOverview.tsx
git commit -m "fix(coach): compute forme score as 7-session average instead of single session"
```

---

### Task B2: Fix Comms tab — in-context notification instead of hard navigation

Currently the Comms tab navigates away to `#/coach?section=comms`, losing the swimmer context.

**Files:**
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx:367-394`

**Step 1: Write the fix**

Replace the Comms TabsContent with in-context actions that pass the swimmer as a query param:

```tsx
<TabsContent value="comms" className="mt-4 space-y-3">
  <div className="rounded-2xl border bg-card p-4 space-y-3">
    <p className="text-sm font-semibold">Contacter {displayName}</p>
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => {
          window.location.hash = `#/coach?section=comms&tab=notifications&athleteId=${athleteId}`;
        }}
      >
        <Bell className="mr-1.5 h-3.5 w-3.5" />
        Notification
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => {
          window.location.hash = `#/coach?section=comms&tab=sms&athleteId=${athleteId}`;
        }}
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
        SMS
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      Le nageur sera pré-sélectionné dans l'écran de communication.
    </p>
  </div>
</TabsContent>
```

Note: The receiving Comms screens (`CoachSmsScreen`, etc.) should read `athleteId` from the URL params and pre-select the swimmer. This is a follow-up enhancement — for now the nav at least includes the context.

**Step 2: Commit**

```bash
git add src/pages/coach/CoachSwimmerDetail.tsx
git commit -m "fix(coach): pass athleteId in comms navigation to preserve swimmer context"
```

---

### Task B3: Add error feedback when fetchAuthUid fails

When the RPC fails, `athleteAuthId` is null and the "Ajouter un objectif" button is disabled with no explanation.

**Files:**
- Modify: `src/pages/coach/SwimmerObjectivesTab.tsx:55-64`
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx:90-95`

**Step 1: Write the fix in CoachSwimmerDetail**

Add error handling to the athleteAuthId query:

```typescript
const { data: athleteAuthId, error: authUidError } = useQuery({
  queryKey: ["auth-uid", athleteId],
  queryFn: () => fetchAuthUid(athleteId!),
  enabled: !!athleteId,
  staleTime,
  retry: 2,
});
```

Pass the error state to SwimmerObjectivesTab:

```tsx
<SwimmerObjectivesTab
  athleteId={athleteId}
  athleteName={displayName}
  authUidError={!!authUidError}
/>
```

**Step 2: Show error banner in SwimmerObjectivesTab**

Add the prop to the component interface and show a message when auth resolution fails:

```tsx
// In Props interface, add:
authUidError?: boolean;

// Before the objectives list, add:
{authUidError && (
  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
    <p className="text-xs text-destructive">
      Impossible de charger les objectifs. Vérifiez que le nageur a un compte actif.
    </p>
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/pages/coach/CoachSwimmerDetail.tsx src/pages/coach/SwimmerObjectivesTab.tsx
git commit -m "fix(coach): show error when auth UUID resolution fails for objectives"
```

---

### Task B4: Add interview status timeline indicator

The 4-phase interview workflow (draft_athlete → draft_coach → sent → signed) has no visual timeline.

**Files:**
- Modify: `src/pages/coach/SwimmerInterviewsTab.tsx` (add inline component)

**Step 1: Create InterviewStatusBar inline**

Add this component before the main export in SwimmerInterviewsTab.tsx:

```tsx
const INTERVIEW_PHASES: { key: InterviewStatus; label: string; icon: typeof Clock }[] = [
  { key: "draft_athlete", label: "Nageur", icon: User },
  { key: "draft_coach", label: "Coach", icon: GraduationCap },
  { key: "sent", label: "Envoyé", icon: Send },
  { key: "signed", label: "Signé", icon: Trophy },
];

function InterviewStatusBar({ status }: { status: InterviewStatus }) {
  const currentIndex = INTERVIEW_PHASES.findIndex((p) => p.key === status);

  return (
    <div className="flex items-center gap-1">
      {INTERVIEW_PHASES.map((phase, i) => {
        const Icon = phase.icon;
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={phase.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`h-0.5 w-4 rounded ${isDone ? "bg-emerald-500" : "bg-muted"}`} />
            )}
            <div
              className={`flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium ${
                isCurrent
                  ? "bg-primary/10 text-primary"
                  : isDone
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              {phase.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Use InterviewStatusBar in each interview card**

Find where the interview status badge is rendered and add `<InterviewStatusBar status={interview.status} />` below the date.

**Step 3: Commit**

```bash
git add src/pages/coach/SwimmerInterviewsTab.tsx
git commit -m "feat(coach): add visual 4-phase timeline for interview status"
```

---

## Stream C — Feedback & Error Handling (Sonnet)

**Files touched:**
- Modify: `src/pages/coach/CoachCalendar.tsx`
- Modify: `src/pages/coach/CoachSlotCalendar.tsx`
- Modify: `src/pages/coach/SlotSessionSheet.tsx`
- Modify: `src/pages/CompetitionDetail.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Records.tsx`
- Modify: `src/pages/coach/CoachSmsScreen.tsx`

### Task C1: Add toast feedback to calendar mutations

**Files:**
- Modify: `src/pages/coach/CoachCalendar.tsx:235-263`

**Step 1: Find the mutation definitions**

Look for `assignMutation` and `deleteMutation` useMutation definitions (earlier in the file, around lines 80-120). Add `onSuccess` and `onError` handlers.

Add to `deleteMutation`:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["assignments"] });
  toast({ title: "Assignation supprimée" });
},
onError: () => {
  toast({ title: "Erreur", description: "Impossible de supprimer l'assignation.", variant: "destructive" });
},
```

Add to `assignMutation`:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["assignments"] });
  toast({ title: "Séance assignée" });
},
onError: () => {
  toast({ title: "Erreur", description: "Impossible d'assigner la séance.", variant: "destructive" });
},
```

Ensure `useToast` is imported. If not already: `import { useToast } from "@/hooks/use-toast";` and `const { toast } = useToast();` in the component.

**Step 2: Fix the sequential delete-then-assign in onReplace**

The current code at line 249 does `deleteMutation.mutate(oldId, { onSuccess: () => assignMutation.mutate(...) })`. If delete succeeds but assign fails, state is broken. Fix by wrapping in try/catch with mutateAsync:

```typescript
onReplace: async (oldAssignmentId, newSessionId) => {
  if (isGroupAssignment && isUserMode) {
    assignMutation.mutate({
      assignment_type: slot.type,
      session_id: newSessionId,
      scheduled_date: selectedISO,
      scheduled_slot: slot.scheduledSlot ?? undefined,
      target_user_id: userId,
    });
  } else {
    try {
      await deleteMutation.mutateAsync(oldAssignmentId);
      assignMutation.mutate({
        assignment_type: slot.type,
        session_id: newSessionId,
        scheduled_date: selectedISO,
        scheduled_slot: slot.scheduledSlot ?? undefined,
        target_group_id: groupId,
        target_user_id: userId,
      });
    } catch {
      // Delete failed — toast already shown by onError handler
    }
  }
},
```

**Step 3: Commit**

```bash
git add src/pages/coach/CoachCalendar.tsx
git commit -m "fix(coach): add toast feedback to calendar assign/delete mutations"
```

---

### Task C2: Add toast feedback to slot mutations

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx:149-170`
- Modify: `src/pages/coach/CoachSlotCalendar.tsx:291-310`

**Step 1: Add onError to SlotSessionSheet mutations**

```typescript
const visibilityMutation = useMutation({
  mutationFn: (params: { trainingSlotId: string; scheduledDate: string; visibleFrom: string | null }) =>
    updateSlotVisibility(params),
  onSuccess: () => {
    invalidateSlotAssignments();
    setShowVisibilityPicker(false);
    toast({ title: "Visibilité mise à jour" });
  },
  onError: () => {
    toast({ title: "Erreur", description: "Impossible de modifier la visibilité.", variant: "destructive" });
  },
});

const deleteMutation = useMutation({
  mutationFn: (params: { trainingSlotId: string; scheduledDate: string }) =>
    deleteSlotAssignments(params),
  onSuccess: () => {
    invalidateSlotAssignments();
    setDeleteConfirmOpen(false);
    onOpenChange(false);
    toast({ title: "Séance supprimée du créneau" });
  },
  onError: () => {
    toast({ title: "Erreur", description: "Impossible de supprimer la séance.", variant: "destructive" });
  },
});
```

Ensure `useToast` is imported. Add `const { toast } = useToast();` in the component.

**Step 2: Add onError to CoachSlotCalendar assignTemplateMutation**

```typescript
const assignTemplateMutation = useMutation({
  mutationFn: async ({ catalogId, inst }: { catalogId: number; inst: SlotInstance }) => {
    const groupIds = inst.groups.map((g) => g.group_id);
    if (groupIds.length === 0 || !userId) {
      throw new Error("Aucun groupe sélectionné");
    }
    await bulkCreateSlotAssignments({
      swimCatalogId: catalogId,
      trainingSlotId: inst.slot.id,
      scheduledDate: inst.date,
      groupIds,
      scheduledSlot: deriveScheduledSlot(inst.slot.start_time),
      visibleFrom: inst.date,
      assignedBy: userId,
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
    setTemplatePickerOpen(false);
    setTemplateTargetInstance(null);
    toast({ title: "Séance assignée au créneau" });
  },
  onError: (err: Error) => {
    toast({ title: "Erreur", description: err.message, variant: "destructive" });
  },
});
```

**Step 3: Commit**

```bash
git add src/pages/coach/SlotSessionSheet.tsx src/pages/coach/CoachSlotCalendar.tsx
git commit -m "fix(coach): add toast feedback to slot visibility/delete/assign mutations"
```

---

### Task C3: Fix competition notifications deduplication

Push notifications are scheduled in a `useEffect` with `scheduledRef` that resets on remount. Persist the set in sessionStorage.

**Files:**
- Modify: `src/pages/CompetitionDetail.tsx:96-160`

**Step 1: Write the fix**

Replace the `scheduledRef` with sessionStorage-backed dedup:

```typescript
// Replace: const scheduledRef = useRef<Set<string>>(new Set());

// With:
const getScheduledNotifs = (): Set<string> => {
  try {
    const stored = sessionStorage.getItem("eac-comp-notif-scheduled");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
};

const addScheduledNotif = (key: string) => {
  const set = getScheduledNotifs();
  set.add(key);
  sessionStorage.setItem("eac-comp-notif-scheduled", JSON.stringify([...set]));
};
```

In the useEffect, replace:
```typescript
// Replace: if (scheduledRef.current.has(key)) continue;
//          scheduledRef.current.add(key);

// With:
if (getScheduledNotifs().has(key)) continue;
addScheduledNotif(key);
```

**Step 2: Commit**

```bash
git add src/pages/CompetitionDetail.tsx
git commit -m "fix(competition): persist notification schedule in sessionStorage to prevent duplicates"
```

---

### Task C4: Add error display to Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx` (around line 184)

**Step 1: Find the error render location**

After `const error = sessionsError || assignmentsError;` (line 184), find where the main content renders. Add an error banner at the top:

```tsx
{error && (
  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
    <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-destructive">Erreur de chargement</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Impossible de récupérer vos données. Vérifiez votre connexion.
      </p>
    </div>
    <Button size="sm" variant="outline" onClick={refetch}>
      Réessayer
    </Button>
  </div>
)}
```

Import `AlertCircle` from lucide-react if not already imported.

**Step 2: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(dashboard): show error banner with retry button when API fails"
```

---

### Task C5: Fix Records IUF mutation error handling

**Files:**
- Modify: `src/pages/Records.tsx:260-275`

**Step 1: The mutation already has onError handler**

Looking at the code, the mutation already has `onError` at line 274. The `throw` at line 262 is caught by React Query and passed to `onError`. This is actually correct behavior.

However, the error message from the throw ("IUF FFN manquant. Ajoutez-le dans votre profil.") should be displayed properly:

Verify the `onError` handler shows the error message:

```typescript
onError: (e: Error) => {
  toast({
    title: "Erreur d'import",
    description: e.message,
    variant: "destructive",
  });
},
```

If this is already the case, mark as verified-OK. If not, add this handler.

**Step 2: Commit (if changes needed)**

```bash
git add src/pages/Records.tsx
git commit -m "fix(records): ensure IUF error message displayed in toast"
```

---

### Task C6: Add SMS missing phone warning

**Files:**
- Modify: `src/pages/coach/CoachSmsScreen.tsx`

**Step 1: Find the send logic**

After the `athletePhones` query (line 31-40), and where the SMS is composed/sent, add a warning showing which selected athletes have no phone number.

Add a computed list:

```typescript
const missingPhoneAthletes = useMemo(() => {
  if (!athletePhones) return [];
  return athletes
    .filter((a) => a.id != null && selectedUsers.has(a.id) && !athletePhones.has(a.id!))
    .map((a) => a.display_name);
}, [athletes, selectedUsers, athletePhones]);
```

Then in the render, before the send button:

```tsx
{missingPhoneAthletes.length > 0 && (
  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
      {missingPhoneAthletes.length} nageur(s) sans numéro de téléphone :
    </p>
    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
      {missingPhoneAthletes.join(", ")}
    </p>
  </div>
)}
```

**Step 2: Commit**

```bash
git add src/pages/coach/CoachSmsScreen.tsx
git commit -m "fix(coach): warn when selected swimmers have no phone number for SMS"
```

---

## Stream D — UI/UX Polish (Haiku — fast)

**Files touched:**
- Modify: `src/index.css`
- Modify: `src/components/shared/ObjectiveCard.tsx`
- Modify: `src/components/shared/PushPermissionBanner.tsx`
- Modify: `src/components/shared/PWAInstallGate.tsx`

### Task D1: Fix secondary color WCAG contrast

**Files:**
- Modify: `src/index.css`

**Step 1: Find and update --secondary**

Search for `--secondary:` in the `:root` / light mode section. Change from `0 0% 90%` to `0 0% 80%`:

```css
/* Before */
--secondary: 0 0% 90%;

/* After — contrast ratio ~4.6:1 against white */
--secondary: 0 0% 80%;
```

Also verify the dark mode secondary is OK (it should use a darker value already).

**Step 2: Verify visual**

Run: `npm run dev` — check buttons, badges, and other secondary elements look OK.

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "fix(a11y): improve secondary color contrast to meet WCAG AA (4.6:1)"
```

---

### Task D2: Fix touch targets on close buttons

**Files:**
- Modify: `src/components/shared/PushPermissionBanner.tsx:63-68`
- Modify: `src/components/shared/PWAInstallGate.tsx` (find close button)

**Step 1: Fix PushPermissionBanner close button**

Replace line 63-68:

```tsx
{/* Before */}
<button
  onClick={handleDismiss}
  className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground"
  aria-label="Fermer"
>
  <X className="h-4 w-4" />
</button>

{/* After — 44px touch target */}
<button
  onClick={handleDismiss}
  className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
  aria-label="Fermer"
>
  <X className="h-4 w-4" />
</button>
```

**Step 2: Fix PWAInstallGate close button (if any)**

Search for `X` icon or close button in PWAInstallGate.tsx. Apply the same 44px target pattern.

**Step 3: Commit**

```bash
git add src/components/shared/PushPermissionBanner.tsx src/components/shared/PWAInstallGate.tsx
git commit -m "fix(a11y): increase close button touch targets to 44px minimum"
```

---

### Task D3: Centralize ObjectiveCard hardcoded colors into design tokens

**Files:**
- Modify: `src/components/shared/ObjectiveCard.tsx:34-41`

**Step 1: Replace hex colors with Tailwind classes**

The `progressRingColor` function uses hardcoded hex. Replace with CSS variable references:

```typescript
function progressRingColor(pct: number | null): string {
  if (pct == null) return "hsl(var(--muted-foreground))";
  if (pct >= 100) return "hsl(var(--status-success))";
  if (pct >= 75) return "hsl(var(--intensity-1))";     // emerald
  if (pct >= 50) return "hsl(var(--status-warning))";   // yellow
  if (pct >= 25) return "hsl(var(--intensity-4))";      // orange
  return "hsl(var(--status-error))";                     // red
}
```

Check that `--status-success`, `--status-warning`, `--status-error`, `--intensity-1`, `--intensity-4` are defined in `index.css`. They should be based on the design-tokens audit.

Update `RING_DEFAULT` similarly:
```typescript
const RING_DEFAULT = "hsl(var(--muted-foreground))";
```

**Step 2: Verify build and visual**

Run: `npx tsc --noEmit`
Run: `npm run dev` — check objective cards still render correctly

**Step 3: Commit**

```bash
git add src/components/shared/ObjectiveCard.tsx
git commit -m "refactor(ui): replace hardcoded hex colors with design tokens in ObjectiveCard"
```

---

### Task D4: Verify build and run tests

**Files:** None (verification only)

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No new errors (pre-existing stories errors are OK)

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass (pre-existing TimesheetHelpers failure is OK)

**Step 3: Dev server smoke test**

Run: `npm run dev`
- Navigate to /strength → check substitution flow
- Navigate to /coach → check swimmer detail → comms tab
- Check push banner close button size
- Check objective card colors

---

## Execution Order — Agent Teams

```
┌─────────────────────────────────────────────────────────────────────┐
│ T0: All 4 streams start in parallel (separate worktrees)           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Stream A (Opus)          Stream B (Sonnet)                        │
│  A1 → A2 → A3 → A4 → A5  B1 → B2 → B3 → B4                      │
│  ~45 min                   ~30 min                                  │
│                                                                     │
│  Stream C (Sonnet)         Stream D (Haiku)                        │
│  C1 → C2 → C3 → C4 → C5   D1 → D2 → D3 → D4                     │
│  → C6                      ~15 min                                  │
│  ~35 min                                                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ T1: Merge all streams into main                                    │
│ T2: QA agent (Haiku) — tsc + vitest + dev server smoke test        │
└─────────────────────────────────────────────────────────────────────┘
```

**Zero file conflicts:** Each stream touches completely independent files.

**Dependencies:** None between streams. Stream D's CSS changes won't affect Stream A-C component logic.

**Merge order:** D first (smallest), then B, then C, then A (largest). This minimizes conflict risk.

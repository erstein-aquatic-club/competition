# Strength Session Browser — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the swimmer's "S'entraîner" tab with folder-based navigation: unfiled sessions, common library folders from coach, and team athlete plans visible to all swimmers.

**Architecture:** New `SessionBrowser` orchestrator replaces `SessionList`. Extracts reusable sub-components (InProgressCard, CycleSelector). Adds `CommonFolderList` for coach folders, `TeamPlansSection` reusing `MyPlanTab` per athlete. New API function `getTeamAthletePlans` fetches all athlete plans with a join on `users.display_name`.

**Tech Stack:** React 19, TypeScript, Radix Collapsible, React Query 5, Supabase (existing tables), Tailwind CSS 4

**Design doc:** `docs/plans/2026-03-28-strength-session-browser-design.md`

---

### Task 1: API — `getTeamAthletePlans`

**Files:**
- Modify: `src/lib/api/strength.ts` (after `getStrengthFolders`, ~line 1127)
- Modify: `src/lib/api/index.ts` (add re-export)
- Modify: `src/lib/api.ts` (add to api facade, ~line 596)

**Step 1: Add `TeamAthletePlan` type to `src/lib/api/types.ts`**

After the `StrengthFolder` interface (~line 92), add:

```typescript
export interface TeamAthletePlan {
  athleteId: number;
  athleteName: string;
  folders: StrengthFolder[];
}
```

**Step 2: Implement `getTeamAthletePlans` in `src/lib/api/strength.ts`**

After the `getStrengthFolders` function (~line 1127), add:

```typescript
export async function getTeamAthletePlans(
  excludeAthleteId: number,
): Promise<TeamAthletePlan[]> {
  if (!canUseSupabase()) return [];

  // Fetch all athlete-specific root folders (with user name)
  const { data: roots, error: rootErr } = await supabase
    .from("strength_folders")
    .select("*, users!inner(display_name)")
    .eq("type", "session")
    .not("athlete_id", "is", null)
    .neq("athlete_id", excludeAthleteId)
    .is("parent_id", null)
    .order("sort_order", { ascending: true });
  if (rootErr) throw new Error(rootErr.message);
  if (!roots?.length) return [];

  // Fetch children of those roots
  const rootIds = roots.map((r: any) => r.id);
  const { data: children, error: childErr } = await supabase
    .from("strength_folders")
    .select("*")
    .eq("type", "session")
    .in("parent_id", rootIds)
    .order("sort_order", { ascending: true });
  if (childErr) throw new Error(childErr.message);

  // Group by athlete
  const athleteMap = new Map<number, { name: string; folders: StrengthFolder[] }>();
  for (const row of roots) {
    const aid = safeInt(row.athlete_id);
    const name = (row.users as any)?.display_name ?? "Nageur";
    if (!athleteMap.has(aid)) athleteMap.set(aid, { name, folders: [] });
    athleteMap.get(aid)!.folders.push(mapFolder(row));
  }
  for (const row of (children ?? [])) {
    const parentRoot = roots.find((r: any) => r.id === row.parent_id);
    if (!parentRoot) continue;
    const aid = safeInt(parentRoot.athlete_id);
    athleteMap.get(aid)?.folders.push(mapFolder(row));
  }

  // Sort alphabetically by athlete name
  return Array.from(athleteMap.entries())
    .map(([athleteId, { name, folders }]) => ({
      athleteId,
      athleteName: name,
      folders,
    }))
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName));
}
```

**Step 3: Export from `src/lib/api/index.ts`**

In the strength re-exports section, add `getTeamAthletePlans` to the list.

**Step 4: Wire into facade `src/lib/api.ts`**

After the `getStrengthFolders` line (~596), add:

```typescript
import { getTeamAthletePlans as _getTeamAthletePlans } from "./api/strength";
// ...in the api object:
async getTeamAthletePlans(excludeAthleteId: number) { return _getTeamAthletePlans(excludeAthleteId); },
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/strength.ts src/lib/api/index.ts src/lib/api.ts
git commit -m "feat(strength): add getTeamAthletePlans API for cross-athlete plan visibility"
```

---

### Task 2: Extract `CycleSelector` component

**Files:**
- Create: `src/components/strength/CycleSelector.tsx`
- Modify: `src/components/strength/SessionList.tsx` (remove inline cycle selector, import new component)

**Step 1: Create `CycleSelector.tsx`**

Extract the cycle selector grid from `SessionList.tsx` (lines 69-88 for config, 325-346 for JSX):

```tsx
import { Flame, Zap, Weight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrengthCycleType } from "@/lib/api";

const cycleConfig = [
  { value: "endurance" as StrengthCycleType, label: "Endurance", icon: Flame },
  { value: "hypertrophie" as StrengthCycleType, label: "Hypertrophie", icon: Zap },
  { value: "force" as StrengthCycleType, label: "Force", icon: Weight },
] as const;

interface CycleSelectorProps {
  cycleType: StrengthCycleType;
  onCycleChange: (cycle: StrengthCycleType) => void;
}

export function CycleSelector({ cycleType, onCycleChange }: CycleSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cycleConfig.map((option) => {
        const active = cycleType === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onCycleChange(option.value)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 transition-all active:scale-[0.96]",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active ? "text-primary-foreground" : "text-muted-foreground/50")} />
            <span className="text-[12px] font-bold leading-tight">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Update `SessionList.tsx` to import and use `CycleSelector`**

Replace the inline cycle config and JSX block with:
```tsx
import { CycleSelector } from "@/components/strength/CycleSelector";
// In JSX, replace the grid div with:
<CycleSelector cycleType={cycleType} onCycleChange={onCycleChange} />
```

Remove the `cycleConfig` const, `Flame`, `Zap`, `Weight` imports from SessionList.

**Step 3: Verify the app compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/strength/CycleSelector.tsx src/components/strength/SessionList.tsx
git commit -m "refactor(strength): extract CycleSelector component from SessionList"
```

---

### Task 3: Extract `InProgressCard` component

**Files:**
- Create: `src/components/strength/InProgressCard.tsx`
- Modify: `src/components/strength/SessionList.tsx`

**Step 1: Create `InProgressCard.tsx`**

Extract the in-progress card from `SessionList.tsx` (lines 349-438). The component needs:

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, StrengthCycleType, StrengthSessionTemplate, Assignment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { orderStrengthItems } from "@/components/strength/utils";
import type { SaveState } from "@/components/shared/BottomActionBar";
import type { LocalStrengthRun } from "@/lib/types";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") return value;
  return "endurance";
};

interface InProgressCardProps {
  inProgressRun: LocalStrengthRun;
  inProgressAssignment: (Assignment & { session_type: "strength" }) | null;
  inProgressSession: StrengthSessionTemplate | null;
  user: string | null;
  athleteKey: number | string | null;
  setSaveState: (state: SaveState) => void;
  onResumeInProgress: (params: {
    assignment: Assignment | null;
    session: StrengthSessionTemplate | null;
    runId: number;
    logs: any[];
    progressPct: number;
  }) => void;
}

export function InProgressCard({
  inProgressRun,
  inProgressAssignment,
  inProgressSession,
  user,
  athleteKey,
  setSaveState,
  onResumeInProgress,
}: InProgressCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const inProgressRunCompleted =
    inProgressRun.status === "completed" || (inProgressRun.progress_pct ?? 0) >= 100;

  const canResume =
    (Boolean(inProgressAssignment?.items?.length) || Boolean(inProgressSession?.items?.length)) &&
    !inProgressRunCompleted;

  const deleteStrengthRun = useMutation({
    mutationFn: (runId: number) => api.deleteStrengthRun(runId),
    onMutate: () => setSaveState("saving"),
    onSuccess: (data) => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      queryClient.invalidateQueries({ queryKey: ["strength_run_in_progress", athleteKey] });
      queryClient.invalidateQueries({ queryKey: ["strength_history"] });
      queryClient.invalidateQueries({ queryKey: ["assignments", user, "strength"] });
      toast({
        title: "Séance supprimée",
        description: data?.source === "local" ? "Suppression locale : le serveur n'est pas disponible." : undefined,
      });
    },
    onError: () => {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      toast({ title: "Erreur", description: "Impossible de supprimer la séance en cours.", variant: "destructive" });
    },
  });

  const handleResume = () => {
    const source = inProgressAssignment ?? inProgressSession;
    if (!source) return;
    const sessionItems = (inProgressAssignment?.items ?? inProgressSession?.items) ?? [];
    const strengthItems = sessionItems.filter((item): item is any => "exercise_id" in item);
    const cycle = normalizeStrengthCycle(
      (inProgressAssignment?.cycle ?? inProgressSession?.cycle) ??
        strengthItems.find((item) => item.cycle_type)?.cycle_type,
    );
    const filteredItems = strengthItems.filter((item) => item.cycle_type === cycle);
    const items = orderStrengthItems(filteredItems.length ? filteredItems : strengthItems);
    onResumeInProgress({
      assignment: inProgressAssignment ?? null,
      session: { ...source, title: source.title, description: source.description ?? null, cycle, items },
      runId: inProgressRun.id,
      logs: inProgressRun.logs ?? [],
      progressPct: inProgressRun.progress_pct ?? 0,
    });
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="rounded-xl bg-primary text-primary-foreground p-3.5 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2 shrink-0">
            {!inProgressRunCompleted && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <span className="text-[13px] font-bold truncate flex-1">
            {inProgressAssignment?.title ?? inProgressSession?.title ?? "Séance en cours"}
          </span>
          <span className="text-[11px] text-white/60 shrink-0">
            {format(new Date(inProgressRun.started_at || new Date()), "dd MMM", { locale: fr })}
          </span>
        </div>
        <div className="mb-3">
          <div className="h-1 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${inProgressRun.progress_pct ?? 0}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-[10px] text-white/50 font-semibold mt-1 tabular-nums">
            {Math.round(inProgressRun.progress_pct ?? 0)}% complété
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 h-10 rounded-xl bg-white text-primary font-bold text-[13px] hover:bg-white/90 shadow-none"
            disabled={!canResume}
            onClick={handleResume}
          >
            {inProgressRunCompleted ? "Voir le résumé" : "Reprendre"}
          </Button>
          {!inProgressRunCompleted && (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
              disabled={deleteStrengthRun.isPending}
              onClick={() => setDeleteConfirmOpen(true)}
              aria-label="Supprimer la séance"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la séance ?</AlertDialogTitle>
            <AlertDialogDescription>Les séries déjà enregistrées seront perdues.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteStrengthRun.mutate(inProgressRun.id);
                setDeleteConfirmOpen(false);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Step 2: Update `SessionList.tsx`**

Import `InProgressCard` and replace the inline in-progress card + AlertDialog with:
```tsx
{inProgressRun && (
  <InProgressCard
    inProgressRun={inProgressRun}
    inProgressAssignment={inProgressAssignment}
    inProgressSession={inProgressSession}
    user={user}
    athleteKey={athleteKey}
    setSaveState={setSaveState}
    onResumeInProgress={onResumeInProgress}
  />
)}
```

Remove the `deleteConfirmOpen`/`pendingDeleteRunId` state and `deleteStrengthRun` mutation from SessionList. Remove the `AlertDialog` at the bottom. Remove unused imports (`AlertDialog*`, `format`, `fr`, `motion` if only used there).

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/strength/InProgressCard.tsx src/components/strength/SessionList.tsx
git commit -m "refactor(strength): extract InProgressCard component from SessionList"
```

---

### Task 4: Create `UnfiledSessionList` component

**Files:**
- Create: `src/components/strength/UnfiledSessionList.tsx`

**Step 1: Create the component**

Displays sessions that have no `folder_id` (or `folder_id` not in the global folders set). Reuses the same card style as `SessionList`.

```tsx
import { StrengthSessionTemplate, StrengthCycleType, Assignment } from "@/lib/api";
import { ChevronRight, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { staggerChildren, listItem } from "@/lib/animations";

interface DisplaySession {
  key: string;
  title: string;
  description: string | null;
  type: "assignment" | "catalog";
  assignedDate?: string;
  session: StrengthSessionTemplate;
  assignment?: Assignment;
  exerciseCount: number;
}

interface UnfiledSessionListProps {
  sessions: DisplaySession[];
  onStartAssignment: (assignment: Assignment) => void;
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}

const cardVariant = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

export function UnfiledSessionList({ sessions, onStartAssignment, onStartCatalog }: UnfiledSessionListProps) {
  if (sessions.length === 0) return null;

  return (
    <motion.div
      className="space-y-1.5 motion-reduce:animate-none"
      variants={staggerChildren}
      initial="hidden"
      animate="visible"
    >
      {sessions.map((session) => {
        const isAssignment = session.type === "assignment";
        return (
          <motion.button
            key={session.key}
            type="button"
            variants={cardVariant}
            className={cn(
              "group w-full rounded-xl border bg-card text-left transition-all active:scale-[0.98]",
              isAssignment ? "border-primary/20 hover:border-primary/40" : "hover:border-primary/30",
            )}
            onClick={() => {
              if (isAssignment && session.assignment) {
                onStartAssignment(session.assignment);
              } else {
                onStartCatalog(session.session);
              }
            }}
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <div className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                isAssignment ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
              )}>
                <span className="text-sm font-bold">{session.exerciseCount}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-[13px] truncate leading-tight">{session.title}</p>
                  {isAssignment && (
                    <span className="shrink-0 inline-flex items-center rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">Coach</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                  {session.exerciseCount} ex.
                  {isAssignment && session.assignedDate && (
                    <><span className="text-muted-foreground/40"> · </span>{format(new Date(session.assignedDate), "dd MMM", { locale: fr })}</>
                  )}
                  {!isAssignment && session.description && (
                    <><span className="text-muted-foreground/40"> · </span><span className="truncate">{session.description}</span></>
                  )}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

export type { DisplaySession };
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/strength/UnfiledSessionList.tsx
git commit -m "feat(strength): add UnfiledSessionList component"
```

---

### Task 5: Create `CommonFolderList` component

**Files:**
- Create: `src/components/strength/CommonFolderList.tsx`

**Step 1: Create the component**

Displays global coach folders as collapsible accordions with session cards inside.

```tsx
import { useMemo, useState } from "react";
import { StrengthSessionTemplate, StrengthFolder, Assignment } from "@/lib/api";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, FolderOpen, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DisplaySession } from "@/components/strength/UnfiledSessionList";

interface CommonFolderListProps {
  folders: StrengthFolder[];
  allSessions: StrengthSessionTemplate[];
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}

export function CommonFolderList({ folders, allSessions, onStartCatalog }: CommonFolderListProps) {
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);
  const subFoldersMap = useMemo(() => {
    const map = new Map<number, StrengthFolder[]>();
    for (const f of folders) {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f);
        map.set(f.parent_id, arr);
      }
    }
    return map;
  }, [folders]);

  const sessionsByFolder = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const map = new Map<number, StrengthSessionTemplate[]>();
    for (const s of allSessions) {
      if (s.folder_id && folderIds.has(s.folder_id)) {
        const arr = map.get(s.folder_id) ?? [];
        arr.push(s);
        map.set(s.folder_id, arr);
      }
    }
    return map;
  }, [folders, allSessions]);

  if (rootFolders.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Bibliothèque</span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {rootFolders.map((root) => {
        const subs = subFoldersMap.get(root.id) ?? [];
        const directSessions = sessionsByFolder.get(root.id) ?? [];
        const allFolderSessions = [
          ...directSessions,
          ...subs.flatMap((sub) => sessionsByFolder.get(sub.id) ?? []),
        ];
        if (allFolderSessions.length === 0) return null;

        return <FolderAccordion key={root.id} folder={root} subFolders={subs} sessionsByFolder={sessionsByFolder} directSessions={directSessions} totalCount={allFolderSessions.length} onStartCatalog={onStartCatalog} />;
      })}
    </div>
  );
}

function FolderAccordion({
  folder,
  subFolders,
  sessionsByFolder,
  directSessions,
  totalCount,
  onStartCatalog,
}: {
  folder: StrengthFolder;
  subFolders: StrengthFolder[];
  sessionsByFolder: Map<number, StrengthSessionTemplate[]>;
  directSessions: StrengthSessionTemplate[];
  totalCount: number;
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full rounded-xl border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-[13px] font-semibold flex-1 truncate">{folder.name}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{totalCount}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-3 pt-1 space-y-1">
          {/* Direct sessions in root folder */}
          {directSessions.map((s) => (
            <SessionRow key={s.id} session={s} onSelect={onStartCatalog} />
          ))}
          {/* Sub-folders */}
          {subFolders.map((sub) => {
            const sessions = sessionsByFolder.get(sub.id) ?? [];
            if (sessions.length === 0) return null;
            return (
              <div key={sub.id} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground/70 pt-1.5 pl-1">{sub.name}</p>
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} onSelect={onStartCatalog} />
                ))}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SessionRow({ session, onSelect }: { session: StrengthSessionTemplate; onSelect: (s: StrengthSessionTemplate) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className="group flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-accent/50 transition-colors"
    >
      <Dumbbell className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <span className="text-[13px] font-medium flex-1 truncate">{session.title ?? session.name ?? "Sans titre"}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{session.items?.length ?? 0} ex.</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 shrink-0" />
    </button>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/strength/CommonFolderList.tsx
git commit -m "feat(strength): add CommonFolderList component with collapsible folders"
```

---

### Task 6: Create `TeamPlansSection` component

**Files:**
- Create: `src/components/strength/TeamPlansSection.tsx`

**Step 1: Create the component**

Displays plans of other athletes, each in a collapsible block reusing `MyPlanTab`.

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, StrengthSessionTemplate } from "@/lib/api";
import type { TeamAthletePlan } from "@/lib/api/types";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MyPlanTab } from "@/components/strength/MyPlanTab";

interface TeamPlansSectionProps {
  currentAthleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function TeamPlansSection({ currentAthleteId, onSelectSession }: TeamPlansSectionProps) {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["team_athlete_plans", currentAthleteId],
    queryFn: () => api.getTeamAthletePlans(currentAthleteId),
  });

  if (isLoading || plans.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Plans d'équipe</span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {plans.map((plan) => (
        <AthletePlanAccordion
          key={plan.athleteId}
          plan={plan}
          onSelectSession={onSelectSession}
        />
      ))}
    </div>
  );
}

function AthletePlanAccordion({
  plan,
  onSelectSession,
}: {
  plan: TeamAthletePlan;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = plan.athleteName.charAt(0).toUpperCase();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full rounded-xl border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
          {initial}
        </div>
        <span className="text-[13px] font-semibold flex-1 truncate">{plan.athleteName}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-1">
          <MyPlanTab athleteId={plan.athleteId} onSelectSession={onSelectSession} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/strength/TeamPlansSection.tsx
git commit -m "feat(strength): add TeamPlansSection with per-athlete collapsible plans"
```

---

### Task 7: Create `SessionBrowser` orchestrator

**Files:**
- Create: `src/components/strength/SessionBrowser.tsx`

**Step 1: Create the orchestrator**

This replaces `SessionList` in the "S'entraîner" tab. It composes all the sub-components.

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, StrengthCycleType, StrengthSessionTemplate, Assignment } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search, X, Dumbbell } from "lucide-react";
import { CycleSelector } from "@/components/strength/CycleSelector";
import { InProgressCard } from "@/components/strength/InProgressCard";
import { UnfiledSessionList, type DisplaySession } from "@/components/strength/UnfiledSessionList";
import { CommonFolderList } from "@/components/strength/CommonFolderList";
import { TeamPlansSection } from "@/components/strength/TeamPlansSection";
import { orderStrengthItems } from "@/components/strength/utils";
import type { SaveState } from "@/components/shared/BottomActionBar";
import type { LocalStrengthRun } from "@/lib/types";
import { resolveNextStep } from "@/components/strength/WorkoutRunner";
import { Skeleton } from "@/components/ui/skeleton";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") return value;
  return "endurance";
};

interface SessionBrowserProps {
  user: string | null;
  userId: number | null;
  athleteName: string | null;
  athleteId: number | null;
  athleteKey: number | string | null;
  cycleType: StrengthCycleType;
  searchQuery: string;
  isLoading: boolean;
  setSaveState: (state: SaveState) => void;
  onCycleChange: (cycle: StrengthCycleType) => void;
  onSearchChange: (query: string) => void;
  onStartAssignment: (assignment: Assignment) => void;
  onStartCatalog: (session: StrengthSessionTemplate) => void;
  onStartPlanSession: (session: StrengthSessionTemplate) => void;
  onResumeInProgress: (params: {
    assignment: Assignment | null;
    session: StrengthSessionTemplate | null;
    runId: number;
    logs: any[];
    progressPct: number;
  }) => void;
}

export function SessionBrowser({
  user,
  userId,
  athleteName,
  athleteId,
  athleteKey,
  cycleType,
  searchQuery,
  isLoading,
  setSaveState,
  onCycleChange,
  onSearchChange,
  onStartAssignment,
  onStartCatalog,
  onStartPlanSession,
  onResumeInProgress,
}: SessionBrowserProps) {
  // Queries
  const { data: assignments } = useQuery({
    queryKey: ["assignments", user, "strength"],
    queryFn: () => api.getAssignments(user!, userId, { assignmentType: "strength" }),
    enabled: !!user,
  });

  const { data: strengthCatalog } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  const { data: globalFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", null],
    queryFn: () => api.getStrengthFolders("session", { athleteId: null }),
  });

  const inProgressRunQuery = useQuery({
    queryKey: ["strength_run_in_progress", athleteKey],
    queryFn: () =>
      api.getStrengthHistory(athleteName!, {
        limit: 1, offset: 0, order: "desc", status: "in_progress", athleteId,
      }),
    enabled: !!athleteName,
  });

  const inProgressRun = inProgressRunQuery.data?.runs?.[0] ?? null;

  // Strength assignments
  const strengthAssignments = useMemo(
    () => (assignments ?? []).filter(
      (a): a is Assignment & { session_type: "strength" } => a.session_type === "strength",
    ),
    [assignments],
  );
  const activeAssignments = useMemo(
    () => strengthAssignments.filter((a) => a.status !== "completed"),
    [strengthAssignments],
  );

  const inProgressAssignment = useMemo(
    () => inProgressRun ? activeAssignments.find((a) => a.id === inProgressRun.assignment_id) ?? null : null,
    [inProgressRun, activeAssignments],
  );
  const inProgressSession = useMemo(
    () => inProgressRun && !inProgressAssignment ? strengthCatalog?.find((s) => s.id === inProgressRun.session_id) ?? null : null,
    [inProgressRun, inProgressAssignment, strengthCatalog],
  );

  // Build display sessions
  const globalFolderIds = useMemo(() => new Set(globalFolders.map((f) => f.id)), [globalFolders]);

  const assignedDisplaySessions: DisplaySession[] = useMemo(
    () => activeAssignments.map((assign) => {
      const items = (assign.items ?? []).filter((item): item is any => "exercise_id" in item);
      return {
        key: `assignment-${assign.id}`,
        title: assign.title,
        description: assign.description,
        type: "assignment" as const,
        assignedDate: assign.assigned_date,
        session: { id: assign.session_id, title: assign.title, description: assign.description, cycle: normalizeStrengthCycle(assign.cycle), items },
        assignment: assign,
        exerciseCount: items.length,
      };
    }),
    [activeAssignments],
  );

  const unfiledCatalogSessions: DisplaySession[] = useMemo(
    () => (strengthCatalog ?? [])
      .filter((s) => !s.folder_id || !globalFolderIds.has(s.folder_id))
      .map((session) => ({
        key: `catalog-${session.id}`,
        title: session.title,
        description: session.description,
        type: "catalog" as const,
        session: { ...session, cycle: cycleType },
        exerciseCount: session.items?.length ?? 0,
      })),
    [strengthCatalog, cycleType, globalFolderIds],
  );

  // Sessions in folders (for filtering purposes — need to exclude from unfiled)
  const sessionsInFolders = useMemo(() => {
    const folderSessionIds = new Set<number>();
    for (const s of (strengthCatalog ?? [])) {
      if (s.folder_id && globalFolderIds.has(s.folder_id)) folderSessionIds.add(s.id);
    }
    return folderSessionIds;
  }, [strengthCatalog, globalFolderIds]);

  // Search filter
  const searchValue = searchQuery.trim().toLowerCase();

  const filteredUnfiled = useMemo(() => {
    const all = [...assignedDisplaySessions, ...unfiledCatalogSessions];
    if (!searchValue) return all;
    return all.filter((s) => `${s.title} ${s.description}`.toLowerCase().includes(searchValue));
  }, [assignedDisplaySessions, unfiledCatalogSessions, searchValue]);

  const filteredCatalogForFolders = useMemo(() => {
    if (!searchValue) return strengthCatalog ?? [];
    return (strengthCatalog ?? []).filter((s) =>
      `${s.title} ${s.name} ${s.description}`.toLowerCase().includes(searchValue),
    );
  }, [strengthCatalog, searchValue]);

  const totalCount = (strengthCatalog?.length ?? 0) + assignedDisplaySessions.length;
  const showSearch = totalCount > 4 || searchQuery.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-muted/50 animate-pulse" />)}
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2">
              <div className="h-11 w-11 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-3/5 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-2/5 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in motion-reduce:animate-none">
      <CycleSelector cycleType={cycleType} onCycleChange={onCycleChange} />

      {inProgressRun && (
        <InProgressCard
          inProgressRun={inProgressRun}
          inProgressAssignment={inProgressAssignment}
          inProgressSession={inProgressSession}
          user={user}
          athleteKey={athleteKey}
          setSaveState={setSaveState}
          onResumeInProgress={onResumeInProgress}
        />
      )}

      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="Rechercher…"
            className="h-9 rounded-xl bg-muted/30 pl-8 pr-8 border-0 text-[13px] focus-visible:ring-2 focus-visible:ring-primary/30"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Rechercher une séance"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition"
              onClick={() => onSearchChange("")}
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Unfiled sessions (assignments + catalog without folders) */}
      <UnfiledSessionList
        sessions={filteredUnfiled}
        onStartAssignment={onStartAssignment}
        onStartCatalog={onStartCatalog}
      />

      {/* Common library folders */}
      {!searchValue && (
        <CommonFolderList
          folders={globalFolders}
          allSessions={strengthCatalog ?? []}
          onStartCatalog={onStartCatalog}
        />
      )}

      {/* Team plans */}
      {!searchValue && userId && (
        <TeamPlansSection
          currentAthleteId={userId}
          onSelectSession={onStartPlanSession}
        />
      )}

      {/* Empty state */}
      {filteredUnfiled.length === 0 && searchValue && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Dumbbell className="h-8 w-8 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">Aucune séance trouvée</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1 max-w-[220px]">
            Modifiez votre recherche.
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/strength/SessionBrowser.tsx
git commit -m "feat(strength): add SessionBrowser orchestrator component"
```

---

### Task 8: Wire `SessionBrowser` into `Strength.tsx`

**Files:**
- Modify: `src/pages/Strength.tsx`

**Step 1: Replace `SessionList` with `SessionBrowser` in the "start" tab**

In the imports section (~line 11), replace:
```tsx
import { SessionList } from "@/components/strength/SessionList";
```
with:
```tsx
import { SessionBrowser } from "@/components/strength/SessionBrowser";
```

In the TabsContent for "start" (~line 697-726), replace `<SessionList ... />` with:
```tsx
<SessionBrowser
  user={user}
  userId={userId}
  athleteName={historyAthleteName}
  athleteId={historyAthleteId}
  athleteKey={historyAthleteKey}
  cycleType={cycleType}
  searchQuery={searchQuery}
  isLoading={isListLoading}
  setSaveState={setSaveState}
  onCycleChange={setCycleType}
  onSearchChange={setSearchQuery}
  onStartAssignment={(assignment) => {
    if (assignment.session_type === "strength") {
      startAssignment(assignment as any);
    }
  }}
  onStartCatalog={startCatalogSession}
  onStartPlanSession={startPlanSession}
  onResumeInProgress={({ assignment, session, runId, logs, progressPct }) => {
    setActiveAssignment(assignment);
    setActiveSession(session);
    setActiveRunId(runId);
    setActiveRunLogs(logs);
    setActiveRunnerStep(resolveNextStep(session?.items ?? [], logs, progressPct));
    setScreenMode("focus");
  }}
/>
```

Note the new prop `onStartPlanSession` which calls `startPlanSession` (already defined in Strength.tsx).

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Verify app runs**

Run: `npm run dev` — check the "S'entraîner" tab renders correctly with all 3 sections.

**Step 4: Commit**

```bash
git add src/pages/Strength.tsx
git commit -m "feat(strength): wire SessionBrowser into Strength page (§93)"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

**Step 1: Add implementation log entry**

Add a new section in `docs/implementation-log.md`:

```markdown
## §93 — Restructuration bibliothèque musculation nageur (2026-03-28)

**Contexte** : L'onglet "S'entraîner" affichait toutes les séances à plat. Restructuration avec dossiers et visibilité inter-nageurs.

**Changements** :
- Nouveau `SessionBrowser.tsx` remplace `SessionList` dans l'onglet "S'entraîner"
- Extraction `CycleSelector.tsx` et `InProgressCard.tsx` (réutilisables)
- Nouveau `UnfiledSessionList.tsx` — séances sans dossier (liste plate)
- Nouveau `CommonFolderList.tsx` — dossiers globaux coach en accordéons Collapsible
- Nouveau `TeamPlansSection.tsx` — plans d'autres nageurs, réutilise `MyPlanTab`
- Nouvelle API `getTeamAthletePlans()` — fetch plans d'autres nageurs avec join users
- 3 sections ordonnées : séances non classées → bibliothèque commune → plans d'équipe

**Fichiers modifiés** :
- `src/components/strength/SessionBrowser.tsx` (nouveau)
- `src/components/strength/CycleSelector.tsx` (nouveau)
- `src/components/strength/InProgressCard.tsx` (nouveau)
- `src/components/strength/UnfiledSessionList.tsx` (nouveau)
- `src/components/strength/CommonFolderList.tsx` (nouveau)
- `src/components/strength/TeamPlansSection.tsx` (nouveau)
- `src/components/strength/SessionList.tsx` (refactorisé — extraction composants)
- `src/lib/api/strength.ts` (ajout getTeamAthletePlans)
- `src/lib/api/index.ts`, `src/lib/api.ts` (re-exports)
- `src/pages/Strength.tsx` (branche SessionBrowser)

**Tests** : Vérification TypeScript + test visuel dev server
**Décisions** : Réutilisation de `MyPlanTab` pour les plans d'équipe (cohérence visuelle)
**Limites** : La recherche ne filtre que les séances non classées (pas les dossiers/plans)
```

**Step 2: Update ROADMAP.md**

Add entry #56 in the chantiers table:
```markdown
| 56 | Restructuration bibliothèque musculation nageur | Moyenne | Fait (§93) |
```

**Step 3: Update CLAUDE.md**

Add new files to the "Fichiers clés" table:
```markdown
| `src/components/strength/SessionBrowser.tsx` | Orchestrateur bibliothèque muscu nageur (§93) | |
| `src/components/strength/CommonFolderList.tsx` | Accordéons dossiers globaux muscu (§93) | |
| `src/components/strength/TeamPlansSection.tsx` | Plans d'équipe visibles entre nageurs (§93) | |
```

**Step 4: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs: add §93 strength session browser to roadmap, implementation log, CLAUDE.md"
```

**Step 5: Final verify**

Run: `npx tsc --noEmit && npm run build`
Expected: Clean build, no errors.

Plan sauvegardé. Deux options d'exécution :

**1. Subagent-Driven (cette session)** — Je dispatche un agent frais par tâche, review entre chaque, itération rapide

**2. Parallel Session (séparée)** — Ouvre une nouvelle session avec executing-plans, exécution par batch avec checkpoints

Quelle approche ?
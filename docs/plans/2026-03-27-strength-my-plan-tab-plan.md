# Onglet "Mon plan" nageur — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un onglet "Mon plan" dans la page Strength pour que le nageur voie et lance ses séances planifiées par le coach.

**Architecture:** Nouveau composant `MyPlanTab` qui fetch les dossiers perso du nageur et affiche l'arborescence cycles → séances en lecture seule. Tap sur une séance réutilise le flow existant `startCatalogSession` pour passer en mode preview → workout.

**Tech Stack:** React, TypeScript, React Query, API existante (`getStrengthFolders`, `getStrengthSessions`), Shadcn UI.

**Design doc:** `docs/plans/2026-03-27-strength-my-plan-tab-design.md`

---

### Task 1: Créer le composant MyPlanTab

**Files:**
- Create: `src/components/strength/MyPlanTab.tsx`

**Step 1: Create the component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrengthSessionTemplate, StrengthFolder } from "@/lib/api/types";
import { ChevronRight, Dumbbell, FolderOpen } from "lucide-react";
import { useState } from "react";

interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function MyPlanTab({ athleteId, onSelectSession }: MyPlanTabProps) {
  // Fetch athlete's personal folders
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => api.getStrengthFolders("session", { athleteId }),
  });

  // Fetch full session catalog to get items
  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  // Build hierarchy: root folders → sub-folders (cycles)
  const rootFolders = folders.filter((f) => !f.parent_id);
  const subFoldersMap = new Map<number, StrengthFolder[]>();
  for (const f of folders) {
    if (f.parent_id) {
      const arr = subFoldersMap.get(f.parent_id) ?? [];
      arr.push(f);
      subFoldersMap.set(f.parent_id, arr);
    }
  }

  // Index sessions by folder_id
  const folderIds = new Set(folders.map((f) => f.id));
  const sessionsByFolder = new Map<number, StrengthSessionTemplate[]>();
  for (const s of allSessions) {
    if (s.folder_id && folderIds.has(s.folder_id)) {
      const arr = sessionsByFolder.get(s.folder_id) ?? [];
      arr.push(s);
      sessionsByFolder.set(s.folder_id, arr);
    }
  }

  if (foldersLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (rootFolders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FolderOpen className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Aucun plan personnalisé.</p>
        <p className="text-xs mt-1">Ton coach peut créer un plan depuis le catalogue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rootFolders.map((root) => {
        const cycles = subFoldersMap.get(root.id) ?? [];
        const rootSessions = sessionsByFolder.get(root.id) ?? [];

        return (
          <div key={root.id}>
            {/* Only show root name if there are multiple roots */}
            {rootFolders.length > 1 && (
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{root.name}</h3>
            )}

            {/* Cycles as collapsible sections */}
            {cycles.map((cycle) => (
              <CycleSection
                key={cycle.id}
                name={cycle.name}
                sessions={sessionsByFolder.get(cycle.id) ?? []}
                onSelectSession={onSelectSession}
              />
            ))}

            {/* Sessions directly in root (no cycle) */}
            {rootSessions.map((s) => (
              <SessionRow key={s.id} session={s} onSelect={onSelectSession} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CycleSection({
  name,
  sessions,
  onSelectSession,
}: {
  name: string;
  sessions: StrengthSessionTemplate[];
  onSelectSession: (s: StrengthSessionTemplate) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2 px-1"
      >
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{sessions.length} séance{sessions.length > 1 ? "s" : ""}</span>
      </button>
      {open && (
        <div className="ml-6 space-y-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Aucune séance dans ce cycle.</p>
          ) : (
            sessions.map((s) => <SessionRow key={s.id} session={s} onSelect={onSelectSession} />)
          )}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onSelect,
}: {
  session: StrengthSessionTemplate;
  onSelect: (s: StrengthSessionTemplate) => void;
}) {
  const itemCount = session.items?.length ?? 0;

  return (
    <button
      onClick={() => onSelect(session)}
      className="flex items-center gap-3 w-full text-left rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors"
    >
      <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{session.title || session.name}</p>
      </div>
      {itemCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">{itemCount} ex.</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (only pre-existing errors).

**Step 3: Commit**

```bash
git add src/components/strength/MyPlanTab.tsx
git commit -m "feat: create MyPlanTab component for athlete plan view"
```

---

### Task 2: Intégrer l'onglet dans Strength.tsx

**Files:**
- Modify: `src/pages/Strength.tsx:662-725` (tab structure)

**Step 1: Add import**

At the top of Strength.tsx, add:
```typescript
import { MyPlanTab } from "@/components/strength/MyPlanTab";
```

**Step 2: Add the tab trigger**

Change line 663 from `grid-cols-2` to `grid-cols-3` and add the new trigger:

```tsx
<TabsList className="grid w-full grid-cols-3">
  <TabsTrigger value="start">S'entraîner</TabsTrigger>
  <TabsTrigger value="planning">Mon plan</TabsTrigger>
  <TabsTrigger value="history">Historique</TabsTrigger>
</TabsList>
```

**Step 3: Add the tab content**

After the "start" TabsContent (after line 716), before "history" TabsContent:

```tsx
<TabsContent value="planning" className="space-y-4 pt-4">
  {screenMode === "list" && userId && (
    <MyPlanTab
      athleteId={userId}
      onSelectSession={startCatalogSession}
    />
  )}
  {screenMode === "reader" && activeSession && exercises && (
    <SessionDetailPreview
      session={activeSession}
      assignment={activeAssignment}
      cycleType={cycleType}
      cycleOptions={cycleOptions}
      exercises={exercises}
      oneRMs={oneRMs || []}
      saveState={saveState}
      onBack={() => setScreenMode("list")}
      onLaunch={handleLaunchFocus}
      substitutions={substitutions}
      onSubstitute={handleSubstitute}
      originalItemCount={originalItemCount}
      onAddExercise={handleAddExercise}
    />
  )}
</TabsContent>
```

Note: The SessionDetailPreview block is duplicated from the "start" tab. This is intentional — when the user selects a session from "Mon plan", `screenMode` becomes "reader" and the preview renders inside the same tab.

**Step 4: Verify userId is available**

Check that `userId` is a number (not null). It comes from the auth hook. In Strength.tsx, find how `userId` / `historyAthleteId` is defined and use the right variable. It should be the current user's numeric ID.

Read the file to confirm the exact variable name, then use it in `<MyPlanTab athleteId={...} />`.

**Step 5: Run type check + dev server**

Run: `npx tsc --noEmit && npm run dev`
Expected: PASS. New "Mon plan" tab visible. Shows empty state if no plan exists for the current user.

**Step 6: Commit**

```bash
git add src/pages/Strength.tsx
git commit -m "feat: add Mon plan tab to athlete strength page"
```

---

### Task 3: Documentation

**Files:**
- Modify: `docs/implementation-log.md` (update §90 with phase 2)
- Modify: `docs/FEATURES_STATUS.md` (update status)
- Modify: `CLAUDE.md` (add MyPlanTab to key files if needed)

**Step 1: Update implementation log**

Add a sub-section to §90 or a new entry for phase 2:
- Composant MyPlanTab créé
- Onglet "Mon plan" ajouté dans Strength.tsx
- Lecture seule, réutilise le flow startCatalogSession existant

**Step 2: Update FEATURES_STATUS**

Update the "Dossiers par nageur" feature status to include "Vue nageur: ✅".

**Step 3: Commit**

```bash
git add docs/implementation-log.md docs/FEATURES_STATUS.md CLAUDE.md
git commit -m "docs: update §90 with phase 2 — Mon plan tab"
```

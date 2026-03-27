# Planification muscu par nageur — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre au coach d'organiser des séances de musculation dans des dossiers hiérarchiques par nageur (nageur → cycles → séances), avec copie inter-nageurs.

**Architecture:** Enrichir la table `strength_folders` existante avec `parent_id` (imbrication) et `athlete_id` (lien nageur). Adapter l'API CRUD existante et le catalogue coach pour supporter le filtrage par nageur et la navigation hiérarchique. Ajouter des fonctions de duplication (séance, dossier, plan complet).

**Tech Stack:** Supabase (PostgreSQL migration + RLS), React/TypeScript, Radix UI/Shadcn, React Query, API existante `src/lib/api/strength.ts`.

**Design doc:** `docs/plans/2026-03-27-strength-planning-per-athlete-design.md`

---

### Task 1: Migration DB — parent_id + athlete_id sur strength_folders

**Files:**
- Create: `supabase/migrations/00058_strength_folders_hierarchy.sql`

**Step 1: Write the migration**

```sql
-- Add hierarchy support to strength_folders
ALTER TABLE strength_folders
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES strength_folders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS athlete_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Index for fast lookups by athlete and parent
CREATE INDEX IF NOT EXISTS idx_strength_folders_athlete_id ON strength_folders(athlete_id);
CREATE INDEX IF NOT EXISTS idx_strength_folders_parent_id ON strength_folders(parent_id);
```

**Step 2: Apply migration locally**

Run: `npx supabase db push` or apply via Supabase dashboard.
Expected: Migration applies cleanly, existing folders untouched (new columns are NULL).

**Step 3: Commit**

```bash
git add supabase/migrations/00058_strength_folders_hierarchy.sql
git commit -m "feat: add parent_id + athlete_id to strength_folders for hierarchy"
```

---

### Task 2: Mettre à jour les types TypeScript

**Files:**
- Modify: `src/lib/api/types.ts:84-89` (StrengthFolder interface)

**Step 1: Update StrengthFolder interface**

Add `parent_id` and `athlete_id` to the existing interface at lines 84-89:

```typescript
export interface StrengthFolder {
  id: number;
  name: string;
  type: 'session' | 'exercise';
  sort_order: number;
  parent_id?: number | null;
  athlete_id?: number | null;
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (new optional fields don't break existing usages).

**Step 3: Commit**

```bash
git add src/lib/api/types.ts
git commit -m "feat: add parent_id + athlete_id to StrengthFolder type"
```

---

### Task 3: Adapter l'API CRUD des dossiers

**Files:**
- Modify: `src/lib/api/strength.ts:1064-1113` (folder CRUD functions)
- Modify: `src/lib/api/index.ts` (re-exports)

**Step 1: Update `getStrengthFolders` (line 1064)**

Add optional filters for `athlete_id` and `parent_id`. Return the new fields in mapping.

```typescript
export async function getStrengthFolders(
  type: 'session' | 'exercise',
  opts?: { athleteId?: number | null; parentId?: number | null },
): Promise<StrengthFolder[]> {
  if (canUseSupabase()) {
    let query = supabase
      .from("strength_folders")
      .select("*")
      .eq("type", type)
      .order("sort_order", { ascending: true });

    if (opts?.athleteId !== undefined) {
      if (opts.athleteId === null) {
        query = query.is("athlete_id", null).is("parent_id", null);
      } else {
        // Fetch root folder for this athlete + all its children
        const { data: rootFolders } = await supabase
          .from("strength_folders")
          .select("id")
          .eq("type", type)
          .eq("athlete_id", opts.athleteId);
        const rootIds = (rootFolders ?? []).map((f: any) => f.id);
        if (rootIds.length === 0) return [];
        const { data, error } = await supabase
          .from("strength_folders")
          .select("*")
          .eq("type", type)
          .or(`id.in.(${rootIds.join(",")}),parent_id.in.(${rootIds.join(",")})`)
          .order("sort_order", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []).map(mapFolder);
      }
    }
    if (opts?.parentId !== undefined) {
      query = opts.parentId === null
        ? query.is("parent_id", null)
        : query.eq("parent_id", opts.parentId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapFolder);
  }
  return [];
}

function mapFolder(row: any): StrengthFolder {
  return {
    id: safeInt(row.id),
    name: String(row.name || ""),
    type: row.type as 'session' | 'exercise',
    sort_order: safeInt(row.sort_order),
    parent_id: row.parent_id != null ? safeInt(row.parent_id) : null,
    athlete_id: row.athlete_id != null ? safeInt(row.athlete_id) : null,
  };
}
```

**Step 2: Update `createStrengthFolder` (line 1082)**

Accept optional `parent_id` and `athlete_id`:

```typescript
export async function createStrengthFolder(
  name: string,
  type: 'session' | 'exercise',
  opts?: { parentId?: number | null; athleteId?: number | null },
): Promise<StrengthFolder> {
  if (!canUseSupabase()) throw new Error("Supabase requis");
  const { data, error } = await supabase
    .from("strength_folders")
    .insert({
      name,
      type,
      parent_id: opts?.parentId ?? null,
      athlete_id: opts?.athleteId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapFolder(data);
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/api/strength.ts
git commit -m "feat: support parent_id + athlete_id in folder CRUD"
```

---

### Task 4: API de duplication

**Files:**
- Modify: `src/lib/api/strength.ts` (add 3 functions at end of file)
- Modify: `src/lib/api/index.ts` (re-export new functions)

**Step 1: Add `duplicateStrengthSession`**

Appended after `moveToFolder` function (~line 1113):

```typescript
export async function duplicateStrengthSession(
  sessionId: number,
  targetFolderId: number | null,
): Promise<number> {
  if (!canUseSupabase()) throw new Error("Supabase requis");

  // 1. Read source session
  const { data: src, error: srcErr } = await supabase
    .from("strength_sessions")
    .select("name, description, folder_id")
    .eq("id", sessionId)
    .single();
  if (srcErr || !src) throw new Error(srcErr?.message ?? "Session introuvable");

  // 2. Read source items
  const { data: items, error: itemsErr } = await supabase
    .from("strength_session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("ordre", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  // 3. Create copy
  const { data: copy, error: copyErr } = await supabase
    .from("strength_sessions")
    .insert({
      name: src.name,
      description: src.description,
      folder_id: targetFolderId,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .select("id")
    .single();
  if (copyErr || !copy) throw new Error(copyErr?.message ?? "Erreur création copie");

  // 4. Copy items
  if (items && items.length > 0) {
    const newItems = items.map((item: any) => ({
      session_id: copy.id,
      ordre: item.ordre,
      exercise_id: item.exercise_id,
      block: item.block,
      cycle_type: item.cycle_type,
      sets: item.sets,
      reps: item.reps,
      pct_1rm: item.pct_1rm,
      rest_series_s: item.rest_series_s,
      rest_exercise_s: item.rest_exercise_s,
      notes: item.notes,
      raw_payload: item.raw_payload,
    }));
    const { error: insertErr } = await supabase
      .from("strength_session_items")
      .insert(newItems);
    if (insertErr) throw new Error(insertErr.message);
  }

  return copy.id;
}
```

**Step 2: Add `duplicateFolder`**

```typescript
export async function duplicateFolder(
  folderId: number,
  targetAthleteId: number | null,
  targetParentId: number | null,
): Promise<number> {
  if (!canUseSupabase()) throw new Error("Supabase requis");

  // 1. Read source folder
  const { data: src, error: srcErr } = await supabase
    .from("strength_folders")
    .select("name, type")
    .eq("id", folderId)
    .single();
  if (srcErr || !src) throw new Error(srcErr?.message ?? "Dossier introuvable");

  // 2. Create copy folder
  const copy = await createStrengthFolder(src.name, src.type, {
    parentId: targetParentId,
    athleteId: targetAthleteId,
  });

  // 3. Copy all sessions in this folder
  const { data: sessions } = await supabase
    .from("strength_sessions")
    .select("id")
    .eq("folder_id", folderId);
  for (const session of sessions ?? []) {
    await duplicateStrengthSession(session.id, copy.id);
  }

  // 4. Copy sub-folders recursively
  const { data: subFolders } = await supabase
    .from("strength_folders")
    .select("id")
    .eq("parent_id", folderId);
  for (const sub of subFolders ?? []) {
    await duplicateFolder(sub.id, null, copy.id);
  }

  return copy.id;
}
```

**Step 3: Add `duplicateAthletePlan`**

```typescript
export async function duplicateAthletePlan(
  sourceAthleteId: number,
  targetAthleteId: number,
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase requis");

  // Find all root folders for source athlete (type='session')
  const { data: roots } = await supabase
    .from("strength_folders")
    .select("id")
    .eq("athlete_id", sourceAthleteId)
    .eq("type", "session");

  for (const root of roots ?? []) {
    // Duplicate entire tree under a new root for target athlete
    await duplicateFolder(root.id, targetAthleteId, null);
  }
}
```

**Step 4: Re-export in `src/lib/api/index.ts`**

Add to the strength re-export block (~line 317):

```typescript
  duplicateStrengthSession,
  duplicateFolder,
  duplicateAthletePlan,
```

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/api/strength.ts src/lib/api/index.ts
git commit -m "feat: add duplicate functions for sessions, folders, and athlete plans"
```

---

### Task 5: UI Coach — Filtre par nageur dans le catalogue

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx` (top filter + query adaptation)

**Step 1: Add athlete selector state and query**

In the component, add state for the selected athlete and fetch the athletes list. Near the top of the component (after existing state declarations):

```typescript
const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(null);

const { data: athletes = [] } = useQuery({
  queryKey: ["athletes"],
  queryFn: () => api.getAthletes(),
});
```

**Step 2: Update folder queries to filter by athlete**

Replace the existing `sessionFolders` query (~line 351) to pass athlete filter:

```typescript
const { data: sessionFolders = [] } = useQuery({
  queryKey: ["strength_folders", "session", selectedAthleteId],
  queryFn: () =>
    api.getStrengthFolders("session", {
      athleteId: selectedAthleteId,
    }),
});
```

**Step 3: Add athlete Select UI**

Above the existing tab content, add a Select component. Use Shadcn `Select`:

```tsx
<div className="flex items-center gap-2 mb-4">
  <Select
    value={selectedAthleteId === null ? "__common__" : String(selectedAthleteId)}
    onValueChange={(v) =>
      setSelectedAthleteId(v === "__common__" ? null : Number(v))
    }
  >
    <SelectTrigger className="w-[220px]">
      <SelectValue placeholder="Bibliothèque commune" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__common__">Bibliothèque commune</SelectItem>
      {athletes.map((a) => (
        <SelectItem key={a.id ?? a.display_name} value={String(a.id)}>
          {a.display_name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

**Step 4: Filter sessions by selected athlete's folders**

When `selectedAthleteId` is set, only show sessions belonging to folders of that athlete. Adapt the `sessionsByFolder` logic (~line 381):

```typescript
const visibleFolderIds = new Set(sessionFolders.map((f) => f.id));
const visibleSessions = selectedAthleteId !== null
  ? filteredSessions.filter((s) => s.folder_id && visibleFolderIds.has(s.folder_id))
  : filteredSessions;
```

**Step 5: Run dev server and verify**

Run: `npm run dev`
Expected: Catalogue shows athlete selector. "Bibliothèque commune" shows existing view. Selecting an athlete shows only their folders (empty for now).

**Step 6: Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "feat: add athlete filter to strength catalog"
```

---

### Task 6: UI Coach — Dossiers hiérarchiques (2 niveaux)

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx` (nested folder rendering)
- Modify: `src/components/coach/strength/FolderSection.tsx` (support nesting)

**Step 1: Separate root folders and sub-folders**

In StrengthCatalog, compute the hierarchy from the flat folder list:

```typescript
const rootFolders = sessionFolders.filter((f) => !f.parent_id);
const subFoldersMap = new Map<number, StrengthFolder[]>();
for (const f of sessionFolders) {
  if (f.parent_id) {
    const arr = subFoldersMap.get(f.parent_id) ?? [];
    arr.push(f);
    subFoldersMap.set(f.parent_id, arr);
  }
}
```

**Step 2: Render nested FolderSections**

For each root folder, render its sub-folders as nested `FolderSection` inside the parent:

```tsx
{rootFolders.map((root) => (
  <FolderSection
    key={root.id}
    name={root.name}
    count={subFoldersMap.get(root.id)?.length ?? 0}
    onRename={(n) => renameFolder.mutate({ id: root.id, name: n })}
    onDelete={() => deleteFolderMut.mutate(root.id)}
    defaultOpen={true}
  >
    {(subFoldersMap.get(root.id) ?? []).map((sub) => {
      const subSessions = sessionsByFolder.get(sub.id) ?? [];
      return (
        <FolderSection
          key={sub.id}
          name={sub.name}
          count={subSessions.length}
          onRename={(n) => renameFolder.mutate({ id: sub.id, name: n })}
          onDelete={() => deleteFolderMut.mutate(sub.id)}
        >
          {subSessions.map((s) => (
            <SessionListView key={s.id} session={s} /* ...existing props */ />
          ))}
        </FolderSection>
      );
    })}
  </FolderSection>
))}
```

**Step 3: Add "Créer un plan" button when athlete is selected**

When `selectedAthleteId` is set and no root folder exists for that athlete:

```tsx
{selectedAthleteId !== null && rootFolders.length === 0 && (
  <Button
    variant="outline"
    onClick={() => {
      createFolder.mutate(
        { name: athletes.find((a) => a.id === selectedAthleteId)?.display_name ?? "Plan", type: "session", athleteId: selectedAthleteId },
      );
    }}
  >
    <Plus className="h-4 w-4 mr-2" />
    Créer un plan
  </Button>
)}
```

**Step 4: Add "Ajouter un cycle" button inside root folder**

Inside each root folder's children, add a button to create a sub-folder:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() =>
    createFolder.mutate({ name: "Nouveau cycle", type: "session", parentId: root.id })
  }
>
  <Plus className="h-4 w-4 mr-2" />
  Ajouter un cycle
</Button>
```

**Step 5: Update `createFolder` mutation to pass new params**

Adapt the mutation (~line 476) to accept the new fields:

```typescript
const createFolder = useMutation({
  mutationFn: (args: { name: string; type: 'session' | 'exercise'; parentId?: number; athleteId?: number }) =>
    api.createStrengthFolder(args.name, args.type, {
      parentId: args.parentId ?? null,
      athleteId: args.athleteId ?? null,
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
  },
});
```

**Step 6: Run type check + dev server**

Run: `npx tsc --noEmit && npm run dev`
Expected: When athlete selected, "Créer un plan" button visible. After creation, root folder appears with "Ajouter un cycle" button. Cycles show nested inside.

**Step 7: Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx src/components/coach/strength/FolderSection.tsx
git commit -m "feat: hierarchical folders with athlete root + cycle sub-folders"
```

---

### Task 7: UI Coach — Copie inter-nageurs

**Files:**
- Create: `src/components/coach/strength/CopyToAthleteDialog.tsx`
- Modify: `src/pages/coach/StrengthCatalog.tsx` (add copy actions to menus)

**Step 1: Create CopyToAthleteDialog component**

Dialog with: athlete selector → folder selector (optional) → confirm button.

```tsx
// src/components/coach/strength/CopyToAthleteDialog.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AthleteSummary, StrengthFolder } from "@/lib/api/types";

interface CopyToAthleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athletes: AthleteSummary[];
  mode: "session" | "folder" | "plan";
  sourceLabel: string;
  onConfirm: (targetAthleteId: number) => void;
}

export function CopyToAthleteDialog({
  open, onOpenChange, athletes, mode, sourceLabel, onConfirm,
}: CopyToAthleteDialogProps) {
  const [targetAthleteId, setTargetAthleteId] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "plan" ? "Copier le plan complet" : mode === "folder" ? "Copier le cycle" : "Copier la séance"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Copier <strong>{sourceLabel}</strong> vers un autre nageur
        </p>
        <Select onValueChange={(v) => setTargetAthleteId(Number(v))}>
          <SelectTrigger><SelectValue placeholder="Choisir un nageur" /></SelectTrigger>
          <SelectContent>
            {athletes.filter((a) => a.id != null).map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>{a.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="mt-4 w-full"
          disabled={targetAthleteId === null}
          onClick={() => {
            if (targetAthleteId !== null) {
              onConfirm(targetAthleteId);
              onOpenChange(false);
            }
          }}
        >
          Copier
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Integrate copy actions in StrengthCatalog**

Add copy menu items in `FolderSection` context menus and session row menus. State for the dialog:

```typescript
const [copyDialog, setCopyDialog] = useState<{
  mode: "session" | "folder" | "plan";
  sourceId: number;
  sourceLabel: string;
} | null>(null);
```

On confirm handler:

```typescript
async function handleCopy(targetAthleteId: number) {
  if (!copyDialog) return;
  if (copyDialog.mode === "session") {
    // Find or create root folder for target athlete, then duplicate session into it
    const targetFolders = await api.getStrengthFolders("session", { athleteId: targetAthleteId });
    const rootFolder = targetFolders.find((f) => f.athlete_id === targetAthleteId);
    let targetFolderId: number | null = null;
    if (rootFolder) {
      // Put in first sub-folder, or root
      const subs = targetFolders.filter((f) => f.parent_id === rootFolder.id);
      targetFolderId = subs[0]?.id ?? rootFolder.id;
    }
    await api.duplicateStrengthSession(copyDialog.sourceId, targetFolderId);
  } else if (copyDialog.mode === "folder") {
    await api.duplicateFolder(copyDialog.sourceId, targetAthleteId, null);
  } else {
    await api.duplicateAthletePlan(copyDialog.sourceId, targetAthleteId);
  }
  queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
  queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
  toast.success("Copie effectuée");
}
```

**Step 3: Add "Copier vers..." in context menus**

In session row menu: `"Copier vers…"` → opens dialog with mode="session".
In sub-folder menu: `"Copier vers…"` → opens dialog with mode="folder".
In root folder menu: `"Copier le plan vers…"` → opens dialog with mode="plan", sourceId = athlete_id.

**Step 4: Run type check + dev server**

Run: `npx tsc --noEmit && npm run dev`
Expected: Context menus show "Copier vers…". Dialog opens, athlete selectable, copy creates independent duplicates.

**Step 5: Commit**

```bash
git add src/components/coach/strength/CopyToAthleteDialog.tsx src/pages/coach/StrengthCatalog.tsx
git commit -m "feat: copy sessions, folders, and full plans between athletes"
```

---

### Task 8: UI Coach — Assignation rapide depuis dossier nageur

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx` (add assign button per session in athlete folders)

**Step 1: Add quick assign button**

When `selectedAthleteId` is set, each session row in an athlete folder shows an "Assigner" button with a date picker:

```tsx
{selectedAthleteId && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => {
      // Open date picker or assign for today
      assignSession({ sessionId: s.id, athleteId: selectedAthleteId });
    }}
  >
    <CalendarPlus className="h-4 w-4" />
  </Button>
)}
```

Use existing `api.assignments_create()` to create the assignment with `assignment_type: "strength"`, `strength_session_id`, `target_user_id`, `scheduled_date`.

**Step 2: Run dev server and verify**

Run: `npm run dev`
Expected: Assign button visible on sessions in athlete folders. Click assigns for today (or opens date picker).

**Step 3: Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "feat: quick assign from athlete folder sessions"
```

---

### Task 9: Tests

**Files:**
- Create: `src/pages/coach/__tests__/StrengthFoldersHierarchy.test.ts`

**Step 1: Write tests for folder hierarchy logic**

Test the key behaviors:
- `mapFolder` returns correct structure with parent_id/athlete_id
- Root/sub-folder separation logic
- `duplicateStrengthSession` creates independent copy (mock Supabase)
- `duplicateFolder` copies folder + sessions recursively

**Step 2: Run tests**

Run: `npm test -- --run src/pages/coach/__tests__/StrengthFoldersHierarchy.test.ts`
Expected: PASS.

**Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: No regressions (pre-existing failures excluded).

**Step 4: Commit**

```bash
git add src/pages/coach/__tests__/StrengthFoldersHierarchy.test.ts
git commit -m "test: add tests for strength folder hierarchy and duplication"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/implementation-log.md` (add entry)
- Modify: `docs/ROADMAP.md` (add chantier)
- Modify: `docs/FEATURES_STATUS.md` (update status)
- Modify: `CLAUDE.md` (if needed)

**Step 1: Add implementation log entry**

Add a new section (§90 or next available) documenting:
- Context: planification muscu par nageur
- Changes: migration, API, UI catalog, copie inter-nageurs
- Files modified
- Decisions: approach B, manual charges, phase 2 for athlete view

**Step 2: Update ROADMAP + FEATURES_STATUS**

Mark new chantier as "En cours" or "Fait".

**Step 3: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md CLAUDE.md
git commit -m "docs: add §90 strength planning per athlete to implementation log"
```

---

### Phase 2 (futur) — Vue nageur "Mon plan"

Non implémenté dans ce plan. Notes pour la session future :

**Files à créer/modifier :**
- `src/components/strength/MyPlanTab.tsx` — nouvel onglet
- `src/pages/Strength.tsx` — ajouter l'onglet

**Comportement :**
- Fetch `getStrengthFolders("session", { athleteId: currentUserId })`
- Afficher arborescence en lecture seule (cycles → séances)
- Bouton "Démarrer" sur chaque séance → même flow que `startStrengthRun`
- Badge cycle courant (optionnel)

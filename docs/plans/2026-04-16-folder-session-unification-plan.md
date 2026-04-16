# FolderCard + SessionRow Unification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify folder and session row rendering between swimmer and coach views using shared components with composition slots.

**Architecture:** Two shared components (`FolderCard`, `SessionRow`) replace three divergent implementations. `FolderCard` uses Radix Collapsible with swimmer styling as reference. `SessionRow` is a pure presentational row with `trailing` slot for role-specific actions. Quick wins (radius, spacing, empty states) are applied during migration.

**Tech Stack:** React 19, Radix UI (Collapsible, DropdownMenu), Tailwind CSS 4, Lucide icons, Shadcn `ui/empty.tsx`

**Design doc:** `docs/plans/2026-04-16-folder-session-unification-design.md`

---

### Task 1: Create `<FolderCard>` shared component

**Files:**
- Create: `src/components/shared/FolderCard.tsx`

**Step 1: Create FolderCard component**

```tsx
import { useState, type ReactNode } from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FolderCardProps {
  name: string;
  icon?: LucideIcon;
  count: number;
  defaultOpen?: boolean;
  variant?: "root" | "nested";
  actions?: ReactNode;
  children: ReactNode;
}

export function FolderCard({
  name,
  icon: Icon = FolderOpen,
  count,
  defaultOpen = false,
  variant = "root",
  actions,
  children,
}: FolderCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isRoot = variant === "root";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2.5 w-full text-left transition-colors",
          isRoot
            ? "rounded-xl border bg-card px-3 py-2.5 hover:bg-accent/50"
            : "px-1 pt-1.5 pb-0.5"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isRoot ? "text-muted-foreground" : "text-muted-foreground/70")} />
        <span className={cn(
          "flex-1 truncate",
          isRoot ? "text-[13px] font-semibold" : "text-[11px] font-semibold text-muted-foreground/70"
        )}>
          {name}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{count}</span>
        {actions && (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn(isRoot ? "pl-3 pt-1 space-y-1" : "pl-2 pt-0.5 space-y-1")}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Step 2: Verify build**

Run: `cd /Users/francoiswagner/Antigravity/Project-EAC/competition && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to FolderCard

**Step 3: Commit**

```bash
git add src/components/shared/FolderCard.tsx
git commit -m "feat(§124): add shared FolderCard component (Radix Collapsible)"
```

---

### Task 2: Create `<SessionRow>` shared component

**Files:**
- Create: `src/components/shared/SessionRow.tsx`

**Step 1: Create SessionRow component**

```tsx
import { type ReactNode } from "react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SessionRowProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function SessionRow({
  icon: Icon = Dumbbell,
  title,
  subtitle,
  badge,
  trailing,
  onClick,
  className,
}: SessionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-accent/50 transition-colors",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium truncate">{title}</span>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground tabular-nums truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {trailing ?? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 shrink-0" />
      )}
    </button>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to SessionRow

**Step 3: Commit**

```bash
git add src/components/shared/SessionRow.tsx
git commit -m "feat(§124): add shared SessionRow component"
```

---

### Task 3: Migrate swimmer `CommonFolderList` → `FolderCard` + `SessionRow`

**Files:**
- Modify: `src/components/strength/SessionBrowser.tsx` (lines 10, 280-286)
- Delete: `src/components/strength/CommonFolderList.tsx`

**Step 1: Update SessionBrowser imports and usage**

In `SessionBrowser.tsx`:
1. Replace import `CommonFolderList` with `FolderCard` and `SessionRow`:
   ```tsx
   import { FolderCard } from "@/components/shared/FolderCard";
   import { SessionRow } from "@/components/shared/SessionRow";
   ```
2. Replace `<CommonFolderList>` block (lines 280-286) with inline rendering using `FolderCard` + `SessionRow`.

The replacement needs the same folder logic that was inside `CommonFolderList`. Extract the folder resolution logic into the component:

```tsx
{/* ── Global folders (hidden during search) ── */}
{!isSearching && allGlobalFolders.length > 0 && (
  <FolderListSection
    folders={allGlobalFolders}
    allSessions={strengthCatalog ?? []}
    onStartCatalog={onStartCatalog}
  />
)}
```

Create a local `FolderListSection` component in the same file (replacing the external `CommonFolderList`):

```tsx
function FolderListSection({
  folders,
  allSessions,
  onStartCatalog,
}: {
  folders: StrengthFolder[];
  allSessions: StrengthSessionTemplate[];
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}) {
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
        return (
          <FolderCard key={root.id} name={root.name} count={allFolderSessions.length}>
            {directSessions.map((s) => (
              <SessionRow
                key={s.id}
                title={s.title ?? s.name ?? "Sans titre"}
                subtitle={`${s.items?.length ?? 0} ex.`}
                onClick={() => onStartCatalog(s)}
              />
            ))}
            {subs.map((sub) => {
              const sessions = sessionsByFolder.get(sub.id) ?? [];
              if (sessions.length === 0) return null;
              return (
                <FolderCard key={sub.id} variant="nested" name={sub.name} count={sessions.length}>
                  {sessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      title={s.title ?? s.name ?? "Sans titre"}
                      subtitle={`${s.items?.length ?? 0} ex.`}
                      onClick={() => onStartCatalog(s)}
                    />
                  ))}
                </FolderCard>
              );
            })}
          </FolderCard>
        );
      })}
    </div>
  );
}
```

Also add import for `StrengthFolder` from `@/lib/api` if not already imported.

**Step 2: Delete CommonFolderList.tsx**

```bash
rm src/components/strength/CommonFolderList.tsx
```

**Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 4: Verify dev server**

Run: `npm run dev` and test the swimmer strength page — verify folders expand/collapse, sub-folders render, session rows are clickable.

**Step 5: Commit**

```bash
git add -A src/components/strength/SessionBrowser.tsx src/components/strength/CommonFolderList.tsx
git commit -m "refactor(§124): migrate swimmer folders to shared FolderCard + SessionRow"
```

---

### Task 4: Migrate swimmer `UnfiledSessionList` → use `SessionRow`

**Files:**
- Modify: `src/components/strength/UnfiledSessionList.tsx`

**Step 1: Refactor UnfiledSessionList to use SessionRow**

Keep the `motion.div` wrapper and `DisplaySession` export. Replace the internal button with `SessionRow`:

```tsx
import { StrengthSessionTemplate, Assignment } from "@/lib/api";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { staggerChildren } from "@/lib/animations";
import { SessionRow } from "@/components/shared/SessionRow";

export interface DisplaySession {
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
        const subtitle = [
          `${session.exerciseCount} ex.`,
          isAssignment && session.assignedDate
            ? format(new Date(session.assignedDate), "dd MMM", { locale: fr })
            : null,
          !isAssignment && session.description ? session.description : null,
        ].filter(Boolean).join(" · ");

        return (
          <motion.div key={session.key} variants={cardVariant}>
            <SessionRow
              title={session.title}
              subtitle={subtitle}
              badge={
                isAssignment ? (
                  <span className="shrink-0 inline-flex items-center rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">
                    Coach
                  </span>
                ) : undefined
              }
              onClick={() => {
                if (isAssignment && session.assignment) {
                  onStartAssignment(session.assignment);
                } else {
                  onStartCatalog(session.session);
                }
              }}
              className={cn(
                "rounded-xl border bg-card active:scale-[0.98]",
                isAssignment ? "border-primary/20 hover:border-primary/40" : "hover:border-primary/30",
              )}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}
```

Note: the unfiled sessions have a richer card style (border, bg-card, scale effect) compared to rows inside folders. This is intentional — unfiled sessions are top-level items.

**Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Verify dev server**

Check swimmer strength page — unfiled sessions still show with badge "Coach", date, description, click still works.

**Step 4: Commit**

```bash
git add src/components/strength/UnfiledSessionList.tsx
git commit -m "refactor(§124): migrate UnfiledSessionList to use shared SessionRow"
```

---

### Task 5: Migrate coach `StrengthCatalog` folders → `FolderCard` + `SessionRow`

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx` (lines 31, 1272-1308, 1352-1374)

This is the largest task. Replace both session folder and exercise folder sections.

**Step 1: Update imports**

In `StrengthCatalog.tsx`:
- Remove: `import { FolderSection } from "@/components/coach/strength/FolderSection";`
- Add: `import { FolderCard } from "@/components/shared/FolderCard";`
- Add: `import { SessionRow } from "@/components/shared/SessionRow";`
- Keep existing `DropdownMenu` imports (already present from `SessionListView` usage)

**Step 2: Create a local `FolderDropdown` helper**

Add near the top of the component or as a local function:

```tsx
function FolderDropdown({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Actions dossier"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="h-4 w-4" />
          Renommer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Also need a local rename state handler since `FolderSection` managed its own inline editing. For simplicity, use `window.prompt` initially (same UX as many admin tools), or keep inline editing in a wrapper. Recommended: use `window.prompt` — the inline editing in `FolderSection` was ad-hoc and fragile (blur conflicts). If user wants inline later, that's a separate task.

**Step 3: Replace session folders (lines 1272-1308)**

Replace:
```tsx
{sessionFolders.map((folder) => {
  const folderSessions = sessionsByFolder.get(folder.id) ?? [];
  return (
    <FolderSection ... >
      {folderSessions.length > 0 ? (
        <SessionListView ... />
      ) : (
        <div className="rounded-xl border border-dashed ...">Dossier vide</div>
      )}
    </FolderSection>
  );
})}
```

With:
```tsx
{sessionFolders.map((folder) => {
  const folderSessions = sessionsByFolder.get(folder.id) ?? [];
  return (
    <FolderCard
      key={folder.id}
      name={folder.name}
      count={folderSessions.length}
      actions={
        <FolderDropdown
          onRename={() => {
            const newName = window.prompt("Renommer le dossier", folder.name);
            if (newName?.trim() && newName.trim() !== folder.name) {
              renameFolder.mutate({ id: folder.id, name: newName.trim() });
            }
          }}
          onDelete={() => deleteFolderMut.mutate(folder.id)}
        />
      }
    >
      {folderSessions.length > 0 ? (
        folderSessions.map((session) => (
          <SessionRow
            key={session.id}
            title={session.title ?? "Sans titre"}
            subtitle={renderSessionSubtitle(session)}
            onClick={() => startEditSession(session)}
            trailing={
              <SessionActionsDropdown
                session={session}
                folders={sessionFolders}
                onEdit={startEditSession}
                onDelete={setPendingDeleteSession}
                onMove={(folderId) => moveItem.mutate({ itemId: session.id, folderId, table: "strength_sessions" })}
              />
            }
          />
        ))
      ) : (
        <Empty className="py-4 border-0">
          <EmptyHeader>
            <EmptyDescription>Dossier vide</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </FolderCard>
  );
})}
```

Need to:
1. Import `Empty, EmptyHeader, EmptyDescription` from `@/components/ui/empty`
2. Create a `renderSessionSubtitle` helper that extracts the metrics string from the existing `renderSessionMetrics` render prop
3. Create a `SessionActionsDropdown` local component that provides the edit/delete/move dropdown for coach session rows

**`SessionActionsDropdown`:**
```tsx
function SessionActionsDropdown({
  session,
  folders,
  onEdit,
  onDelete,
  onMove,
}: {
  session: StrengthSessionTemplate;
  folders: StrengthFolder[];
  onEdit: (s: StrengthSessionTemplate) => void;
  onDelete: (s: StrengthSessionTemplate) => void;
  onMove: (folderId: number | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Actions"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onEdit(session)}>
          <Pencil className="h-4 w-4" />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove(null)}>
          <FolderInput className="h-4 w-4" />
          Déplacer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(session)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 4: Replace exercise folders (lines 1352-1374)**

Same pattern — replace `FolderSection` with `FolderCard` + `FolderDropdown`. Exercise rows keep using existing `renderExerciseRow` inside a `<div className="space-y-1">`.

```tsx
{exerciseFolders?.map((folder) => {
  const folderExercises = exercisesByFolder.get(folder.id) ?? [];
  return (
    <FolderCard
      key={folder.id}
      name={folder.name}
      count={folderExercises.length}
      actions={
        <FolderDropdown
          onRename={() => {
            const newName = window.prompt("Renommer le dossier", folder.name);
            if (newName?.trim() && newName.trim() !== folder.name) {
              renameFolder.mutate({ id: folder.id, name: newName.trim() });
            }
          }}
          onDelete={() => deleteFolderMut.mutate(folder.id)}
        />
      }
    >
      {folderExercises.length > 0 ? (
        <div className="space-y-1">
          {folderExercises.map(renderExerciseRow)}
        </div>
      ) : (
        <Empty className="py-4 border-0">
          <EmptyHeader>
            <EmptyDescription>Dossier vide</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </FolderCard>
  );
})}
```

**Step 5: Delete FolderSection.tsx**

```bash
rm src/components/coach/strength/FolderSection.tsx
```

**Step 6: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 7: Verify dev server**

Test coach strength catalog:
- Session folders expand/collapse with animation
- Folder dropdown works (rename via prompt, delete)
- Session rows inside folders clickable (opens editor)
- Session actions dropdown works (edit, move, delete)
- Exercise folders same behavior
- Empty folder shows "Dossier vide" via Empty component

**Step 8: Commit**

```bash
git add -A src/pages/coach/StrengthCatalog.tsx src/components/coach/strength/FolderSection.tsx
git commit -m "refactor(§124): migrate coach folders to shared FolderCard + SessionRow, delete FolderSection"
```

---

### Task 6: Quick wins — empty state in SessionBrowser

**Files:**
- Modify: `src/components/strength/SessionBrowser.tsx` (lines 297-305)

**Step 1: Replace inline empty state**

Replace:
```tsx
<div className="flex flex-col items-center justify-center py-14 text-center">
  <Dumbbell className="h-8 w-8 mb-3 text-muted-foreground/25" />
  <p className="text-sm font-medium text-muted-foreground">Aucune séance trouvée</p>
  <p className="text-[11px] text-muted-foreground/50 mt-1 max-w-[220px]">
    Changez de cycle ou modifiez votre recherche.
  </p>
</div>
```

With:
```tsx
<Empty className="py-14 border-0">
  <EmptyHeader>
    <EmptyMedia><Dumbbell className="h-8 w-8 text-muted-foreground/25" /></EmptyMedia>
    <EmptyTitle className="text-sm">Aucune séance trouvée</EmptyTitle>
    <EmptyDescription className="text-[11px]">Changez de cycle ou modifiez votre recherche.</EmptyDescription>
  </EmptyHeader>
</Empty>
```

Add imports: `import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";`

**Step 2: Verify build + visual**

Run: `npx tsc --noEmit 2>&1 | head -20`
Check swimmer strength page with a search that returns no results.

**Step 3: Commit**

```bash
git add src/components/strength/SessionBrowser.tsx
git commit -m "refactor(§124): use shared Empty component for swimmer search empty state"
```

---

### Task 7: Quick wins — empty state in coach SessionListView

**Files:**
- Modify: `src/components/coach/shared/SessionListView.tsx` (line 88-93)

**Step 1: Replace inline empty state**

Replace:
```tsx
<div className="rounded-2xl border border-dashed border-border bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
  Aucune séance trouvée.
</div>
```

With:
```tsx
<Empty className="py-6 border-0 bg-muted rounded-xl">
  <EmptyHeader>
    <EmptyDescription>Aucune séance trouvée.</EmptyDescription>
  </EmptyHeader>
</Empty>
```

Also fix skeleton `rounded-2xl` → `rounded-xl` at line 62.
Also fix Card `rounded-2xl` → `rounded-xl` at line 104.

Add imports: `import { Empty, EmptyHeader, EmptyDescription } from "@/components/ui/empty";`

**Step 2: Verify build + visual**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/coach/shared/SessionListView.tsx
git commit -m "refactor(§124): unify radius to rounded-xl + shared Empty in SessionListView"
```

---

### Task 8: Type check + full test pass

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: Clean (or only pre-existing errors in stories/tests)

**Step 2: Run tests**

Run: `npm test -- --run`
Expected: All pass (or only pre-existing failures in TimesheetHelpers)

**Step 3: Final visual inspection**

Start dev server, check:
- [ ] Swimmer strength: folders expand/collapse, sub-folders, session rows, unfiled list, empty search
- [ ] Coach strength catalog: session folders, exercise folders, dropdown menus, rename, delete, empty folders
- [ ] No broken imports or console errors

**Step 4: Commit if any fixes needed**

---

### Task 9: Documentation update

**Files:**
- Modify: `CLAUDE.md` (fichiers clés + chantier)
- Modify: `docs/implementation-log.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/FEATURES_STATUS.md`

Follow the standard documentation workflow from CLAUDE.md:
1. Add entry §124 in `implementation-log.md`
2. Add chantier 88 in CLAUDE.md table
3. Update ROADMAP.md
4. Update FEATURES_STATUS.md
5. Update fichiers clés: add `FolderCard.tsx` and `SessionRow.tsx`, remove `CommonFolderList.tsx` and `FolderSection.tsx`

**Commit:**
```bash
git add CLAUDE.md docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md
git commit -m "docs(§124): log unification FolderCard + SessionRow"
```

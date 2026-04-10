# Swim Planning Demo — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a demo swim planning page for coaches with a scroll-infinite weekly timeline (macro view) and expandable day×slot grids (micro view) where filières de travail can be assigned.

**Architecture:** Single page `SwimPlanningDemo.tsx` with vertical timeline (MyPlanTab style). Weeks auto-generated from current week + scroll infinite. Each week expands inline to reveal a 6-day × 2-slot (matin/soir) grid. Filières stored in `swim_planning_slots` table, week meta in existing `training_weeks`. Access via `/#/coach/swim-planning` + button on CoachHome.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Radix UI/Shadcn, React Query 5, framer-motion, Supabase PostgreSQL

**Design doc:** `docs/plans/2026-04-10-swim-planning-demo-design.md`

---

### Task 1: Database migration — `swim_planning_slots` table

**Files:**
- Create: `supabase/migrations/00071_swim_planning_slots.sql`

**Step 1: Write the migration**

```sql
-- Swim planning slots: filières assigned to day/time_slot per week per group
CREATE TABLE IF NOT EXISTS swim_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 5),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);

-- RLS
ALTER TABLE swim_planning_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage swim planning slots"
  ON swim_planning_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role IN ('coach', 'admin')
    )
  );

CREATE POLICY "Athletes can view swim planning slots"
  ON swim_planning_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
    )
  );

-- Index for query pattern: fetch all slots for a group in a date range
CREATE INDEX idx_swim_planning_slots_group_week
  ON swim_planning_slots(group_id, week_start);
```

**Step 2: Apply migration locally**

Run: `npx supabase db push` (or via Supabase dashboard)
Expected: Table created successfully

**Step 3: Commit**

```bash
git add supabase/migrations/00071_swim_planning_slots.sql
git commit -m "feat(db): add swim_planning_slots table for swim planning demo"
```

---

### Task 2: Filières constants + types

**Files:**
- Create: `src/lib/swimFilieres.ts`
- Modify: `src/lib/api/types.ts` (append at end)

**Step 1: Create filières constants**

Create `src/lib/swimFilieres.ts`:

```ts
export interface Filiere {
  id: string;
  name: string;
  short: string;
  color: string; // Tailwind color name (sky, emerald, etc.)
}

export const FILIERES: Filiere[] = [
  { id: "entretien-aerobie",        name: "Entretien aérobie",           short: "Entretien",          color: "sky" },
  { id: "capacite-aerobie",         name: "Capacité aérobie",            short: "Cap. aéro.",         color: "emerald" },
  { id: "puissance-aerobie",        name: "Puissance aérobie",           short: "Puiss. aéro.",       color: "orange" },
  { id: "capacite-anaerobie-lact",  name: "Cap. anaérobie lactique",     short: "Cap. ana. lact.",    color: "red" },
  { id: "puissance-anaerobie-lact", name: "Puiss. anaérobie lactique",   short: "Puiss. ana. lact.",  color: "violet" },
  { id: "capacite-anaerobie-alact", name: "Cap. anaérobie alactique",    short: "Cap. ana. alact.",   color: "slate" },
  { id: "puissance-anaerobie-alact",name: "Puiss. anaérobie alactique",  short: "Puiss. ana. alact.", color: "zinc" },
  { id: "technique",                name: "Technique",                   short: "Technique",          color: "cyan" },
] as const;

export const FILIERE_MAP = new Map(FILIERES.map((f) => [f.id, f]));

/** Tailwind bg/text classes per filiere color */
export const FILIERE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  sky:     { bg: "bg-sky-100 dark:bg-sky-900/30",         text: "text-sky-700 dark:text-sky-300",         dot: "bg-sky-500" },
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  orange:  { bg: "bg-orange-100 dark:bg-orange-900/30",   text: "text-orange-700 dark:text-orange-300",   dot: "bg-orange-500" },
  red:     { bg: "bg-red-100 dark:bg-red-900/30",         text: "text-red-700 dark:text-red-300",         dot: "bg-red-500" },
  violet:  { bg: "bg-violet-100 dark:bg-violet-900/30",   text: "text-violet-700 dark:text-violet-300",   dot: "bg-violet-500" },
  slate:   { bg: "bg-slate-200 dark:bg-slate-800/50",     text: "text-slate-700 dark:text-slate-300",     dot: "bg-slate-500" },
  zinc:    { bg: "bg-zinc-200 dark:bg-zinc-800/50",       text: "text-zinc-700 dark:text-zinc-300",       dot: "bg-zinc-500" },
  cyan:    { bg: "bg-cyan-100 dark:bg-cyan-900/30",       text: "text-cyan-700 dark:text-cyan-300",       dot: "bg-cyan-500" },
};
```

**Step 2: Add TypeScript types**

Append to `src/lib/api/types.ts` (after line ~552, after `TrainingWeekInput`):

```ts
// ── Swim Planning Slots ──

export interface SwimPlanningSlot {
  id: string;
  group_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
  created_at?: string;
}

export interface SwimPlanningSlotInput {
  group_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
}
```

**Step 3: Commit**

```bash
git add src/lib/swimFilieres.ts src/lib/api/types.ts
git commit -m "feat: add swim filières constants and SwimPlanningSlot types"
```

---

### Task 3: API module — `swim-planning.ts`

**Files:**
- Create: `src/lib/api/swim-planning.ts`
- Modify: `src/lib/api/index.ts` (add re-export)
- Modify: `src/lib/api.ts` (add facade methods)

**Step 1: Create API module**

Create `src/lib/api/swim-planning.ts`:

```ts
/**
 * API Swim Planning — CRUD for swim_planning_slots
 */
import { supabase, canUseSupabase } from "./client";
import type { SwimPlanningSlot, SwimPlanningSlotInput } from "./types";

export async function getSwimPlanningSlots(opts: {
  groupId: number;
  weekStarts: string[]; // array of ISO date strings (Mondays)
}): Promise<SwimPlanningSlot[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const { data, error } = await supabase
    .from("swim_planning_slots")
    .select("*")
    .eq("group_id", opts.groupId)
    .in("week_start", opts.weekStarts)
    .order("week_start")
    .order("day_of_week")
    .order("time_slot");
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimPlanningSlot[];
}

export async function upsertSwimPlanningSlot(
  input: SwimPlanningSlotInput,
): Promise<SwimPlanningSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("swim_planning_slots")
    .upsert(input, { onConflict: "group_id,week_start,day_of_week,time_slot" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimPlanningSlot;
}

export async function deleteSwimPlanningSlot(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("swim_planning_slots")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

**Step 2: Add re-export in `src/lib/api/index.ts`**

Add after existing planning re-exports:

```ts
// Swim planning
export {
  getSwimPlanningSlots,
  upsertSwimPlanningSlot,
  deleteSwimPlanningSlot,
} from './swim-planning';
```

**Step 3: Add facade methods in `src/lib/api.ts`**

Add import (near line ~270, after planning imports):

```ts
import {
  getSwimPlanningSlots as _getSwimPlanningSlots,
  upsertSwimPlanningSlot as _upsertSwimPlanningSlot,
  deleteSwimPlanningSlot as _deleteSwimPlanningSlot,
} from "./api/swim-planning";
```

Add facade methods (near line ~760, after training week methods):

```ts
  // ── Swim Planning ──
  async getSwimPlanningSlots(opts: Parameters<typeof _getSwimPlanningSlots>[0]) { return _getSwimPlanningSlots(opts); },
  async upsertSwimPlanningSlot(input: Parameters<typeof _upsertSwimPlanningSlot>[0]) { return _upsertSwimPlanningSlot(input); },
  async deleteSwimPlanningSlot(id: string) { return _deleteSwimPlanningSlot(id); },
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/lib/api/swim-planning.ts src/lib/api/index.ts src/lib/api.ts
git commit -m "feat(api): add swim planning slots CRUD module"
```

---

### Task 4: Main page — `SwimPlanningDemo.tsx` (structure + macro view)

**Files:**
- Create: `src/pages/coach/SwimPlanningDemo.tsx`

**Step 1: Create the page with macro view (collapsed week cards)**

This is the main file. Use `/frontend-design` skill for the UI. The page must include:

1. **Header:** "Planification Natation" + badge "Demo" + group selector (if coach has multiple groups)
2. **Timeline vertical rail** (like MyPlanTab): `absolute left-[11px]` line + dots per week
3. **Week cards (collapsed):** Show week number (ISO), date range (lun–sam), badge type semaine, notes (1 line truncated), pencil icon. Tap = expand.
4. **Current week highlight:** `ring-2 ring-primary`
5. **Scroll infinite:** Start with current week + 12 weeks. Use `IntersectionObserver` to append 4 more when reaching bottom.
6. **Inline editing:** Tap pencil → inline form (Input for week_type with datalist, Textarea for notes). Uses existing `upsertTrainingWeek` via a demo cycle auto-created.

**Key helpers to include in the file:**

```ts
/** Get ISO week number */
function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/** Get Monday of a given date's week */
function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Generate N weeks starting from a Monday */
function generateWeeks(startMonday: Date, count: number): WeekData[] {
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(startMonday);
    monday.setDate(startMonday.getDate() + i * 7);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    return {
      monday,
      saturday,
      weekNumber: getISOWeekNumber(monday),
      weekKey: monday.toISOString().split("T")[0],
    };
  });
}
```

**Data flow:**
- `useQuery(["groups"])` → get coach's groups → default to first group
- `useQuery(["training-weeks", demoCycleId])` → week meta (type + notes)
- `useQuery(["swim-planning-slots", groupId, weekKeys])` → filières assigned
- Auto-create a "demo" training cycle for the group if none exists (name: "Planification nage")

**Step 2: Verify it renders**

Run: `npm run dev` → navigate to `/#/coach/swim-planning`
Expected: Timeline of week cards renders, current week highlighted

**Step 3: Commit**

```bash
git add src/pages/coach/SwimPlanningDemo.tsx
git commit -m "feat: add SwimPlanningDemo page with macro week timeline"
```

---

### Task 5: Micro view — expandable day×slot grid

**Files:**
- Modify: `src/pages/coach/SwimPlanningDemo.tsx`

**Step 1: Add the expandable grid component inside the page**

When a week card is tapped, it expands (framer-motion `AnimatePresence` + `motion.div` with `layout`) to reveal:

- 6 rows (Lun → Sam) with day label on the left
- 2 columns (Matin / Soir) headers
- Each cell: either a colored chip (filière assigned) or a `+` button
- Use `FILIERE_MAP` and `FILIERE_STYLES` from `swimFilieres.ts`

**Grid structure:**

```tsx
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: "auto", opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{ duration: 0.25, ease: "easeInOut" }}
  className="overflow-hidden"
>
  <div className="pt-3 pb-1">
    {/* Header row */}
    <div className="grid grid-cols-[48px_1fr_1fr] gap-1 mb-1">
      <div />
      <span className="text-[10px] font-bold text-center text-muted-foreground uppercase">Matin</span>
      <span className="text-[10px] font-bold text-center text-muted-foreground uppercase">Soir</span>
    </div>
    {/* Day rows */}
    {DAY_ROWS.map((day) => (
      <div key={day.index} className="grid grid-cols-[48px_1fr_1fr] gap-1 mb-1">
        <span className="text-xs font-medium text-muted-foreground self-center">{day.label}</span>
        <SlotCell weekStart={weekKey} dayOfWeek={day.index} timeSlot="morning" ... />
        <SlotCell weekStart={weekKey} dayOfWeek={day.index} timeSlot="evening" ... />
      </div>
    ))}
  </div>
</motion.div>
```

**`SlotCell` component:** Renders either:
- Empty: small dashed border button with `+`
- Filled: chip with filière short name + color from `FILIERE_STYLES`

**Step 2: Verify expand/collapse works**

Run: `npm run dev` → tap a week → grid expands with animation
Expected: 6×2 grid visible, `+` buttons in empty cells

**Step 3: Commit**

```bash
git add src/pages/coach/SwimPlanningDemo.tsx
git commit -m "feat: add expandable day×slot grid in swim planning"
```

---

### Task 6: Filière selection bottom sheet

**Files:**
- Modify: `src/pages/coach/SwimPlanningDemo.tsx`

**Step 1: Add bottom sheet for filière selection**

Use Shadcn `Sheet` (side="bottom") triggered by tapping `+` or an existing chip:

```tsx
<Sheet open={!!editingSlot} onOpenChange={() => setEditingSlot(null)}>
  <SheetContent side="bottom" className="max-h-[60vh]">
    <SheetHeader>
      <SheetTitle>Choisir une filière</SheetTitle>
    </SheetHeader>
    <div className="grid gap-2 py-4">
      {FILIERES.map((f) => {
        const style = FILIERE_STYLES[f.color];
        return (
          <button
            key={f.id}
            onClick={() => handleSelectFiliere(f.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
              style.bg, "hover:opacity-80"
            )}
          >
            <span className={cn("h-3 w-3 rounded-full shrink-0", style.dot)} />
            <span className={cn("text-sm font-medium", style.text)}>{f.name}</span>
          </button>
        );
      })}
      {/* Delete option if editing existing slot */}
      {editingSlot?.existing && (
        <button
          onClick={() => handleDeleteSlot(editingSlot.existing!.id)}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-destructive hover:bg-destructive/10 transition-colors mt-2 border-t pt-4"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-sm font-medium">Supprimer</span>
        </button>
      )}
    </div>
  </SheetContent>
</Sheet>
```

**Handlers:**
- `handleSelectFiliere(filiereId)`: calls `api.upsertSwimPlanningSlot(...)` then invalidates query
- `handleDeleteSlot(slotId)`: calls `api.deleteSwimPlanningSlot(id)` then invalidates query

**Step 2: Verify filière assignment works**

Run: `npm run dev` → expand a week → tap `+` → select filière → chip appears
Expected: Chip with correct color and label appears in the cell

**Step 3: Commit**

```bash
git add src/pages/coach/SwimPlanningDemo.tsx
git commit -m "feat: add filière selection bottom sheet with CRUD"
```

---

### Task 7: Route + CoachHome button

**Files:**
- Modify: `src/App.tsx` (~line 109 and ~line 286)
- Modify: `src/pages/Coach.tsx` (~line 165, quickAccess array)

**Step 1: Add lazy import and route in App.tsx**

After line 109 (`CoachSwimmerDetail`), add:

```ts
const SwimPlanningDemo = lazyWithRetry(() => import("@/pages/coach/SwimPlanningDemo"));
```

After line 286 (`/coach/swimmer/:id` route), add:

```tsx
<Route path="/coach/swim-planning" component={SwimPlanningDemo} />
```

**Step 2: Add button on CoachHome**

In `src/pages/Coach.tsx`, in the `quickAccess` array (~line 164), add an entry:

```ts
{ label: "Planif. Nage", icon: Waves, action: () => navigate("/coach/swim-planning"), color: "text-cyan-500", bg: "bg-cyan-100 dark:bg-cyan-900/30" },
```

Add `Waves` to the lucide-react imports (line ~8).

Note: `navigate` comes from `const [, navigate] = useLocation();` — this is available in the `Coach` outer component but NOT in `CoachHome`. The quickAccess items currently use `onNavigate` (for internal sections) and `onOpenRecordsClub`/`onOpenRecordsAdmin` (for route navigation). Follow the same pattern: pass `navigate` down or add an `onOpenSwimPlanning` prop. Simplest: add to quickAccess with a new prop `onOpenSwimPlanning: () => navigate("/coach/swim-planning")` passed from Coach to CoachHome.

**Step 3: Verify navigation**

Run: `npm run dev` → login as coach → see "Planif. Nage" button on home → tap → navigates to planning page
Expected: SwimPlanningDemo page loads

**Step 4: Commit**

```bash
git add src/App.tsx src/pages/Coach.tsx
git commit -m "feat: add swim planning route and CoachHome button"
```

---

### Task 8: Week meta editing (type + notes inline)

**Files:**
- Modify: `src/pages/coach/SwimPlanningDemo.tsx`

**Step 1: Add inline week editing**

When the coach taps the pencil icon on a week card:
- Replace the card content with an inline form (same pattern as `WeekRow` in `SwimmerPlanningTab.tsx`)
- Input for `week_type` with datalist of existing types
- Textarea for notes
- Check / X buttons for save/cancel
- Uses `api.upsertTrainingWeek(...)` targeting the auto-created demo cycle

**Auto-create demo cycle logic:**
- On first week edit, check if a training cycle named "Planif. nage [groupName]" exists for this group
- If not, create one via `api.createTrainingCycle(...)` with `group_id` set and a dummy `end_competition_id` (use the latest competition or skip if none)
- Store the cycle ID in component state for subsequent edits
- Alternatively: create a separate simple key-value approach using `swim_planning_slots` table with a special "meta" filiere value

**Simpler approach for demo:** Store week meta directly in localStorage keyed by `swim-plan-week-meta-{groupId}-{weekStart}`. This avoids coupling to the training_cycles table which requires a competition reference. We can migrate to DB later.

```ts
type WeekMeta = { weekType?: string; notes?: string };

function getWeekMeta(groupId: number, weekStart: string): WeekMeta {
  try {
    const raw = localStorage.getItem(`swim-plan-meta-${groupId}-${weekStart}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function setWeekMeta(groupId: number, weekStart: string, meta: WeekMeta) {
  localStorage.setItem(`swim-plan-meta-${groupId}-${weekStart}`, JSON.stringify(meta));
}
```

**Step 2: Verify editing works**

Run: `npm run dev` → expand week → tap pencil → set type "Foncier" → save → badge appears
Expected: Badge with colored type and notes visible on card

**Step 3: Commit**

```bash
git add src/pages/coach/SwimPlanningDemo.tsx
git commit -m "feat: add inline week meta editing (type + notes)"
```

---

### Task 9: Polish + frontend-design pass

**Files:**
- Modify: `src/pages/coach/SwimPlanningDemo.tsx`

**Step 1: Invoke /frontend-design skill**

Run the `/frontend-design` skill on the `SwimPlanningDemo.tsx` page to:
- Polish the visual design (spacing, colors, typography)
- Ensure mobile-first responsive behavior
- Verify dark mode support
- Add skeleton loading states
- Add empty state (no groups found)
- Ensure touch targets ≥ 44px

**Step 2: Verify visual quality**

Run: `npm run dev` → check mobile viewport (375px), dark mode toggle
Expected: Clean, polished UI matching the app's design language

**Step 3: Commit**

```bash
git add src/pages/coach/SwimPlanningDemo.tsx
git commit -m "feat: polish swim planning demo UI"
```

---

### Task 10: Type check + final verification

**Files:** None (verification only)

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual smoke test**

Run: `npm run dev` and verify:
1. CoachHome shows "Planif. Nage" button
2. Navigate to swim planning page
3. Timeline shows weeks from current week
4. Scroll down loads more weeks
5. Tap week → grid expands with animation
6. Tap `+` → bottom sheet with 8 filières
7. Select filière → chip appears in cell
8. Tap chip → can change or delete
9. Tap pencil → inline edit type + notes
10. Current week is highlighted

**Step 4: Update documentation**

Update `docs/implementation-log.md` with a new entry for this feature.
Update `CLAUDE.md` to add `SwimPlanningDemo.tsx` to the key files table.

**Step 5: Commit**

```bash
git add docs/implementation-log.md CLAUDE.md
git commit -m "docs: add swim planning demo to implementation log and CLAUDE.md"
```

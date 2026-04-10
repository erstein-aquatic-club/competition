# Coach-Swimmer Assignments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow coaches to claim swimmers as "theirs", filtering all personal views to only show their assigned swimmers.

**Architecture:** New DB table `coach_swimmer_assignments` with RLS + history trigger. New API module `coach-assignments.ts`. New `useMySwimmerIds()` hook shared by all filtered views. New "Gérer mes nageurs" screen in coach nav. Existing views filtered by assignment.

**Tech Stack:** Supabase (PostgreSQL migration + RLS), React Query, TypeScript, Shadcn UI

---

### Task 1: Database Migration — Tables, Trigger, RLS

**Files:**
- Create: `supabase/migrations/00072_coach_swimmer_assignments.sql`

**Step 1: Write the migration**

```sql
-- Coach-Swimmer Assignments
CREATE TABLE coach_swimmer_assignments (
  id SERIAL PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  swimmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (swimmer_id)
);

CREATE INDEX idx_csa_coach ON coach_swimmer_assignments(coach_id);
CREATE INDEX idx_csa_swimmer ON coach_swimmer_assignments(swimmer_id);

-- History table
CREATE TABLE coach_swimmer_history (
  id SERIAL PRIMARY KEY,
  coach_id INTEGER NOT NULL,
  swimmer_id INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_by INTEGER
);

CREATE INDEX idx_csh_swimmer ON coach_swimmer_history(swimmer_id);

-- Trigger: on DELETE or UPDATE of swimmer_id, log to history
CREATE OR REPLACE FUNCTION log_coach_swimmer_removal()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO coach_swimmer_history (coach_id, swimmer_id, assigned_at, removed_at, removed_by)
  VALUES (
    OLD.coach_id,
    OLD.swimmer_id,
    OLD.assigned_at,
    now(),
    COALESCE(
      (current_setting('app.current_user_id', true))::integer,
      OLD.coach_id
    )
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_coach_swimmer_removal
  BEFORE DELETE ON coach_swimmer_assignments
  FOR EACH ROW EXECUTE FUNCTION log_coach_swimmer_removal();

CREATE TRIGGER trg_coach_swimmer_update
  BEFORE UPDATE OF swimmer_id, coach_id ON coach_swimmer_assignments
  FOR EACH ROW EXECUTE FUNCTION log_coach_swimmer_removal();

-- RLS
ALTER TABLE coach_swimmer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_swimmer_history ENABLE ROW LEVEL SECURITY;

-- Coaches: see their own assignments + all unassigned (via API)
CREATE POLICY csa_select ON coach_swimmer_assignments
  FOR SELECT USING (
    app_user_role() IN ('coach', 'admin')
  );

-- Coaches: insert only for themselves, admins: for anyone
CREATE POLICY csa_insert ON coach_swimmer_assignments
  FOR INSERT WITH CHECK (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

-- Coaches: delete only their own, admins: any
CREATE POLICY csa_delete ON coach_swimmer_assignments
  FOR DELETE USING (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

-- Admins: update any assignment (reassign)
CREATE POLICY csa_update ON coach_swimmer_assignments
  FOR UPDATE USING (
    app_user_role() = 'admin'
  );

-- History: readable by coaches (their own) and admins (all)
CREATE POLICY csh_select ON coach_swimmer_history
  FOR SELECT USING (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );
```

**Step 2: Apply migration via Supabase MCP**

Run: Use the Supabase MCP `apply_migration` tool with the SQL above, name `coach_swimmer_assignments`.

**Step 3: Verify tables exist**

Run: Use `execute_sql` → `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'coach_swimmer%';`
Expected: 2 rows — `coach_swimmer_assignments`, `coach_swimmer_history`

**Step 4: Commit**

```bash
git add supabase/migrations/00072_coach_swimmer_assignments.sql
git commit -m "feat(db): add coach_swimmer_assignments table with RLS and history trigger"
```

---

### Task 2: API Module — `coach-assignments.ts`

**Files:**
- Create: `src/lib/api/coach-assignments.ts`
- Modify: `src/lib/api/index.ts` (add re-exports)
- Modify: `src/lib/api/types.ts` (add interfaces)

**Step 1: Add types to `src/lib/api/types.ts`**

After line 184 (`AthleteSummary` interface), add:

```typescript
export interface CoachSwimmerAssignment {
  id: number;
  coach_id: number;
  swimmer_id: number;
  assigned_at: string;
  assigned_by: number;
}

export interface CoachSwimmerHistory {
  id: number;
  coach_id: number;
  swimmer_id: number;
  assigned_at: string;
  removed_at: string;
  removed_by: number | null;
}
```

**Step 2: Create `src/lib/api/coach-assignments.ts`**

```typescript
import { supabase, canUseSupabase } from './client';
import type { CoachSwimmerAssignment } from './types';

/** Get swimmers assigned to the current coach */
export async function getMySwimmers(): Promise<number[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('coach_swimmer_assignments')
    .select('swimmer_id')
    .eq('coach_id', (await supabase.auth.getSession()).data.session?.user?.app_metadata?.app_user_id);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.swimmer_id);
}

/** Get all assignments (admin or overview) */
export async function getAllAssignments(): Promise<CoachSwimmerAssignment[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('coach_swimmer_assignments')
    .select('*');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Assign a swimmer to the current coach (or specified coach for admin) */
export async function assignSwimmer(
  swimmerId: number,
  coachId: number,
  assignedBy: number,
): Promise<void> {
  if (!canUseSupabase()) return;
  const { error } = await supabase
    .from('coach_swimmer_assignments')
    .insert({ coach_id: coachId, swimmer_id: swimmerId, assigned_by: assignedBy });
  if (error) throw new Error(error.message);
}

/** Remove a swimmer from coach's list */
export async function unassignSwimmer(swimmerId: number): Promise<void> {
  if (!canUseSupabase()) return;
  const { error } = await supabase
    .from('coach_swimmer_assignments')
    .delete()
    .eq('swimmer_id', swimmerId);
  if (error) throw new Error(error.message);
}

/** Reassign a swimmer to a different coach (admin only) */
export async function reassignSwimmer(
  swimmerId: number,
  newCoachId: number,
  assignedBy: number,
): Promise<void> {
  if (!canUseSupabase()) return;
  const { error } = await supabase
    .from('coach_swimmer_assignments')
    .update({ coach_id: newCoachId, assigned_by: assignedBy, assigned_at: new Date().toISOString() })
    .eq('swimmer_id', swimmerId);
  if (error) throw new Error(error.message);
}

/** Get assignment history for a swimmer */
export async function getSwimmerCoachHistory(swimmerId: number): Promise<any[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from('coach_swimmer_history')
    .select('*')
    .eq('swimmer_id', swimmerId)
    .order('removed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

**Step 3: Add re-exports to `src/lib/api/index.ts`**

After the existing module re-exports, add:

```typescript
// Coach assignments
export {
  getMySwimmers,
  getAllAssignments,
  assignSwimmer,
  unassignSwimmer,
  reassignSwimmer,
  getSwimmerCoachHistory,
} from './coach-assignments';
```

**Step 4: Commit**

```bash
git add src/lib/api/coach-assignments.ts src/lib/api/index.ts src/lib/api/types.ts
git commit -m "feat(api): add coach-assignments module (assign, unassign, reassign, history)"
```

---

### Task 3: Shared Hook — `useMySwimmerIds`

**Files:**
- Create: `src/hooks/useMySwimmerIds.ts`

**Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Returns the set of swimmer IDs assigned to the current coach.
 *  For admins, returns null (meaning "show all").
 */
export function useMySwimmerIds() {
  const role = useAuth((s) => s.role);
  const userId = useAuth((s) => s.userId);
  const isCoach = role === 'coach';
  const isAdmin = role === 'admin';

  const { data: mySwimmerIds, isLoading } = useQuery({
    queryKey: ['my-swimmer-ids', userId],
    queryFn: () => api.getMySwimmers(),
    enabled: isCoach && userId != null,
    staleTime: 30_000,
  });

  // Admin sees all — return null to signal "no filter"
  if (isAdmin) return { swimmerIds: null, isLoading: false };

  return {
    swimmerIds: mySwimmerIds ? new Set(mySwimmerIds) : new Set<number>(),
    isLoading,
  };
}

/** Filter an athlete list by the coach's assigned swimmers.
 *  If swimmerIds is null (admin), returns all athletes.
 */
export function filterByAssignment<T extends { id: number | null }>(
  athletes: T[],
  swimmerIds: Set<number> | null,
): T[] {
  if (swimmerIds === null) return athletes;
  return athletes.filter((a) => a.id != null && swimmerIds.has(a.id));
}
```

**Step 2: Commit**

```bash
git add src/hooks/useMySwimmerIds.ts
git commit -m "feat: add useMySwimmerIds hook for coach-scoped athlete filtering"
```

---

### Task 4: New Screen — "Gérer mes nageurs" (`CoachMySwimmersScreen.tsx`)

**Files:**
- Create: `src/pages/coach/CoachMySwimmersScreen.tsx`

**Step 1: Create the screen component**

This screen has two sections:
- "Mes nageurs" — athletes assigned to this coach, with a "Retirer" button per athlete
- "Nageurs disponibles" — unassigned athletes, with a "Prendre en charge" button

For admins, show all athletes grouped by coach + unassigned, with a reassignment option.

Use existing patterns from `CoachSwimmersOverview.tsx`:
- `CoachSectionHeader` for the page header
- `Badge`, `Button` from shadcn
- `AthleteSummary` type
- Search bar pattern
- Confirmation dialog via `AlertDialog` from shadcn

Key queries:
- `["athletes"]` — all athletes (already cached from Coach.tsx)
- `["all-assignments"]` — all coach_swimmer_assignments
- `["my-swimmer-ids", userId]` — for cache invalidation after mutation

Mutations:
- `assignSwimmer` → invalidate `["my-swimmer-ids"]`, `["all-assignments"]`, `["athletes"]`
- `unassignSwimmer` → same invalidations

**Important:** Use `/frontend-design` skill when implementing this screen (as per CLAUDE.md global instructions).

**Step 2: Commit**

```bash
git add src/pages/coach/CoachMySwimmersScreen.tsx
git commit -m "feat(coach): add 'Gérer mes nageurs' screen for coach-swimmer assignments"
```

---

### Task 5: Wire Screen into Coach Navigation

**Files:**
- Modify: `src/pages/Coach.tsx`

**Step 1: Add "my-swimmers" to CoachSection type**

At line 30, change:
```typescript
type CoachSection = "home" | "week" | "swimmers" | "library" | "athlete" | "groups" | "competitions" | "comms" | "chrono";
```
to:
```typescript
type CoachSection = "home" | "week" | "swimmers" | "library" | "athlete" | "groups" | "competitions" | "comms" | "chrono" | "my-swimmers";
```

**Step 2: Add lazy import**

After line 26, add:
```typescript
const CoachMySwimmersScreen = lazy(() => import("./coach/CoachMySwimmersScreen"));
```

**Step 3: Add "my-swimmers" to shouldLoadAthletes**

At lines 459-466, add `"my-swimmers"` to the list.

**Step 4: Add rendering block**

After the chrono section (line 714), add:
```tsx
{activeSection === "my-swimmers" ? (
  <Suspense fallback={<PageSkeleton />}>
    <CoachMySwimmersScreen
      athletes={athletes}
      athletesLoading={athletesLoading}
      onBack={() => setActiveSection("home")}
    />
  </Suspense>
) : null}
```

**Step 5: Add navigation entry in CoachHome**

Find the coach home navigation grid and add a new card/button for "Gérer mes nageurs" that calls `onNavigate("my-swimmers")`. This is in the `CoachHome` component — look for `onNavigate` usage patterns.

**Step 6: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach): wire 'Gérer mes nageurs' screen into coach navigation"
```

---

### Task 6: Filter CoachSwimmersOverview by Assignment

**Files:**
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx`

**Step 1: Import and use the hook**

At the top, add:
```typescript
import { useMySwimmerIds, filterByAssignment } from '@/hooks/useMySwimmerIds';
```

Inside the component, call:
```typescript
const { swimmerIds } = useMySwimmerIds();
```

**Step 2: Filter athletes before rendering**

Find where `athletes` prop is used for display/sort (around lines 245-290). Wrap with:
```typescript
const visibleAthletes = useMemo(
  () => filterByAssignment(athletes, swimmerIds),
  [athletes, swimmerIds],
);
```

Replace `athletes` with `visibleAthletes` in the filtering/sorting/rendering logic below.

**Step 3: Commit**

```bash
git add src/pages/coach/CoachSwimmersOverview.tsx
git commit -m "feat(coach): filter swimmers overview by coach assignment"
```

---

### Task 7: Filter Coach.tsx Central Athletes Query

**Files:**
- Modify: `src/pages/Coach.tsx`

**Step 1: Add filtered athletes for personal views**

Import the hook and filter:
```typescript
import { useMySwimmerIds, filterByAssignment } from '@/hooks/useMySwimmerIds';
```

After the `athletes` query (line 488), add:
```typescript
const { swimmerIds } = useMySwimmerIds();
const myAthletes = useMemo(
  () => filterByAssignment(athletes, swimmerIds),
  [athletes, swimmerIds],
);
```

**Step 2: Pass `myAthletes` to personal views, `athletes` to shared views**

- `CoachSwimmersOverview` → `myAthletes`
- `CoachSwimmerDetail` → keep as-is (already filtered by athlete ID, but add access check)
- `CoachComms` (SMS, notifications) → `myAthletes`
- `CoachGroupsScreen` → `athletes` (groups are cross-coach)
- `CoachChronoScreen` → `athletes` (shared view, toggle handled inside)
- `CoachHome` → `myAthletes` (KPIs only for their swimmers)

**Step 3: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach): pass filtered athletes to personal views, full list to shared views"
```

---

### Task 8: Filter Chrono Setup with Toggle

**Files:**
- Modify: `src/components/chrono/ChronoSetup.tsx`
- Modify: `src/pages/coach/CoachChronoScreen.tsx`

**Step 1: Add a "Tout le club" toggle to ChronoSetup**

In `ChronoSetup.tsx`, add a new prop `allAthletes` alongside `athletes` (which becomes coach-only by default):

```typescript
interface ChronoSetupProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  athletes: AthleteSummary[];      // coach's swimmers
  allAthletes: AthleteSummary[];   // all club swimmers
}
```

Add a toggle state:
```typescript
const [showAll, setShowAll] = useState(false);
const displayAthletes = showAll ? allAthletes : athletes;
```

Add a Switch/Toggle UI near the search bar:
```tsx
<div className="flex items-center gap-2">
  <Switch checked={showAll} onCheckedChange={setShowAll} />
  <span className="text-sm text-muted-foreground">Tout le club</span>
</div>
```

Use `displayAthletes` instead of `athletes` in the grouped list.

**Step 2: Update CoachChronoScreen to pass both props**

```typescript
<ChronoSetup
  state={state}
  dispatch={dispatch}
  athletes={myAthletes}
  allAthletes={athletes}
/>
```

This requires `CoachChronoScreen` to receive both `athletes` (all) and `myAthletes` (filtered) as props from `Coach.tsx`.

**Step 3: Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx src/pages/coach/CoachChronoScreen.tsx
git commit -m "feat(chrono): add 'Tout le club' toggle in setup, default to coach's swimmers"
```

---

### Task 9: Filter Notifications Push for Coach's Swimmers

**Files:**
- Modify: `src/lib/api/notifications.ts` (if needed)
- Or handle at the UI level in `CoachComms`

**Step 1: Review notification flow**

The push notifications for swimmer feedback are sent server-side (edge function `push-send` or pg_net trigger). The filtering here is on the **coach reading** notifications, not on sending.

Since `CoachComms` already receives `athletes` as a prop (now `myAthletes`), the notification list will naturally filter to show only notifications related to those athletes.

If notifications are fetched by `targetUserId` (the coach), they need to be filtered by swimmer IDs in the UI. Check if `notifications_list()` already supports `targetAthleteName` filter — if so, use it with the coach's swimmer names.

**Step 2: Verify notification display only shows relevant swimmers**

In the notification list component used by `CoachComms`, ensure swimmers shown are filtered to `myAthletes`. If needed, add a swimmer ID filter to the notification query.

**Step 3: Commit**

```bash
git add src/lib/api/notifications.ts
git commit -m "feat(notifications): scope coach notifications to assigned swimmers"
```

---

### Task 10: Protect Athlete Detail Access

**Files:**
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx`

**Step 1: Add access check**

Import:
```typescript
import { useMySwimmerIds } from '@/hooks/useMySwimmerIds';
```

Inside the component, check access:
```typescript
const { swimmerIds } = useMySwimmerIds();
const hasAccess = swimmerIds === null || (athleteId != null && swimmerIds.has(athleteId));
```

If `!hasAccess`, show an access denied message or redirect back to swimmers list.

**Step 2: Commit**

```bash
git add src/pages/coach/CoachSwimmerDetail.tsx
git commit -m "feat(coach): protect athlete detail page by coach assignment"
```

---

### Task 11: Documentation Updates

**Files:**
- Modify: `CLAUDE.md` — add new files to the table, update roadmap entry
- Modify: `docs/ROADMAP.md` — add chantier §98 (or next number)
- Modify: `docs/FEATURES_STATUS.md` — add coach-swimmer assignments status
- Modify: `docs/implementation-log.md` — add implementation entry

**Step 1: Update all 4 documentation files**

Follow the documentation workflow from CLAUDE.md:
1. Add `src/lib/api/coach-assignments.ts`, `src/hooks/useMySwimmerIds.ts`, `src/pages/coach/CoachMySwimmersScreen.tsx` to the CLAUDE.md files table
2. Add roadmap entry for "Attribution coach ↔ nageur" as done
3. Update features status
4. Add implementation log entry with all changes, decisions, and files modified

**Step 2: Commit**

```bash
git add CLAUDE.md docs/ROADMAP.md docs/FEATURES_STATUS.md docs/implementation-log.md
git commit -m "docs: add coach-swimmer assignments to all tracking files"
```

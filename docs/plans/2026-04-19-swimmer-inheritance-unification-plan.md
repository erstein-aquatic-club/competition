# Swimmer Inheritance Unification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify the swimmer session inheritance logic into a single Postgres RPC (`get_swimmer_sessions`) consumed by all views, with granular absence semantics and protection of individual assignments against group operations.

**Architecture:** Three idempotent SQL migrations add columns to `planned_absences`, create the `get_swimmer_sessions` function, and add a unique index on individual swim assignments. Five frontend consumers migrate incrementally from `resolveSwimmerAssignmentsBatch` to the new RPC. Mutation functions (`deleteSlotAssignments`, `bulkCreateSlotAssignments`) are refactored to preserve individual assignments, with a new UI dialog informing the coach. The old resolver is deprecated and removed after a stability period.

**Tech Stack:** Postgres 15 (via Supabase), TypeScript, React Query 5, Vitest for unit tests, node:test + pg pool for RLS integration tests (`npm run test:rls`).

**Design doc:** `docs/plans/2026-04-19-swimmer-inheritance-unification-design.md`

---

## Phase 1 — Backend migrations

### Task 1.1: Migration `00128_planned_absences_per_slot.sql`

**Files:**
- Create: `supabase/migrations/00128_planned_absences_per_slot.sql`

**Step 1: Write the migration**

Create the file with:

```sql
-- Adds per-slot granularity to planned_absences.
-- Previously an absence was always whole-day; now it can be scoped to
-- morning/evening or a specific training_slot. NULL scheduled_slot = whole day.

ALTER TABLE planned_absences
  ADD COLUMN scheduled_slot text CHECK (scheduled_slot IN ('morning', 'evening')),
  ADD COLUMN training_slot_id uuid REFERENCES training_slots(id) ON DELETE SET NULL;

-- Drop old whole-day unique constraint (if named like this — adjust to real name)
DROP INDEX IF EXISTS planned_absences_user_id_date_key;

-- New partial unique: coalesce NULL to 'all' so whole-day absence doesn't
-- conflict with morning+evening rows on the same date.
CREATE UNIQUE INDEX planned_absences_user_date_slot_unique
  ON planned_absences(user_id, date, COALESCE(scheduled_slot, 'all'));

CREATE INDEX idx_pa_user_date_slot
  ON planned_absences(user_id, date, scheduled_slot);

COMMENT ON COLUMN planned_absences.scheduled_slot IS
  'NULL = whole-day absence, morning/evening = scoped to bucket';
COMMENT ON COLUMN planned_absences.training_slot_id IS
  'Optional precise reference when two slots coexist in the same bucket';
```

**Step 2: Inspect current constraint name**

Run the following via the MCP Supabase tool to find the exact constraint name to drop:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'planned_absences'::regclass AND contype = 'u';
```

Update the `DROP INDEX IF EXISTS` line in the migration to match.

**Step 3: Apply migration via MCP**

Invoke `mcp__plugin_supabase_supabase__apply_migration` with `project_id: fscnobivsgornxdwqwlk`, `name: 00128_planned_absences_per_slot`, and the full SQL.

**Step 4: Verify columns exist**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'planned_absences' AND column_name IN ('scheduled_slot', 'training_slot_id');
```

Expected: both columns returned.

**Step 5: Commit**

```bash
git add supabase/migrations/00128_planned_absences_per_slot.sql
git commit -m "feat(db): add per-slot granularity to planned_absences (§144)"
```

---

### Task 1.2: Migration `00129_get_swimmer_sessions_rpc.sql`

**Files:**
- Create: `supabase/migrations/00129_get_swimmer_sessions_rpc.sql`

**Step 1: Write the RPC**

Full body in the migration file:

```sql
-- Canonical resolver for what a swimmer should see on a given date range.
-- Consumed by Dashboard, coach week view (swimmer filter), Suivi*, SwimmerHome.
-- See docs/plans/2026-04-19-swimmer-inheritance-unification-design.md

CREATE OR REPLACE FUNCTION public.get_swimmer_sessions(
  p_user_id integer,
  p_from date,
  p_to date,
  p_include_drafts boolean DEFAULT false
)
RETURNS TABLE (
  swimmer_slot_id uuid,
  scheduled_date date,
  day_of_week int,
  bucket text,
  slot_start_time time,
  slot_end_time time,
  slot_location text,
  slot_session_type text,
  assignment_id integer,
  assignment_source text,
  assignment_title text,
  assignment_total_km numeric,
  swim_catalog_id integer,
  strength_session_id integer,
  training_slot_id uuid,
  is_absent boolean,
  absence_reason text,
  log_session_id uuid
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
  v_has_custom boolean;
  v_group_ids int[];
BEGIN
  -- Swimmer's current group memberships (permanent + active temporary)
  SELECT array_agg(DISTINCT gm.group_id)
  INTO v_group_ids
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id = p_user_id
    AND (NOT g.is_temporary OR g.is_active);

  -- Does swimmer have custom slots?
  SELECT EXISTS(
    SELECT 1 FROM swimmer_training_slots
    WHERE user_id = p_user_id AND is_active = true
  ) INTO v_has_custom;

  RETURN QUERY
  WITH
  -- Step 1: expected slots (from swimmer_training_slots if custom, else group training_slots)
  date_series AS (
    SELECT d::date AS sched_date,
           EXTRACT(ISODOW FROM d)::int AS dow
    FROM generate_series(p_from, p_to, '1 day') d
  ),
  expected_slots AS (
    SELECT
      CASE WHEN v_has_custom THEN sts.id ELSE NULL END AS swimmer_slot_id,
      ds.sched_date,
      ds.dow,
      CASE WHEN EXTRACT(HOUR FROM COALESCE(sts.start_time, ts.start_time)) < 13
           THEN 'morning' ELSE 'evening' END AS bucket,
      COALESCE(sts.start_time, ts.start_time) AS slot_start_time,
      COALESCE(sts.end_time, ts.end_time) AS slot_end_time,
      COALESCE(sts.location, ts.location) AS slot_location,
      COALESCE(sts.session_type, ts.session_type) AS slot_session_type,
      sts.source_assignment_id,
      ts.id AS direct_training_slot_id  -- NULL if came from swimmer_slot path
    FROM date_series ds
    LEFT JOIN swimmer_training_slots sts
      ON v_has_custom
     AND sts.user_id = p_user_id
     AND sts.is_active = true
     AND sts.day_of_week = ds.dow
    LEFT JOIN training_slots ts
      ON (NOT v_has_custom)
     AND ts.is_active = true
     AND ts.day_of_week = ds.dow
     AND EXISTS(
       SELECT 1 FROM training_slot_assignments tsa
       WHERE tsa.slot_id = ts.id AND tsa.group_id = ANY(v_group_ids)
     )
    WHERE (v_has_custom AND sts.id IS NOT NULL)
       OR (NOT v_has_custom AND ts.id IS NOT NULL)
  ),
  -- Step 2: resolve training_slot_id source per expected slot
  with_source AS (
    SELECT
      es.*,
      COALESCE(
        -- Exact match via source_assignment_id
        (SELECT tsa.slot_id FROM training_slot_assignments tsa
         WHERE tsa.id = es.source_assignment_id LIMIT 1),
        -- Fallback by attributes (day + session_type + bucket + group match)
        (SELECT ts.id FROM training_slots ts
         JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
         WHERE ts.is_active = true
           AND ts.day_of_week = es.dow
           AND ts.session_type = es.slot_session_type
           AND CASE WHEN EXTRACT(HOUR FROM ts.start_time) < 13 THEN 'morning' ELSE 'evening' END = es.bucket
           AND tsa.group_id = ANY(v_group_ids)
         ORDER BY ABS(EXTRACT(EPOCH FROM (ts.start_time - es.slot_start_time))) ASC
         LIMIT 1),
        -- If expected_slots.direct_training_slot_id is set (no custom path), keep it
        es.direct_training_slot_id
      ) AS resolved_training_slot_id
    FROM expected_slots es
  ),
  -- Step 3: find the best assignment per expected slot (individual > subgroup > group)
  candidate_assignments AS (
    SELECT
      ws.swimmer_slot_id,
      ws.sched_date,
      ws.dow,
      ws.bucket,
      ws.slot_start_time,
      ws.slot_end_time,
      ws.slot_location,
      ws.slot_session_type,
      ws.resolved_training_slot_id,
      sa.id AS assignment_id,
      CASE
        WHEN sa.target_user_id = p_user_id THEN 'individual'
        WHEN sa.target_subgroup_id = ANY(v_group_ids) THEN 'subgroup'
        WHEN sa.target_group_id = ANY(v_group_ids) THEN 'group'
        ELSE 'none'
      END AS source,
      CASE
        WHEN sa.target_user_id = p_user_id THEN 1
        WHEN sa.target_subgroup_id = ANY(v_group_ids) THEN 2
        WHEN sa.target_group_id = ANY(v_group_ids) THEN 3
        ELSE 4
      END AS priority,
      sa.swim_catalog_id,
      sa.strength_session_id,
      sa.training_slot_id AS sa_training_slot_id,
      COALESCE(ssc.name, 'Séance') AS title,
      ssc.total_distance AS total_km
    FROM with_source ws
    LEFT JOIN session_assignments sa
      ON sa.scheduled_date = ws.sched_date
     AND sa.status != 'cancelled'
     AND (p_include_drafts OR sa.visible_from IS NULL OR sa.visible_from <= CURRENT_DATE)
     AND (
       sa.target_user_id = p_user_id
       OR (sa.training_slot_id = ws.resolved_training_slot_id AND (sa.target_group_id = ANY(v_group_ids) OR sa.target_subgroup_id = ANY(v_group_ids)))
       OR (sa.training_slot_id IS NULL AND sa.scheduled_slot = ws.bucket AND (sa.target_group_id = ANY(v_group_ids) OR sa.target_subgroup_id = ANY(v_group_ids)))
     )
    LEFT JOIN swim_sessions_catalog ssc ON ssc.id = sa.swim_catalog_id
  ),
  best_assignment AS (
    SELECT DISTINCT ON (ca.swimmer_slot_id, ca.sched_date, ca.bucket)
      ca.*
    FROM candidate_assignments ca
    ORDER BY ca.swimmer_slot_id, ca.sched_date, ca.bucket, ca.priority ASC, ca.assignment_id DESC
  )
  SELECT
    ba.swimmer_slot_id,
    ba.sched_date AS scheduled_date,
    ba.dow AS day_of_week,
    ba.bucket,
    ba.slot_start_time,
    ba.slot_end_time,
    ba.slot_location,
    ba.slot_session_type,
    ba.assignment_id,
    ba.source AS assignment_source,
    ba.title AS assignment_title,
    ba.total_km AS assignment_total_km,
    ba.swim_catalog_id,
    ba.strength_session_id,
    ba.sa_training_slot_id AS training_slot_id,
    EXISTS(
      SELECT 1 FROM planned_absences pa
      WHERE pa.user_id = p_user_id
        AND pa.date = ba.sched_date
        AND (pa.scheduled_slot IS NULL OR pa.scheduled_slot = ba.bucket)
    ) AS is_absent,
    (SELECT pa.reason FROM planned_absences pa
     WHERE pa.user_id = p_user_id
       AND pa.date = ba.sched_date
       AND (pa.scheduled_slot IS NULL OR pa.scheduled_slot = ba.bucket)
     LIMIT 1) AS absence_reason,
    NULL::uuid AS log_session_id  -- populated by later join; stub for now
  FROM best_assignment ba
  ORDER BY ba.sched_date, ba.slot_start_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_swimmer_sessions(integer, date, date, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_swimmer_sessions IS
  'Canonical resolver: expected slots + assignments (individual > subgroup > group) + absence status. See design doc 2026-04-19.';
```

**Step 2: Apply via MCP**

Same pattern as 1.1. Use `mcp__plugin_supabase_supabase__apply_migration`.

**Step 3: Smoke test**

Run via MCP execute_sql:

```sql
SELECT * FROM get_swimmer_sessions(1, '2026-04-09', '2026-04-10', true);
```

Expected: at least 2 rows (François on 09/04 and 10/04 evening) with `assignment_source = 'group'` and non-NULL `assignment_id`.

**Step 4: Commit**

```bash
git add supabase/migrations/00129_get_swimmer_sessions_rpc.sql
git commit -m "feat(db): add get_swimmer_sessions RPC as single inheritance resolver (§144)"
```

---

### Task 1.3: Migration `00130_session_assignments_individual_unique.sql`

**Files:**
- Create: `supabase/migrations/00130_session_assignments_individual_unique.sql`

**Step 1: Write**

```sql
-- Prevent duplicate individual swim assignments on the same (slot, date, user).
-- Group duplicates are already prevented by idx_sa_unique_slot_group_v2 (§80+).

CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_unique_slot_user_v1
  ON session_assignments(training_slot_id, scheduled_date, target_user_id)
  WHERE target_user_id IS NOT NULL AND assignment_type = 'swim';
```

**Step 2: Apply via MCP**

**Step 3: Verify**

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'session_assignments' AND indexname = 'idx_sa_unique_slot_user_v1';
```

Expected: 1 row.

**Step 4: Commit**

```bash
git add supabase/migrations/00130_session_assignments_individual_unique.sql
git commit -m "feat(db): unique index on individual swim assignments (§144)"
```

---

## Phase 2 — RLS integration tests

### Task 2.1: Extend test harness schema

**Files:**
- Modify: `supabase/tests/schema.sql`
- Modify: `supabase/tests/seed.sql`

**Step 1: Add columns to tests schema**

In `supabase/tests/schema.sql`, locate the `planned_absences` CREATE TABLE block. Add:

```sql
-- After existing columns
scheduled_slot text CHECK (scheduled_slot IN ('morning','evening')),
training_slot_id uuid REFERENCES training_slots(id) ON DELETE SET NULL
```

Also add the new unique index and partial index matching the migration.

**Step 2: Add the RPC function source**

Append the entire `get_swimmer_sessions` body from `00129_…sql` to `supabase/tests/schema.sql` so RLS tests can invoke it.

**Step 3: Extend seed data**

In `supabase/tests/seed.sql`, ensure:
- A user with `swimmer_training_slots` having both `source_assignment_id` non-NULL and NULL cases.
- At least one `session_assignments` per scenario (group-only, individual-only, both).
- At least one `planned_absences` with `scheduled_slot = 'morning'` and one with NULL.

**Step 4: Verify schema compiles**

```bash
npm run test:rls -- --reporter=verbose 2>&1 | head -20
```

Expected: no schema errors. Tests may fail (expected until Task 2.2).

**Step 5: Commit**

```bash
git add supabase/tests/schema.sql supabase/tests/seed.sql
git commit -m "test(rls): extend harness for get_swimmer_sessions fixtures (§144)"
```

---

### Task 2.2: Write RLS tests for `get_swimmer_sessions`

**Files:**
- Create: `supabase/tests/rls/get_swimmer_sessions.test.ts`

**Step 1: Write failing tests**

Create test file covering 12 cases from design doc section 5. Use the existing harness (`asUser`, `asServiceRole`, `resetDb`).

Skeleton:

```ts
import { describe, it, beforeEach, expect } from 'vitest';
import { resetDb, asUser, asServiceRole } from './_helpers';

describe('get_swimmer_sessions RPC', () => {
  beforeEach(resetDb);

  it('inherits group session on same bucket (swimmer custom slot Thu 18:00, group slot Thu 15:00)', async () => {
    // seed: swimmer perm Elite, custom slot Thu 18:00 swim, group session Thu 15:00 swim evening
    const client = await asUser('athlete1');
    const { rows } = await client.query(
      "SELECT * FROM get_swimmer_sessions(1, '2026-04-09', '2026-04-09', false)"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].assignment_source).toBe('group');
    expect(rows[0].assignment_id).not.toBeNull();
  });

  it('does NOT inherit when bucket differs', async () => { /* ... */ });
  it('ignores inheritance when no custom slot on same day', async () => { /* ... */ });
  it('individual assignment wins over group', async () => { /* ... */ });
  it('individual without training_slot_id wins via bucket match', async () => { /* ... */ });
  it('subgroup precedes group', async () => { /* ... */ });
  it('planned_absences scoped to evening does not flag morning slot', async () => { /* ... */ });
  it('planned_absences with NULL scheduled_slot flags all slots that day', async () => { /* ... */ });
  it('past dates before active temp group still inherit via permanent group (§139 regression)', async () => { /* ... */ });
  it('RLS: swimmer A cannot query sessions for swimmer B', async () => {
    const client = await asUser('athlete1');
    await expect(
      client.query("SELECT * FROM get_swimmer_sessions(2, '2026-04-09', '2026-04-09', false)")
    ).resolves.toMatchObject({ rows: [] });
  });
  it('coach can query sessions for any swimmer', async () => { /* ... */ });
  it('swimmer without custom slots falls back to group training_slots', async () => { /* ... */ });
});
```

**Step 2: Run tests (expect failures — they will, until seeds cover all cases)**

```bash
npm run test:rls -- get_swimmer_sessions
```

Expected: tests run but some assertions may fail due to seed completeness.

**Step 3: Iterate seed.sql + tests until all pass**

For each failing test, identify missing fixtures, add to `supabase/tests/seed.sql`. Do not modify the RPC — the RPC is correct (already validated via manual smoke test in Task 1.2). Focus on completing test scenarios.

**Step 4: Verify all 12 pass**

```bash
npm run test:rls -- get_swimmer_sessions
```

Expected: 12 pass, 0 fail.

**Step 5: Commit**

```bash
git add supabase/tests/rls/get_swimmer_sessions.test.ts supabase/tests/seed.sql
git commit -m "test(rls): 12 cases for get_swimmer_sessions (§144)"
```

---

## Phase 3 — Frontend wrapper

### Task 3.1: Add TypeScript type + wrapper

**Files:**
- Modify: `src/lib/api/types.ts`
- Create: `src/lib/api/swimmerSessions.ts`
- Modify: `src/lib/api/index.ts`

**Step 1: Add type to `types.ts`**

Append:

```ts
export interface SwimmerSession {
  swimmer_slot_id: string | null;
  scheduled_date: string;
  day_of_week: number;
  bucket: 'morning' | 'evening';
  slot_start_time: string;
  slot_end_time: string;
  slot_location: string;
  slot_session_type: 'swim' | 'strength';
  assignment_id: number | null;
  assignment_source: 'individual' | 'subgroup' | 'group' | 'none';
  assignment_title: string | null;
  assignment_total_km: number | null;
  swim_catalog_id: number | null;
  strength_session_id: number | null;
  training_slot_id: string | null;
  is_absent: boolean;
  absence_reason: string | null;
  log_session_id: string | null;
}
```

**Step 2: Create wrapper**

`src/lib/api/swimmerSessions.ts`:

```ts
import { supabase, canUseSupabase } from './client';
import type { SwimmerSession } from './types';

/**
 * Canonical fetch for what a swimmer should see on a given date range.
 * Unifies inheritance (group → swimmer), individual/subgroup/group precedence,
 * and granular absences.
 *
 * @param userId  Swimmer user id (integer from users.id)
 * @param from    ISO date YYYY-MM-DD inclusive
 * @param to      ISO date YYYY-MM-DD inclusive
 * @param includeDrafts  If true (coach only), returns assignments with
 *                       `visible_from > today` still in draft state.
 */
export async function getSwimmerSessions(
  userId: number,
  from: string,
  to: string,
  includeDrafts = false,
): Promise<SwimmerSession[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase.rpc('get_swimmer_sessions', {
    p_user_id: userId,
    p_from: from,
    p_to: to,
    p_include_drafts: includeDrafts,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimmerSession[];
}
```

**Step 3: Export from index**

In `src/lib/api/index.ts`, add:

```ts
export { getSwimmerSessions } from './swimmerSessions';
```

**Step 4: Type check**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "swimmerSessions\|SwimmerSession"
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/swimmerSessions.ts src/lib/api/index.ts
git commit -m "feat(api): add getSwimmerSessions wrapper (§144)"
```

---

### Task 3.2: Vitest for the wrapper

**Files:**
- Create: `src/lib/api/__tests__/swimmerSessions.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSwimmerSessions } from '../swimmerSessions';

vi.mock('../client', () => ({
  canUseSupabase: () => true,
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from '../client';

describe('getSwimmerSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes parameters to RPC and returns data', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [{ scheduled_date: '2026-04-09', assignment_source: 'group' }],
      error: null,
    });
    const result = await getSwimmerSessions(1, '2026-04-09', '2026-04-10');
    expect(supabase.rpc).toHaveBeenCalledWith('get_swimmer_sessions', {
      p_user_id: 1, p_from: '2026-04-09', p_to: '2026-04-10', p_include_drafts: false,
    });
    expect(result).toHaveLength(1);
  });

  it('throws on RPC error', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getSwimmerSessions(1, '2026-04-09', '2026-04-10')).rejects.toThrow('boom');
  });

  it('forwards includeDrafts flag', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    await getSwimmerSessions(1, '2026-04-09', '2026-04-10', true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ p_include_drafts: true }),
    );
  });
});
```

**Step 2: Run**

```bash
npm test -- swimmerSessions
```

Expected: 3 pass.

**Step 3: Commit**

```bash
git add src/lib/api/__tests__/swimmerSessions.test.ts
git commit -m "test(api): unit tests for getSwimmerSessions wrapper (§144)"
```

---

## Phase 4 — Consumer migration (incremental, one commit per consumer)

For each consumer, the pattern is identical:
1. Replace `resolveSwimmerAssignmentsBatch` call with `getSwimmerSessions`.
2. Transform the new shape into whatever the component already expects (or refactor the component to consume the new shape directly if it's worth it).
3. Verify the view visually behaves identically for the cases in design doc section 5.
4. Commit.

### Task 4.1: Migrate `useDashboardSessions.ts` (Dashboard nageur)

**Files:**
- Modify: `src/hooks/dashboard/useDashboardSessions.ts`
- Test: manual verification on Dashboard + existing Vitest for the hook (if any).

**Step 1: Read current code**

`src/hooks/dashboard/useDashboardSessions.ts` currently calls `resolveSwimmerAssignmentsBatch(userId, datesNeedingResolution)` inside `useQuery`. Plus a secondary fallback via `dayAssignments`.

**Step 2: Replace with `getSwimmerSessions`**

Replace the `useQuery` block:

```ts
const { data: swimmerSessionsData, isLoading: isResolvingAssignments } = useQuery({
  queryKey: ['swimmer-sessions', userId, datesNeedingResolution[0], datesNeedingResolution.at(-1)],
  queryFn: () =>
    getSwimmerSessions(
      userId!,
      datesNeedingResolution[0]!,
      datesNeedingResolution.at(-1)!,
      false,
    ),
  enabled: !!userId && datesNeedingResolution.length > 0,
  staleTime: 2 * 60 * 1000,
});
```

Adjust downstream usage (`getSessionsForISO`) to read from `swimmerSessionsData` (now a flat array keyed by `scheduled_date`) instead of the old `Map<string, ResolvedSlotAssignment[]>`.

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep useDashboardSessions
```

Expected: no errors.

**Step 4: Run dev server and manually verify**

```bash
npm run dev
```

Open `/natation`, verify the current week shows sessions correctly. Navigate to past week covering 2026-04-09/10 — verify Thursday/Friday show the Elite group sessions.

**Step 5: Commit**

```bash
git add src/hooks/dashboard/useDashboardSessions.ts
git commit -m "refactor(dashboard): use getSwimmerSessions RPC (§144)"
```

---

### Task 4.2: Migrate `CoachTrainingSlotsScreen.tsx`

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx`

**Step 1: Remove §137/139/143 ad-hoc logic**

Delete:
- `swimmerSourceAssignmentIds` memo.
- `sourceTrainingSlotIdByAssignmentId` useQuery.
- `sourceTrainingSlotBySwimmerSlot` memo.
- `trainingSlotById` memo.
- `findGroupTrainingSlotByAttributes` callback.
- The swimmer-mode branch in `slotInstancesById` that uses these maps.

**Step 2: Add `useQuery` for `getSwimmerSessions` when swimmer filter active**

```ts
const { data: swimmerSessionsByKey } = useQuery({
  queryKey: ['coach-swimmer-sessions', swimmerFilterId, weekMondayIso, weekSundayIso],
  queryFn: async () => {
    const rows = await getSwimmerSessions(
      swimmerFilterId!,
      weekMondayIso,
      weekSundayIso,
      true,  // coach sees drafts
    );
    const map = new Map<string, SwimmerSession>();
    for (const r of rows) {
      if (r.swimmer_slot_id) map.set(`${r.swimmer_slot_id}:${r.scheduled_date}`, r);
    }
    return map;
  },
  enabled: swimmerFilterId != null && swimmerHasCustom === true,
  staleTime: 2 * 60 * 1000,
});
```

**Step 3: Use it in `slotInstancesById`**

```ts
if (useSwimmerResolution) {
  if (slot.session_type !== 'swim') {
    assignment = undefined;
  } else {
    const row = swimmerSessionsByKey?.get(`${slot.id}:${scheduledDate}`);
    if (row?.assignment_id != null) {
      assignment = slotAssignments.find((a) => a.id === row.assignment_id);
    } else {
      assignment = undefined;
    }
  }
} else {
  assignment = resolveSlotAssignment(slot, scheduledDate, slotAssignments);
}
```

**Step 4: Type check**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep CoachTrainingSlots
```

**Step 5: Manual verify — François week 09-10/04**

Run dev, select François filter, navigate to week of 2026-04-09. Verify Thursday 18:00 and Friday 18:00 slots show Elite group sessions.

**Step 6: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "refactor(coach): replace §137/139/143 logic with getSwimmerSessions RPC (§144)"
```

---

### Task 4.3: Migrate `SuiviSemaine.tsx`

**Files:**
- Modify: `src/pages/SuiviSemaine.tsx`

**Step 1: Find `resolveSwimmerAssignmentsBatch` usage**

```bash
grep -n "resolveSwimmerAssignmentsBatch" src/pages/SuiviSemaine.tsx
```

**Step 2: Replace with `getSwimmerSessions`**

Same pattern as 4.1. Adjust consumers.

**Step 3: Manual verify — SuiviSemaine view for François**

**Step 4: Commit**

```bash
git add src/pages/SuiviSemaine.tsx
git commit -m "refactor(suivi): SuiviSemaine uses getSwimmerSessions RPC (§144)"
```

---

### Task 4.4: Migrate `SuiviSaison.tsx`

Same pattern as 4.3. Separate commit.

---

### Task 4.5: Migrate `SwimmerHome.tsx`

Same pattern. Separate commit.

---

## Phase 5 — Mutation refactor

### Task 5.1: Scope `deleteSlotAssignments` to groups only

**Files:**
- Modify: `src/lib/api/assignments.ts:477-490`
- Create: `src/lib/api/__tests__/deleteSlotAssignments.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { deleteSlotAssignments } from '../assignments';

vi.mock('../client', () => {
  const deleteMock = vi.fn();
  return {
    canUseSupabase: () => true,
    supabase: {
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          is: deleteMock,
        })),
      })),
    },
    __deleteMock: deleteMock,
  };
});

// @ts-expect-error — accessing test-only export
import { __deleteMock } from '../client';

describe('deleteSlotAssignments', () => {
  it('scopes delete to target_user_id IS NULL (preserves individuals)', async () => {
    __deleteMock.mockResolvedValue({ error: null });
    await deleteSlotAssignments({ trainingSlotId: 'abc', scheduledDate: '2026-04-09' });
    expect(__deleteMock).toHaveBeenCalledWith('target_user_id', null);
  });
});
```

**Step 2: Run — expect fail**

```bash
npm test -- deleteSlotAssignments
```

Expected: FAIL (function doesn't filter on target_user_id yet).

**Step 3: Update function**

In `assignments.ts:477-490`:

```ts
const { error } = await supabase
  .from("session_assignments")
  .delete()
  .eq("training_slot_id", params.trainingSlotId)
  .eq("scheduled_date", params.scheduledDate)
  .is("target_user_id", null);  // ← preserve individual assignments
```

**Step 4: Run — expect pass**

```bash
npm test -- deleteSlotAssignments
```

**Step 5: Commit**

```bash
git add src/lib/api/assignments.ts src/lib/api/__tests__/deleteSlotAssignments.test.ts
git commit -m "feat(api): deleteSlotAssignments preserves individual assignments (§144)"
```

---

### Task 5.2: Add `preservedIndividuals` to `bulkCreateSlotAssignments`

**Files:**
- Modify: `src/lib/api/assignments.ts:334-385`
- Modify: `src/lib/api/__tests__/bulkCreateSlotAssignments.test.ts` (create if missing)

**Step 1: Write failing test**

Mock supabase chain to return 1 existing individual, then assert the returned shape includes `preservedIndividuals`.

**Step 2: Run — fail**

**Step 3: Update function signature + body**

```ts
export async function bulkCreateSlotAssignments(params: {
  /* existing */
}): Promise<{
  created: number;
  preservedIndividuals: Array<{
    userId: number;
    displayName: string;
    sessionTitle: string;
  }>;
}> {
  // ... existing group-duplicate check ...

  // Fetch individuals that will be preserved (not touched, just informed)
  const { data: individuals } = await supabase
    .from("session_assignments")
    .select(`
      target_user_id,
      users!session_assignments_target_user_id_fkey(display_name),
      swim_sessions_catalog(name)
    `)
    .eq("training_slot_id", params.trainingSlotId)
    .eq("scheduled_date", params.scheduledDate)
    .not("target_user_id", "is", null);

  // ... existing insert ...

  return {
    created: data?.length ?? 0,
    preservedIndividuals: (individuals ?? []).map((row: any) => ({
      userId: row.target_user_id,
      displayName: row.users?.display_name ?? 'Nageur',
      sessionTitle: row.swim_sessions_catalog?.name ?? 'Séance',
    })),
  };
}
```

**Step 4: Update call sites**

Find all existing callers of `bulkCreateSlotAssignments` (likely 2-3). Update to handle the new return shape (default: ignore `preservedIndividuals`).

**Step 5: Run**

**Step 6: Commit**

```bash
git add src/lib/api/assignments.ts src/lib/api/__tests__/bulkCreateSlotAssignments.test.ts
git commit -m "feat(api): bulkCreateSlotAssignments returns preservedIndividuals (§144)"
```

---

### Task 5.3: Update call sites to show dialog

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx`
- Modify: `src/pages/coach/QuickComposeSheet.tsx` (if it exists — §142)

For each, pass the returned `preservedIndividuals` to a new `PreservedIndividualsDialog` (Task 6.1). Until that dialog exists, `toast.info` with the list is acceptable placeholder.

Separate commit per file.

---

## Phase 6 — UI prompt & badge

### Task 6.1: Create `PreservedIndividualsDialog`

**Files:**
- Create: `src/components/coach/PreservedIndividualsDialog.tsx`

**Step 1: Implement**

```tsx
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupSessionTitle: string;
  groupName: string;
  scheduledDate: string;
  preservedIndividuals: Array<{ userId: number; displayName: string; sessionTitle: string }>;
  onConfirm: () => void;
}

export function PreservedIndividualsDialog({ open, onOpenChange, groupSessionTitle, groupName, scheduledDate, preservedIndividuals, onConfirm }: Props) {
  if (preservedIndividuals.length === 0) {
    // No prompt needed; caller should call onConfirm directly
    return null;
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Séances personnelles préservées</AlertDialogTitle>
          <AlertDialogDescription>
            Tu assignes « {groupSessionTitle} » au groupe {groupName} le {scheduledDate}.
            Les nageurs suivants gardent leur séance personnelle :
            <ul className="mt-3 space-y-1 text-sm">
              {preservedIndividuals.map((i) => (
                <li key={i.userId}>• <strong>{i.displayName}</strong> → « {i.sessionTitle} »</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/coach/PreservedIndividualsDialog.tsx
git commit -m "feat(coach): PreservedIndividualsDialog component (§144)"
```

---

### Task 6.2: Wire dialog in `SlotSessionSheet`

Refactor the "assign from library" flow:
1. Call `bulkCreateSlotAssignments` with `dryRun = false` — actually it's already executed, so we need to either split into dry-run + execute, OR call a new helper that only fetches individuals first.
2. Simpler: add a new `fetchPreservedIndividuals(trainingSlotId, scheduledDate)` helper called BEFORE bulk create. If non-empty, open dialog; on confirm, call bulk create.

Separate commit.

---

### Task 6.3: Wire dialog in `QuickComposeSheet` (§142)

Same pattern. Separate commit.

---

### Task 6.4: Create `IndividualAssignmentBadge`

**Files:**
- Create: `src/components/coach/IndividualAssignmentBadge.tsx`

Simple `<span>` with Tailwind classes: small pill with "Perso" label and user icon. 10 lines.

Commit.

---

### Task 6.5: Wire badge in coach week view slot cards

In `CoachTrainingSlotsScreen.tsx`, when rendering a slot card with `assignment_source === 'individual'`, render `<IndividualAssignmentBadge />` next to the session title. Commit.

---

## Phase 7 — Cleanup (after 1-2 weeks stable)

### Task 7.1: Mark deprecated

**Files:**
- Modify: `src/lib/api/assignments.ts` (functions `resolveSwimmerAssignments`, `resolveSwimmerAssignmentsBatch`)

Add `@deprecated` JSDoc and `console.warn` on first call.

Commit.

---

### Task 7.2: Remove deprecated code

After grace period with no regressions:
1. Verify no callers: `grep -r "resolveSwimmerAssignmentsBatch\|resolveSwimmerAssignments" src/` returns only the definitions.
2. Delete the functions.
3. Remove from `src/lib/api/index.ts` exports.

Commit.

---

## Verification checklist (final UAT)

- [ ] Week of 2026-04-09 : François's personal slots on Thu 18:00 and Fri 18:00 show Elite group sessions.
- [ ] Current week : same behavior.
- [ ] Individual assignment to François on Tue PM, then group assignment Tue PM → dialog lists François; confirm → individual preserved in DB.
- [ ] Delete group session from slot → François's individual assignment unchanged.
- [ ] Declare absence Monday AM → Monday PM session still shows as "expected".
- [ ] Declare whole-day absence Monday → both AM and PM show `is_absent = true`.
- [ ] `npm run test:rls` passes all 12 new cases.
- [ ] `npm test` passes (no regressions).
- [ ] `npx tsc --noEmit` returns 0 errors.

---

## Rollback plan

If a consumer migration breaks production:

1. Revert the consumer's commit (e.g., `git revert <sha>` for Task 4.1).
2. The RPC remains in place, harmless.
3. Old `resolveSwimmerAssignmentsBatch` still works (not deprecated yet in Phase 4).

If the RPC itself is broken:

```sql
DROP FUNCTION IF EXISTS get_swimmer_sessions(integer, date, date, boolean);
```

Then revert frontend commits. Migrations 00128 + 00130 can stay — they are additive, harmless.

---

## Estimated effort

- Phase 1 (migrations) : 2-3 hours
- Phase 2 (RLS tests) : 3-4 hours (seed completeness is the slow part)
- Phase 3 (wrapper) : 30 min
- Phase 4 (5 consumers) : 3-4 hours (1 per consumer incl. manual verify)
- Phase 5 (mutations) : 1-2 hours
- Phase 6 (UI) : 1-2 hours
- Phase 7 (cleanup) : 30 min (deferred 1-2 weeks)

**Total : ~12-16 hours of focused work**, spread over 2-3 sessions.

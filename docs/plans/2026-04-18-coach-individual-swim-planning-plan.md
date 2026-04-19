# Individual Swim Planning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-swimmer granularity (filière + week_type overrides) to the coach swim planning, and replace the cycle-based planning (`training_cycles`/`training_weeks`/`SwimmerPlanningTab`) with the new unified system.

**Architecture:** Three new DB tables hold overrides: `swim_planning_slot_overrides` (per-athlete filière/session on a given slot), `swim_planning_week_meta` (group-level week_type/notes, promoted from localStorage), `swim_planning_week_overrides` (per-athlete week_type/notes). The coach UI `/coach/swim-planning` gets a second-level "swimmer" selector; when active, slots render with visual override affordances and edits write to the override tables. The swimmer view merges group + own overrides with a "Perso" badge. Old cycle tables stay in place for rollback; `SwimmerPlanningTab` is deleted and replaced by `SwimmerPlanningPanel` that reuses the extracted `SwimPlanningTimeline` component.

**Tech Stack:** React 19, TypeScript, Supabase (PostgreSQL + RLS), React Query 5, Tailwind CSS 4, Vitest, framer-motion. UI work delegated to the `frontend-design:frontend-design` skill at task 4.

**Design doc:** `docs/plans/2026-04-18-coach-individual-swim-planning-design.md`

---

## Task 1: DB migration — overrides tables + RLS

**Files:**
- Create: `supabase/migrations/00118_swim_planning_overrides.sql`

**Step 1: Write the migration SQL**

```sql
-- =============================================================================
-- Migration 00118: Swim planning overrides (slot + week) + group week meta
-- Part of §N — replaces training_cycles/training_weeks semantics on top of
-- swim_planning_slots.
-- =============================================================================

-- 1. Group-level week meta (promoted from localStorage in SwimPlanningDemo)
CREATE TABLE IF NOT EXISTS swim_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE INDEX idx_swim_planning_week_meta_group_week
  ON swim_planning_week_meta(group_id, week_start);

-- 2. Per-athlete filière/session override on a given slot
CREATE TABLE IF NOT EXISTS swim_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 5),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE INDEX idx_swim_planning_slot_overrides_athlete_week
  ON swim_planning_slot_overrides(athlete_id, week_start);

-- 3. Per-athlete week_type/notes override
CREATE TABLE IF NOT EXISTS swim_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

CREATE INDEX idx_swim_planning_week_overrides_athlete_week
  ON swim_planning_week_overrides(athlete_id, week_start);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE swim_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE swim_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE swim_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- Mirror swim_planning_slots: everyone authenticated reads, only coach/admin writes.
-- app_user_role() wrapped in (SELECT) to avoid auth_rls_initplan per §124.

CREATE POLICY swim_planning_week_meta_select ON swim_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_meta_insert ON swim_planning_week_meta
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_meta_update ON swim_planning_week_meta
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_meta_delete ON swim_planning_week_meta
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_slot_overrides_select ON swim_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_slot_overrides_insert ON swim_planning_slot_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_slot_overrides_update ON swim_planning_slot_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_slot_overrides_delete ON swim_planning_slot_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_week_overrides_select ON swim_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_overrides_insert ON swim_planning_week_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_overrides_update ON swim_planning_week_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_overrides_delete ON swim_planning_week_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- =============================================================================
-- BACKFILL from training_cycles/training_weeks (athlete-scoped cycles only)
-- =============================================================================
-- For each athlete with training weeks carrying week_type or notes, take the
-- most recently-created cycle's value as authoritative (collision rule).

INSERT INTO swim_planning_week_overrides (athlete_id, week_start, week_type, notes)
SELECT DISTINCT ON (tc.athlete_id, tw.week_start)
  tc.athlete_id, tw.week_start, tw.week_type, tw.notes
FROM training_weeks tw
JOIN training_cycles tc ON tc.id = tw.cycle_id
WHERE tc.athlete_id IS NOT NULL
  AND (tw.week_type IS NOT NULL OR tw.notes IS NOT NULL)
ORDER BY tc.athlete_id, tw.week_start, tc.created_at DESC
ON CONFLICT (athlete_id, week_start) DO NOTHING;

-- Group-scoped cycles (tc.group_id IS NOT NULL) are NOT backfilled: the
-- semantic of "cycle between 2 competitions" does not map cleanly to a
-- timeline-wide "group week_type". Coach can re-enter meaningful values via
-- the new UI.
```

**Step 2: Apply migration via Supabase MCP**

Use the MCP tool to apply it:
```
mcp__plugin_supabase_supabase__apply_migration
  name: 00118_swim_planning_overrides
  query: <contents above>
```

Confirm success: no errors, three new tables visible via `mcp__plugin_supabase_supabase__list_tables` restricted to `public` schema.

**Step 3: Commit**

```bash
git add supabase/migrations/00118_swim_planning_overrides.sql
git commit -m "feat(db): add swim planning overrides tables (slot + week)"
```

---

## Task 2: RLS test — swim_planning_slot_overrides + week_overrides

**Files:**
- Modify: `supabase/tests/schema.sql` — add 3 new tables + policies (mirror prod)
- Modify: `supabase/tests/seed.sql` — add `groups` row + group_members for fixtures
- Create: `supabase/tests/rls/swim_planning_overrides.test.ts`

**Step 1: Check current schema.sql — if `groups` / `swim_planning_slots` not present, add them**

Run: `grep -n "swim_planning" supabase/tests/schema.sql || echo "not present"`

If not present, add minimal tables in `supabase/tests/schema.sql` (after `dim_sessions` block):

```sql
CREATE TABLE public.groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.swim_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL,
  time_slot text NOT NULL,
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);

-- The 3 override tables (mirror migration 00118)
CREATE TABLE public.swim_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE TABLE public.swim_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL,
  time_slot text NOT NULL,
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE TABLE public.swim_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

ALTER TABLE public.swim_planning_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swim_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swim_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swim_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- Policies (mirror migration 00118 + 00071)
CREATE POLICY swim_planning_slots_select ON public.swim_planning_slots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_slots_write ON public.swim_planning_slots
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_week_meta_select ON public.swim_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_meta_write ON public.swim_planning_week_meta
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_slot_overrides_select ON public.swim_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_slot_overrides_write ON public.swim_planning_slot_overrides
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_week_overrides_select ON public.swim_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_overrides_write ON public.swim_planning_week_overrides
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
```

Note: in the test schema we collapse INSERT/UPDATE/DELETE into `FOR ALL` since the test intent is "who can write" — prod splits them for advisor hygiene but the test truth is identical.

Add to `supabase/tests/seed.sql` (append at end):
```sql
INSERT INTO public.groups (id, name) VALUES (1, 'Benjamins');
-- Alice (id=1) already in users seed; attach to group 1 via groups implicit (no group_members table in test schema — not needed for these RLS tests).
```

**Step 2: Write the RLS test**

Create `supabase/tests/rls/swim_planning_overrides.test.ts`:

```ts
/**
 * RLS: swim_planning_slot_overrides + swim_planning_week_overrides
 *
 * Intent:
 *   - Read: everyone authenticated sees everything (like swim_planning_slots).
 *   - Write: only coach/admin. Athletes CANNOT create/update/delete overrides
 *     about themselves (the coach is always the author).
 *   - Regression for §113: DELETE by athlete must be a no-op, not a silent
 *     "success" — assert RETURNING rows are empty when the policy rejects.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" } as const;
const BOB = { appUserId: 2, appUserRole: "athlete" } as const;
const CAROL = { appUserId: 3, appUserRole: "coach" } as const;
const DIANA = { appUserId: 4, appUserRole: "admin" } as const;

beforeAll(async () => {
  await resetDb();
  // Seed: no overrides yet. Tests populate as needed via service role or coach.
});

describe("swim_planning_slot_overrides RLS", () => {
  it("athlete CANNOT insert an override (even for themselves)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO swim_planning_slot_overrides
             (athlete_id, week_start, day_of_week, time_slot, filiere)
           VALUES (1, '2026-05-04', 0, 'morning', 'VMA')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission/i);
  });

  it("coach CAN insert an override for any athlete", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-04', 0, 'morning', 'VMA')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("admin CAN insert an override", async () => {
    await asUser(DIANA, async (c) => {
      await c.query(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (2, '2026-05-04', 0, 'morning', 'Aerobie')`,
      );
    });
  });

  it("athlete sees all overrides (read is global)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        `SELECT athlete_id FROM swim_planning_slot_overrides ORDER BY athlete_id`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete DELETE is a no-op (§113 trap): 0 rows returned, no error", async () => {
    // Precondition: an override exists for Alice
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-11', 1, 'evening', 'Force')
         ON CONFLICT DO NOTHING`,
      );
    });

    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM swim_planning_slot_overrides
         WHERE athlete_id = 1 AND week_start = '2026-05-11'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });

  it("coach CAN delete an override", async () => {
    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM swim_planning_slot_overrides
         WHERE athlete_id = 1 AND week_start = '2026-05-11'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });
});

describe("swim_planning_week_overrides RLS", () => {
  it("coach CAN upsert week_type/notes for any athlete", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO swim_planning_week_overrides
           (athlete_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'Intensif', 'Focus vitesse')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("athlete CANNOT insert their own week override", async () => {
    await expect(
      asUser(BOB, async (c) => {
        await c.query(
          `INSERT INTO swim_planning_week_overrides
             (athlete_id, week_start, week_type)
           VALUES (2, '2026-05-04', 'Recup')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission/i);
  });
});

describe("swim_planning_week_meta RLS", () => {
  it("coach CAN upsert group-level week meta", async () => {
    await asUser(CAROL, async (c) => {
      await c.query(
        `INSERT INTO swim_planning_week_meta
           (group_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'Prepa', 'Charge montante')
         ON CONFLICT (group_id, week_start) DO UPDATE
           SET week_type = excluded.week_type, notes = excluded.notes`,
      );
    });
  });

  it("athlete CANNOT insert group-level week meta", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO swim_planning_week_meta (group_id, week_start, week_type)
           VALUES (1, '2026-05-11', 'Test')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission/i);
  });
});
```

**Step 3: Check Docker is running, then run the RLS tests**

Run: `docker ps >/dev/null 2>&1 && echo "docker ok"`

If not OK: tell the user to start Docker Desktop manually, then wait for confirmation.

If OK: run
```bash
supabase start 2>&1 | tail -5
npm run test:rls
```

Expected: all 8 test cases pass.

**Step 4: Commit**

```bash
git add supabase/tests/schema.sql supabase/tests/seed.sql supabase/tests/rls/swim_planning_overrides.test.ts
git commit -m "test(rls): coverage for swim planning overrides tables"
```

---

## Task 3: Types + API module extension

**Files:**
- Modify: `src/lib/api/types.ts` — add 4 new interfaces
- Modify: `src/lib/api/swim-planning.ts` — add 6 new functions
- Modify: `src/lib/api/index.ts` — re-export new functions

**Step 1: Add types to `src/lib/api/types.ts`**

After the existing `SwimPlanningSlotInput` (line ~935), add:

```ts
// ── Swim Planning Overrides (§N) ──

export interface SwimPlanningSlotOverride {
  id: string;
  athlete_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
  created_at?: string;
}

export interface SwimPlanningSlotOverrideInput {
  athlete_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
}

export interface SwimPlanningWeekMeta {
  id: string;
  group_id: number;
  week_start: string;
  week_type: string | null;
  notes: string | null;
  updated_at?: string;
}

export interface SwimPlanningWeekMetaInput {
  group_id: number;
  week_start: string;
  week_type?: string | null;
  notes?: string | null;
}

export interface SwimPlanningWeekOverride {
  id: string;
  athlete_id: number;
  week_start: string;
  week_type: string | null;
  notes: string | null;
  updated_at?: string;
}

export interface SwimPlanningWeekOverrideInput {
  athlete_id: number;
  week_start: string;
  week_type?: string | null;
  notes?: string | null;
}
```

**Step 2: Extend `src/lib/api/swim-planning.ts`**

Append to the existing file:

```ts
import type {
  SwimPlanningSlotOverride,
  SwimPlanningSlotOverrideInput,
  SwimPlanningWeekMeta,
  SwimPlanningWeekMetaInput,
  SwimPlanningWeekOverride,
  SwimPlanningWeekOverrideInput,
} from "./types";

// ── Slot overrides ──

export async function getSwimPlanningSlotOverrides(opts: {
  athleteId: number;
  weekStarts: string[];
}): Promise<SwimPlanningSlotOverride[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const { data, error } = await supabase
    .from("swim_planning_slot_overrides")
    .select("*")
    .eq("athlete_id", opts.athleteId)
    .in("week_start", opts.weekStarts)
    .order("week_start")
    .order("day_of_week")
    .order("time_slot");
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimPlanningSlotOverride[];
}

export async function upsertSwimPlanningSlotOverride(
  input: SwimPlanningSlotOverrideInput,
): Promise<SwimPlanningSlotOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("swim_planning_slot_overrides")
    .upsert(input, {
      onConflict: "athlete_id,week_start,day_of_week,time_slot",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimPlanningSlotOverride;
}

export async function deleteSwimPlanningSlotOverride(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  // Use RETURNING id to detect §113-style silent no-op.
  const { data, error } = await supabase
    .from("swim_planning_slot_overrides")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Override not found or not allowed to delete");
  }
}

// ── Week meta (group) ──

export async function getSwimPlanningWeekMeta(opts: {
  groupId: number;
  weekStarts: string[];
}): Promise<SwimPlanningWeekMeta[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const { data, error } = await supabase
    .from("swim_planning_week_meta")
    .select("*")
    .eq("group_id", opts.groupId)
    .in("week_start", opts.weekStarts);
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimPlanningWeekMeta[];
}

export async function upsertSwimPlanningWeekMeta(
  input: SwimPlanningWeekMetaInput,
): Promise<SwimPlanningWeekMeta> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("swim_planning_week_meta")
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: "group_id,week_start" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimPlanningWeekMeta;
}

// ── Week overrides (athlete) ──

export async function getSwimPlanningWeekOverrides(opts: {
  athleteId: number;
  weekStarts: string[];
}): Promise<SwimPlanningWeekOverride[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const { data, error } = await supabase
    .from("swim_planning_week_overrides")
    .select("*")
    .eq("athlete_id", opts.athleteId)
    .in("week_start", opts.weekStarts);
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimPlanningWeekOverride[];
}

export async function upsertSwimPlanningWeekOverride(
  input: SwimPlanningWeekOverrideInput,
): Promise<SwimPlanningWeekOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("swim_planning_week_overrides")
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id,week_start" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimPlanningWeekOverride;
}
```

**Step 3: Re-export in `src/lib/api/index.ts`**

Find the existing line `getSwimPlanningSlots, upsertSwimPlanningSlot, deleteSwimPlanningSlot,` and add below it:

```ts
  getSwimPlanningSlotOverrides,
  upsertSwimPlanningSlotOverride,
  deleteSwimPlanningSlotOverride,
  getSwimPlanningWeekMeta,
  upsertSwimPlanningWeekMeta,
  getSwimPlanningWeekOverrides,
  upsertSwimPlanningWeekOverride,
```

**Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors in `src/components/dashboard/*.stories.tsx` are allowed per `MEMORY.md`).

**Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/swim-planning.ts src/lib/api/index.ts
git commit -m "feat(api): swim planning overrides (slot + week) + group week meta"
```

---

## Task 4: Merge helper + unit tests (TDD)

**Files:**
- Create: `src/lib/swimPlanningMerge.ts`
- Create: `src/lib/__tests__/swimPlanningMerge.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/__tests__/swimPlanningMerge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeSlots, mergeWeekMeta } from "@/lib/swimPlanningMerge";
import type {
  SwimPlanningSlot,
  SwimPlanningSlotOverride,
  SwimPlanningWeekMeta,
  SwimPlanningWeekOverride,
} from "@/lib/api/types";

const baseSlot = (partial: Partial<SwimPlanningSlot>): SwimPlanningSlot => ({
  id: "g1",
  group_id: 1,
  week_start: "2026-05-04",
  day_of_week: 0,
  time_slot: "morning",
  filiere: "Aerobie",
  session_id: null,
  ...partial,
});

const baseOverride = (
  partial: Partial<SwimPlanningSlotOverride>,
): SwimPlanningSlotOverride => ({
  id: "o1",
  athlete_id: 1,
  week_start: "2026-05-04",
  day_of_week: 0,
  time_slot: "morning",
  filiere: "VMA",
  session_id: null,
  ...partial,
});

describe("mergeSlots", () => {
  it("returns group slots unchanged when no overrides", () => {
    const groupSlots = [baseSlot({}), baseSlot({ id: "g2", day_of_week: 1 })];
    const result = mergeSlots(groupSlots, []);
    expect(result).toHaveLength(2);
    expect(result.every((s) => !s.overridden)).toBe(true);
  });

  it("replaces group slot with matching override", () => {
    const groupSlots = [baseSlot({})];
    const overrides = [baseOverride({})];
    const result = mergeSlots(groupSlots, overrides);
    expect(result).toHaveLength(1);
    expect(result[0].filiere).toBe("VMA");
    expect(result[0].overridden).toBe(true);
    expect(result[0].overrideId).toBe("o1");
  });

  it("adds override-only slot (group has no slot on that day)", () => {
    const groupSlots: SwimPlanningSlot[] = [];
    const overrides = [baseOverride({})];
    const result = mergeSlots(groupSlots, overrides);
    expect(result).toHaveLength(1);
    expect(result[0].overridden).toBe(true);
  });

  it("keeps non-overridden group slots alongside overridden ones", () => {
    const groupSlots = [
      baseSlot({ id: "g1", day_of_week: 0 }),
      baseSlot({ id: "g2", day_of_week: 1 }),
    ];
    const overrides = [baseOverride({ day_of_week: 0 })];
    const result = mergeSlots(groupSlots, overrides);
    const day0 = result.find((s) => s.day_of_week === 0);
    const day1 = result.find((s) => s.day_of_week === 1);
    expect(day0?.overridden).toBe(true);
    expect(day1?.overridden).toBeFalsy();
  });

  it("uses override session_id when provided", () => {
    const groupSlots = [baseSlot({ session_id: "sess-group" })];
    const overrides = [baseOverride({ session_id: "sess-custom" })];
    const result = mergeSlots(groupSlots, overrides);
    expect(result[0].session_id).toBe("sess-custom");
  });
});

describe("mergeWeekMeta", () => {
  const groupMeta: SwimPlanningWeekMeta = {
    id: "gm1",
    group_id: 1,
    week_start: "2026-05-04",
    week_type: "Prepa",
    notes: "Groupe notes",
  };
  const athleteOverride: SwimPlanningWeekOverride = {
    id: "ao1",
    athlete_id: 1,
    week_start: "2026-05-04",
    week_type: "Intensif",
    notes: "Personnel",
  };

  it("returns none when nothing is set", () => {
    const result = mergeWeekMeta(null, null);
    expect(result).toEqual({ week_type: null, notes: null, source: "none" });
  });

  it("returns group meta when no athlete override", () => {
    const result = mergeWeekMeta(groupMeta, null);
    expect(result).toEqual({
      week_type: "Prepa",
      notes: "Groupe notes",
      source: "group",
    });
  });

  it("athlete override takes precedence over group", () => {
    const result = mergeWeekMeta(groupMeta, athleteOverride);
    expect(result).toEqual({
      week_type: "Intensif",
      notes: "Personnel",
      source: "athlete",
    });
  });

  it("athlete override with null week_type still marks source=athlete", () => {
    const result = mergeWeekMeta(groupMeta, {
      ...athleteOverride,
      week_type: null,
      notes: null,
    });
    expect(result.source).toBe("athlete");
    expect(result.week_type).toBeNull();
  });
});
```

**Step 2: Run the tests — expect failure**

Run: `npx vitest run src/lib/__tests__/swimPlanningMerge.test.ts`
Expected: tests fail because `@/lib/swimPlanningMerge` does not exist.

**Step 3: Write the minimal implementation**

Create `src/lib/swimPlanningMerge.ts`:

```ts
import type {
  SwimPlanningSlot,
  SwimPlanningSlotOverride,
  SwimPlanningWeekMeta,
  SwimPlanningWeekOverride,
} from "@/lib/api/types";

export interface EffectiveSlot {
  id: string;
  group_id?: number;
  athlete_id?: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
  overridden?: boolean;
  overrideId?: string;
}

export interface EffectiveWeekMeta {
  week_type: string | null;
  notes: string | null;
  source: "group" | "athlete" | "none";
}

function slotKey(s: {
  week_start: string;
  day_of_week: number;
  time_slot: string;
}): string {
  return `${s.week_start}|${s.day_of_week}|${s.time_slot}`;
}

export function mergeSlots(
  groupSlots: SwimPlanningSlot[],
  athleteOverrides: SwimPlanningSlotOverride[],
): EffectiveSlot[] {
  const overrideMap = new Map<string, SwimPlanningSlotOverride>();
  for (const o of athleteOverrides) overrideMap.set(slotKey(o), o);

  const result: EffectiveSlot[] = [];
  const seen = new Set<string>();

  for (const g of groupSlots) {
    const k = slotKey(g);
    seen.add(k);
    const ov = overrideMap.get(k);
    if (ov) {
      result.push({
        id: g.id,
        group_id: g.group_id,
        week_start: g.week_start,
        day_of_week: g.day_of_week,
        time_slot: g.time_slot,
        filiere: ov.filiere,
        session_id: ov.session_id ?? null,
        overridden: true,
        overrideId: ov.id,
      });
    } else {
      result.push({
        id: g.id,
        group_id: g.group_id,
        week_start: g.week_start,
        day_of_week: g.day_of_week,
        time_slot: g.time_slot,
        filiere: g.filiere,
        session_id: g.session_id ?? null,
      });
    }
  }

  // Override-only slots (group has no slot there)
  for (const o of athleteOverrides) {
    const k = slotKey(o);
    if (seen.has(k)) continue;
    result.push({
      id: o.id,
      athlete_id: o.athlete_id,
      week_start: o.week_start,
      day_of_week: o.day_of_week,
      time_slot: o.time_slot,
      filiere: o.filiere,
      session_id: o.session_id ?? null,
      overridden: true,
      overrideId: o.id,
    });
  }

  return result;
}

export function mergeWeekMeta(
  groupMeta: SwimPlanningWeekMeta | null,
  athleteOverride: SwimPlanningWeekOverride | null,
): EffectiveWeekMeta {
  if (athleteOverride) {
    return {
      week_type: athleteOverride.week_type ?? null,
      notes: athleteOverride.notes ?? null,
      source: "athlete",
    };
  }
  if (groupMeta) {
    return {
      week_type: groupMeta.week_type ?? null,
      notes: groupMeta.notes ?? null,
      source: "group",
    };
  }
  return { week_type: null, notes: null, source: "none" };
}
```

**Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/__tests__/swimPlanningMerge.test.ts`
Expected: all 9 tests pass.

**Step 5: Commit**

```bash
git add src/lib/swimPlanningMerge.ts src/lib/__tests__/swimPlanningMerge.test.ts
git commit -m "feat(lib): pure merge helper for swim planning group + athlete overrides"
```

---

## Task 5: Refactor — extract SwimPlanningTimeline component (non-functional)

**Files:**
- Create: `src/components/coach/swim/SwimPlanningTimeline.tsx`
- Modify: `src/pages/coach/SwimPlanningDemo.tsx` — use the extracted component

**Goal:** No behavior change. Take the JSX rendering semaines + grille jour × créneau + chips filière out of `SwimPlanningDemo` and put it in `SwimPlanningTimeline` with props. Checkpoint before functional changes in task 6.

**Step 1: Identify the JSX block to extract**

Read `src/pages/coach/SwimPlanningDemo.tsx` thoroughly. The timeline starts around line 700 (weeks.map) and ends at the closing of the motion.div for weeks. Preserve:
- Props contract: `weeks`, `slotsByWeek`, `competitionsByWeek`, `expandedWeekKey`, `onToggleWeek`, `editingWeekKey`, `editWeekType`, `editWeekNotes`, `existingWeekTypes`, `onStartEditMeta`, `onSaveMeta`, `onCancelEditMeta`, `onEditTypeChange`, `onEditNotesChange`, `onSlotClick`, `onSessionPickerClick`, `onCompetitionClick`, `getWeekMeta`, `getDayCompetitions`, `sessionNameMap`, `sentinelRef`, `mode` (new, default `"group"`), `overriddenIds` (optional Set for mode=athlete).

**Step 2: Create `src/components/coach/swim/SwimPlanningTimeline.tsx`**

```tsx
/**
 * SwimPlanningTimeline — Shared timeline view for swim planning (coach & athlete).
 * Extracted from SwimPlanningDemo (§N) to avoid duplication with SwimPlanningAthleteView.
 *
 * In mode "group": renders group slots, editing callbacks active.
 * In mode "athlete": renders effective slots (merged), overridden ones carry
 *   visual affordance via `overriddenSlotIds`.
 */
import type { ReactNode } from "react";
// ...import the subset of deps needed from SwimPlanningDemo
// (Badge, FILIERES, FILIERE_STYLES, weekTypeColor, motion, framer-motion, Competition type, etc.)

export interface SwimPlanningTimelineProps {
  mode: "group" | "athlete";
  weeks: WeekInfo[];
  slotsByWeek: Map<string, EffectiveSlot[]>; // EffectiveSlot has overridden?, overrideId?
  competitionsByWeek: Map<string, Competition[]>;
  expandedWeekKey: string | null;
  onToggleWeek: (weekKey: string) => void;
  getWeekMeta: (weekKey: string) => { weekType?: string; notes?: string; source?: "group" | "athlete" | "none" };
  editingWeekKey: string | null;
  editWeekType: string;
  editWeekNotes: string;
  existingWeekTypes: string[];
  onStartEditMeta: (weekKey: string, e: React.MouseEvent) => void;
  onSaveMeta: () => void;
  onCancelEditMeta: () => void;
  onEditTypeChange: (v: string) => void;
  onEditNotesChange: (v: string) => void;
  onSlotClick: (weekKey: string, dayIndex: number, timeSlot: "morning" | "evening", slot?: EffectiveSlot) => void;
  onSessionPickerClick?: (weekKey: string, dayIndex: number, timeSlot: "morning" | "evening", currentSessionId?: string | null) => void;
  onCompetitionClick?: (c: Competition) => void;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  sessionNameMap: Map<string, string>;
  sentinelRef?: React.RefObject<HTMLDivElement>;
  readOnly?: boolean;
  showOverrideBadge?: boolean; // default: mode === "athlete"
}

export default function SwimPlanningTimeline(props: SwimPlanningTimelineProps): ReactNode {
  // Move here the exact JSX that currently lives in SwimPlanningDemo
  // from the weeks.map(...) block. No logic changes.
  // ...
}
```

The implementation is a mechanical move. Key visual hooks to add for future task 6 (but wired minimally here):
- When `slot.overridden === true && props.showOverrideBadge`: wrap the filière chip with a dashed border (`ring-2 ring-dashed ring-primary/50`) and a small avatar icon.
- The badge logic is scaffolded but works even in mode "group" (no overridden flag will be true there).

**Step 3: Update `SwimPlanningDemo.tsx` to use the extracted component**

Replace the inline timeline JSX with:

```tsx
<SwimPlanningTimeline
  mode="group"
  weeks={weeks}
  slotsByWeek={slotsByWeek as Map<string, EffectiveSlot[]>}
  // ... all the props
/>
```

Since `SwimPlanningDemo` currently has `slotsByWeek: Map<string, SwimPlanningSlot[]>`, cast is safe (EffectiveSlot is a superset). In task 6 we'll properly compute merged slots.

**Step 4: Type-check + visual smoke test**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run dev` and open `/coach/swim-planning`. Verify the page renders identically to before (same weeks, filière chips, editing flows work).

**Step 5: Commit**

```bash
git add src/components/coach/swim/SwimPlanningTimeline.tsx src/pages/coach/SwimPlanningDemo.tsx
git commit -m "refactor(coach): extract SwimPlanningTimeline shared component"
```

**Step 6: Update the file size table in `CLAUDE.md`**

Run `wc -l` on both files and update the "Fichiers clés" table:
- `SwimPlanningDemo.tsx` — new size (should be ~800-900 LOC instead of 1462)
- Add `src/components/coach/swim/SwimPlanningTimeline.tsx` — new file with measured LOC

Commit the CLAUDE.md update separately:

```bash
git add CLAUDE.md
git commit -m "docs(claude): update file sizes after SwimPlanningTimeline extraction"
```

---

## Task 6: Coach `/coach/swim-planning` — swimmer selector + override mode

**Files:**
- Modify: `src/pages/coach/SwimPlanningDemo.tsx`
- Modify: `src/components/coach/swim/SwimPlanningTimeline.tsx` (visual affordance for overridden slots)

**This is the visual-heavy task. INVOKE `frontend-design:frontend-design` skill before writing the final UI.**

**Step 1: Invoke the frontend-design skill**

Open a fresh subagent with the frontend-design skill, brief it:
> "Add a second-level swimmer dropdown to the header of `/coach/swim-planning` (React 19 + Tailwind 4 + Radix UI/Shadcn). Context: existing header has a group selector + two buttons. The new selector must sit next to the group selector, peuple les nageurs du groupe sélectionné, avec option par défaut 'Plan du groupe'. Quand un nageur est actif, un bandeau discret s'affiche: avatar + nom + bouton 'Retour plan groupe'. Les slots overridden doivent se distinguer visuellement des slots hérités (suggéré: bordure pointillée + mini icône utilisateur en haut à droite). Les slots hérités en mode nageur = teinte atténuée (opacity-70?) pour affordance 'clique pour override'. Produire uniquement le JSX + Tailwind classes, pas la logique state."

Apply the returned styles.

**Step 2: Add swimmer selector state and URL sync**

In `SwimPlanningDemo`, add:

```tsx
// Athletes of selected group
const { data: allAthletes = [] } = useQuery({
  queryKey: ["athletes"],
  queryFn: () => api.getAthletes(),
});
const groupAthletes = useMemo(
  () => allAthletes.filter((a) => a.group_id === selectedGroupId),
  [allAthletes, selectedGroupId],
);

// Selected athlete (null = group mode). URL param ?athlete=<id>.
const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(() => {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const raw = params.get("athlete");
  return raw ? Number(raw) : null;
});

useEffect(() => {
  const [path, qs] = window.location.hash.split("?");
  const params = new URLSearchParams(qs ?? "");
  if (selectedAthleteId) {
    params.set("athlete", String(selectedAthleteId));
  } else {
    params.delete("athlete");
  }
  const next = params.toString();
  window.history.replaceState(null, "", next ? `${path}?${next}` : path);
}, [selectedAthleteId]);

const selectedAthlete = useMemo(
  () => groupAthletes.find((a) => a.id === selectedAthleteId) ?? null,
  [groupAthletes, selectedAthleteId],
);
```

**Step 3: Fetch overrides + week meta in parallel with slots**

```tsx
const { data: slotOverrides = [] } = useQuery({
  queryKey: ["swim-planning-slot-overrides", selectedAthleteId, visibleWeekKeys],
  queryFn: () =>
    api.getSwimPlanningSlotOverrides({
      athleteId: selectedAthleteId!,
      weekStarts: visibleWeekKeys,
    }),
  enabled: selectedAthleteId != null && visibleWeekKeys.length > 0,
});

const { data: groupWeekMeta = [] } = useQuery({
  queryKey: ["swim-planning-week-meta", selectedGroupId, visibleWeekKeys],
  queryFn: () =>
    api.getSwimPlanningWeekMeta({
      groupId: selectedGroupId!,
      weekStarts: visibleWeekKeys,
    }),
  enabled: !!selectedGroupId && visibleWeekKeys.length > 0,
});

const { data: athleteWeekOverrides = [] } = useQuery({
  queryKey: ["swim-planning-week-overrides", selectedAthleteId, visibleWeekKeys],
  queryFn: () =>
    api.getSwimPlanningWeekOverrides({
      athleteId: selectedAthleteId!,
      weekStarts: visibleWeekKeys,
    }),
  enabled: selectedAthleteId != null && visibleWeekKeys.length > 0,
});
```

**Step 4: Compute effective slots + effective week meta per week**

```tsx
const effectiveSlotsByWeek = useMemo(() => {
  if (!selectedAthleteId) {
    return slotsByWeek as Map<string, EffectiveSlot[]>;
  }
  const map = new Map<string, EffectiveSlot[]>();
  for (const w of visibleWeekKeys) {
    const groupWeekSlots = slotsByWeek.get(w) ?? [];
    const weekOverrides = slotOverrides.filter((o) => o.week_start === w);
    map.set(w, mergeSlots(groupWeekSlots, weekOverrides));
  }
  return map;
}, [slotsByWeek, slotOverrides, selectedAthleteId, visibleWeekKeys]);

const getEffectiveWeekMeta = useCallback(
  (weekKey: string) => {
    const g = groupWeekMeta.find((m) => m.week_start === weekKey) ?? null;
    const a = selectedAthleteId
      ? athleteWeekOverrides.find((o) => o.week_start === weekKey) ?? null
      : null;
    return mergeWeekMeta(g, a);
  },
  [groupWeekMeta, athleteWeekOverrides, selectedAthleteId],
);
```

**Step 5: Route slot edits to the right write path**

In the filière sheet save handler:

```tsx
const handleSelectFiliere = (filiereId: string) => {
  if (!filiereSheet || !selectedGroupId) return;

  if (selectedAthleteId) {
    upsertOverrideMutation.mutate({
      athlete_id: selectedAthleteId,
      week_start: filiereSheet.weekKey,
      day_of_week: filiereSheet.dayIndex,
      time_slot: filiereSheet.timeSlot,
      filiere: filiereId,
      session_id: filiereSheet.existingSlot?.session_id ?? null,
    });
  } else {
    // existing group upsert
    upsertMutation.mutate({ /* ... */ });
  }
};

const handleDeleteSlot = () => {
  if (!filiereSheet?.existingSlot) return;
  if (selectedAthleteId && filiereSheet.existingSlot.overridden && filiereSheet.existingSlot.overrideId) {
    deleteOverrideMutation.mutate(filiereSheet.existingSlot.overrideId);
  } else if (!selectedAthleteId) {
    deleteMutation.mutate(filiereSheet.existingSlot.id);
  }
  // If athlete mode and not overridden: the "delete" button is hidden (no group write from athlete mode)
};
```

Add the new mutations:

```tsx
const upsertOverrideMutation = useMutation({
  mutationFn: (input: SwimPlanningSlotOverrideInput) =>
    api.upsertSwimPlanningSlotOverride(input),
  onSuccess: () => {
    setFiliereSheet(null);
    void queryClient.invalidateQueries({ queryKey: ["swim-planning-slot-overrides"] });
  },
  onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
});

const deleteOverrideMutation = useMutation({
  mutationFn: (id: string) => api.deleteSwimPlanningSlotOverride(id),
  onSuccess: () => {
    setFiliereSheet(null);
    void queryClient.invalidateQueries({ queryKey: ["swim-planning-slot-overrides"] });
  },
  onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
});
```

**Step 6: Route week_type edits**

The current `setWeekMeta`/`getWeekMeta` use localStorage. Replace with DB-backed mutations:

```tsx
const upsertGroupMetaMutation = useMutation({
  mutationFn: (input: SwimPlanningWeekMetaInput) =>
    api.upsertSwimPlanningWeekMeta(input),
  onSuccess: () => {
    setEditingWeekKey(null);
    void queryClient.invalidateQueries({ queryKey: ["swim-planning-week-meta"] });
  },
});

const upsertAthleteWeekOverrideMutation = useMutation({
  mutationFn: (input: SwimPlanningWeekOverrideInput) =>
    api.upsertSwimPlanningWeekOverride(input),
  onSuccess: () => {
    setEditingWeekKey(null);
    void queryClient.invalidateQueries({ queryKey: ["swim-planning-week-overrides"] });
  },
});

const handleSaveMeta = () => {
  if (!editingWeekKey) return;
  const week_type = editWeekType.trim() || null;
  const notes = editWeekNotes.trim() || null;
  if (selectedAthleteId) {
    upsertAthleteWeekOverrideMutation.mutate({
      athlete_id: selectedAthleteId,
      week_start: editingWeekKey,
      week_type,
      notes,
    });
  } else if (selectedGroupId) {
    upsertGroupMetaMutation.mutate({
      group_id: selectedGroupId,
      week_start: editingWeekKey,
      week_type,
      notes,
    });
  }
};
```

Keep the old `getWeekMeta`/`setWeekMeta` helpers deleted (or left unused — clean them up).

**Step 7: Add the swimmer dropdown to the header**

Using Shadcn `Select`:

```tsx
<Select
  value={selectedAthleteId ? String(selectedAthleteId) : "__group__"}
  onValueChange={(v) => setSelectedAthleteId(v === "__group__" ? null : Number(v))}
>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Plan du groupe" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="__group__">Plan du groupe</SelectItem>
    {groupAthletes.map((a) => (
      <SelectItem key={a.id} value={String(a.id)}>{a.first_name} {a.last_name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Use the styling returned by frontend-design. Add the bandeau d'état rendered conditionally when `selectedAthlete` is truthy.

**Step 8: Pass `mode` + effective slots to `SwimPlanningTimeline`**

```tsx
<SwimPlanningTimeline
  mode={selectedAthleteId ? "athlete" : "group"}
  slotsByWeek={effectiveSlotsByWeek}
  getWeekMeta={(weekKey) => {
    const m = getEffectiveWeekMeta(weekKey);
    return { weekType: m.week_type ?? undefined, notes: m.notes ?? undefined, source: m.source };
  }}
  showOverrideBadge={selectedAthleteId != null}
  {/* ...rest */}
/>
```

**Step 9: Visual smoke test**

`npm run dev`, open `/coach/swim-planning`:
- Default: no swimmer selected → identical to before (regression check).
- Select a swimmer → banner appears, slots render normally, click a slot → filière sheet → pick new filière → chip updates with dashed border.
- Long-press / "..." on an overridden slot → "Retirer l'override" is visible and works.
- Switch back to "Plan du groupe" → overrides gone from view, group plan visible.
- Edit week_type in group mode → saved to DB (refresh the page, value persists).
- Edit week_type in athlete mode → saved to DB under athlete override.

**Step 10: Commit**

```bash
git add src/pages/coach/SwimPlanningDemo.tsx src/components/coach/swim/SwimPlanningTimeline.tsx
git commit -m "feat(coach): per-swimmer granularity in /coach/swim-planning"
```

---

## Task 7: Replace `SwimmerPlanningTab` with `SwimmerPlanningPanel`

**Files:**
- Create: `src/pages/coach/SwimmerPlanningPanel.tsx`
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx`
- Delete: `src/pages/coach/SwimmerPlanningTab.tsx`

**Step 1: Create `SwimmerPlanningPanel`**

```tsx
/**
 * SwimmerPlanningPanel — Coach's inline swimmer planning panel on the
 * swimmer detail page. Reuses SwimPlanningTimeline in athlete mode, scoped
 * to the athlete (group + athlete locked).
 *
 * Replaces the old cycle-based SwimmerPlanningTab (§N).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
// Reuse the swim-planning page's core by importing the same fetch hooks OR
// copy the minimal set needed here. Cleanest: factor the "one-athlete timeline"
// into a smaller wrapper that SwimPlanningDemo also uses.

interface Props {
  athleteId: number;
}

export default function SwimmerPlanningPanel({ athleteId }: Props) {
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });
  const athlete = athletes.find((a) => a.id === athleteId);
  const groupId = athlete?.group_id ?? null;

  if (!groupId) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce nageur n'est pas rattaché à un groupe — impossible d'afficher le planning.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Overrides filière et type de semaine pour ce nageur uniquement.
        </p>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/coach/swim-planning?athlete=${athleteId}`}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Plein écran
          </Link>
        </Button>
      </div>
      {/* Render the timeline scoped to this athlete. Reuse the same hooks as
          SwimPlanningDemo but lock athleteId + groupId — consider factoring
          a <ScopedSwimPlanningTimeline athleteId groupId /> if the state
          duplication gets heavy. */}
      <ScopedSwimPlanningTimeline athleteId={athleteId} groupId={groupId} />
    </div>
  );
}
```

The implementation decision: create a small inline wrapper component `ScopedSwimPlanningTimeline` inside this file (or in a new file `src/components/coach/swim/ScopedSwimPlanningTimeline.tsx`) that encapsulates:
- All the queries from task 6 parameterized by `athleteId` + `groupId`.
- Passes `mode="athlete"` and `showOverrideBadge` to `SwimPlanningTimeline`.
- Renders a **shorter** default window (e.g. current week + 6 ahead) since we're embedded.

This is a bit of duplication with `SwimPlanningDemo` that we accept — extracting into a third shared component is risk for this PR.

**Step 2: Swap `SwimmerPlanningTab` out of `CoachSwimmerDetail.tsx`**

```tsx
// before
import SwimmerPlanningTab from "./SwimmerPlanningTab";
// ...
<SwimmerPlanningTab athleteId={athleteId} />

// after
import SwimmerPlanningPanel from "./SwimmerPlanningPanel";
// ...
<SwimmerPlanningPanel athleteId={athleteId} />
```

Also update the `Collapsible` section title from "Macro-cycles" to something truthful like "Planification natation" and swap the icon if you want.

**Step 3: Delete `SwimmerPlanningTab.tsx`**

Run: `git rm src/pages/coach/SwimmerPlanningTab.tsx`

**Step 4: Type-check + visual smoke test**

```bash
npx tsc --noEmit
npm run dev
```

Open `/#/coach/swimmers/<id>` → onglet Planification. Should now render the new panel with the swim planning timeline scoped to this swimmer. Deep link button should jump to `/coach/swim-planning?athlete=<id>` with that athlete pre-selected.

**Step 5: Commit**

```bash
git add src/pages/coach/SwimmerPlanningPanel.tsx src/pages/coach/CoachSwimmerDetail.tsx
git commit -m "feat(coach): replace cycle-based SwimmerPlanningTab with SwimmerPlanningPanel"
```

---

## Task 8: Swimmer view — merge overrides + badge in `SwimPlanningAthleteView`

**Files:**
- Modify: `src/pages/coach/SwimPlanningAthleteView.tsx`

**Step 1: Add queries for athlete's own overrides**

Using `useAuth()` (already imported) to get `user.id`:

```tsx
const { user } = useAuth();
const me = user?.appUserId ?? null;

const { data: myOverrides = [] } = useQuery({
  queryKey: ["swim-planning-slot-overrides", me, visibleWeekKeys],
  queryFn: () => api.getSwimPlanningSlotOverrides({ athleteId: me!, weekStarts: visibleWeekKeys }),
  enabled: me != null && visibleWeekKeys.length > 0,
});

const { data: groupWeekMeta = [] } = useQuery({
  queryKey: ["swim-planning-week-meta", groupId, visibleWeekKeys],
  queryFn: () => api.getSwimPlanningWeekMeta({ groupId: groupId!, weekStarts: visibleWeekKeys }),
  enabled: groupId != null && visibleWeekKeys.length > 0,
});

const { data: myWeekOverrides = [] } = useQuery({
  queryKey: ["swim-planning-week-overrides", me, visibleWeekKeys],
  queryFn: () => api.getSwimPlanningWeekOverrides({ athleteId: me!, weekStarts: visibleWeekKeys }),
  enabled: me != null && visibleWeekKeys.length > 0,
});
```

**Step 2: Apply the merge**

```tsx
const effectiveSlotsByWeek = useMemo(() => {
  const map = new Map<string, EffectiveSlot[]>();
  for (const w of visibleWeekKeys) {
    const groupSlots = slotsByWeek.get(w) ?? [];
    const overrides = myOverrides.filter((o) => o.week_start === w);
    map.set(w, mergeSlots(groupSlots, overrides));
  }
  return map;
}, [slotsByWeek, myOverrides, visibleWeekKeys]);

const getEffectiveWeekMeta = useCallback(
  (weekKey: string) => {
    const g = groupWeekMeta.find((m) => m.week_start === weekKey) ?? null;
    const a = myWeekOverrides.find((o) => o.week_start === weekKey) ?? null;
    return mergeWeekMeta(g, a);
  },
  [groupWeekMeta, myWeekOverrides],
);
```

**Step 3: Add the "Perso" badge**

In the slot chip render block, if `slot.overridden === true`:
```tsx
<Badge variant="outline" className="h-4 px-1 text-[9px] border-primary/40 text-primary">
  Perso
</Badge>
```
Plus a tooltip (Shadcn `Tooltip` or a simple `title="Personnalisé par ton coach"`).

Similarly for `week_type` rendering: if `getEffectiveWeekMeta(w.weekKey).source === "athlete"`, show the badge next to the week_type text.

**Step 4: Ideally: reuse `SwimPlanningTimeline` here too**

If `SwimPlanningAthleteView` currently duplicates a lot of the timeline JSX with `SwimPlanningDemo`, now's the cleanest moment to swap it out. Decision lever:
- If it's a 10-line swap → do it.
- If it requires rewriting a lot (e.g. the athlete view has unique behaviors like filière info sheets with technicals, which the coach view doesn't) → keep the old render path for now, just inject merged data. Extract in a later cleanup patch.

**Recommended**: just inject the merged data for this PR. The `SwimPlanningTimeline` reuse is achievable but it's risk you don't need to take here.

**Step 5: Visual smoke test**

Log in as a swimmer (or use dev impersonation). Navigate to `/#/suivi/planification`. Verify:
- The plan renders correctly.
- If the swimmer has overrides, the filière chip shows the overridden value with a "Perso" badge.
- If the swimmer has a week_type override, the week header shows it with the badge.
- Tooltip on the badge says "Personnalisé par ton coach".

**Step 6: Commit**

```bash
git add src/pages/coach/SwimPlanningAthleteView.tsx
git commit -m "feat(swimmer): merge own swim planning overrides + Perso badge"
```

---

## Task 9: Documentation — implementation-log, ROADMAP, CLAUDE.md

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/FEATURES_STATUS.md`
- Modify: `CLAUDE.md`

**Step 1: Add entry in `docs/implementation-log.md`**

Append a new `§N` section (N = next after §135) with the standard template:
- Date
- Contexte
- Changements (bullet list: 3 migrations, API, merge helper, timeline extraction, coach UI, swimmer panel, athlete view badge)
- Fichiers modifiés (chaque fichier avec LOC)
- Tests (unit merge + RLS overrides)
- Décisions (tables dédiées vs extension de swim_planning_slots ; training_cycles kept for rollback)
- Limites (stages/groupes temporaires non pris en charge ; cycles tables à dropper plus tard)

**Step 2: Update `docs/ROADMAP.md`**

- Add the "*Dernière mise à jour*" line at top.
- Add a row to the futures table: `| 100 | Granularité planif natation par nageur + retrait cycles | Haute | Fait (§N) |`

**Step 3: Update `docs/FEATURES_STATUS.md`**

Flip the "Planification cycle" feature to retired and "Planification par nageur" to ✅.

**Step 4: Update `CLAUDE.md`**

Fichiers clés : update the rows for:
- `SwimPlanningDemo.tsx` (new LOC after extraction + task 6 additions)
- `SwimPlanningAthleteView.tsx` (new LOC after merge + badge)
- Add `src/components/coach/swim/SwimPlanningTimeline.tsx` (new file)
- Add `src/pages/coach/SwimmerPlanningPanel.tsx` (replaces SwimmerPlanningTab)
- Add `src/lib/swimPlanningMerge.ts`
- Remove `SwimmerPlanningTab.tsx` line
- Update `src/lib/api/swim-planning.ts` LOC

Chantiers futurs table : update to `Dernière entrée en date : §N` and add the new row.

**Step 5: Run all tests one final time**

```bash
npx tsc --noEmit
npm test -- --run src/lib/__tests__/swimPlanningMerge.test.ts
docker ps >/dev/null && npm run test:rls
```
Expected: all green (except pre-existing `stories.tsx` ts errors and `TimesheetHelpers.test.ts`).

**Step 6: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md CLAUDE.md
git commit -m "docs: §N individual swim planning granularity + cycle system retired"
```

---

## Task 10 (optional, can skip until prod validation): Drop old cycle tables

**Not for this PR.** After 1-2 weeks of production validation with no regression reports:

- Create `supabase/migrations/00119_drop_training_cycles.sql`:
  ```sql
  DROP TABLE IF EXISTS training_weeks CASCADE;
  DROP TABLE IF EXISTS training_cycles CASCADE;
  ```
- Delete `src/lib/api/planning.ts` and all re-exports.
- Update schema.sql if it ever references these tables.

This task is scheduled as §N+1.

---

## Summary checklist

- [x] Task 1: migration 00118 + backfill
- [x] Task 2: RLS tests
- [x] Task 3: types + API
- [x] Task 4: merge helper + unit tests
- [x] Task 5: SwimPlanningTimeline extraction (non-functional refactor, checkpoint)
- [x] Task 6: coach UI — swimmer selector + override mode (frontend-design invoked)
- [x] Task 7: SwimmerPlanningPanel replaces SwimmerPlanningTab
- [x] Task 8: swimmer-side merge + Perso badge
- [x] Task 9: docs
- [ ] Task 10: drop old tables (follow-up patch, not in this PR)

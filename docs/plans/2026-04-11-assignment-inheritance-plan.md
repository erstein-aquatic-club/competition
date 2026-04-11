# Assignment Inheritance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implémenter l'héritage de séance pour les créneaux perso, la priorité individuel > groupe, les sous-groupes multi-séances, et corriger les bugs métier de l'audit #4.

**Architecture:** 1 migration DB + 1 nouveau helper API + refactoring dashboard + corrections audit

**Tech Stack:** PostgreSQL (Supabase), React 19, TypeScript, React Query 5, Tailwind CSS 4

**Supabase project ID:** `fscnobivsgornxdwqwlk`

---

## Task 1: Migration DB — `00086_assignment_inheritance.sql`

**Files:**
- Create: `supabase/migrations/00086_assignment_inheritance.sql`

**SQL:**

```sql
-- 1. Link feedback to assignments
ALTER TABLE dim_sessions ADD COLUMN IF NOT EXISTS assignment_id INTEGER
  REFERENCES session_assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dim_sessions_assignment ON dim_sessions(assignment_id)
  WHERE assignment_id IS NOT NULL;

-- 2. Replace dedup constraint: allow multiple feedbacks per day if different assignments
DROP INDEX IF EXISTS idx_dim_sessions_dedupe;
CREATE UNIQUE INDEX idx_dim_sessions_dedupe_v2 ON dim_sessions
  (athlete_id, session_date, COALESCE(assignment_id, -1))
  WHERE athlete_id IS NOT NULL;

-- 3. Sub-group targeting for assignments
ALTER TABLE session_assignments ADD COLUMN IF NOT EXISTS target_subgroup_id INTEGER
  REFERENCES groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sa_subgroup ON session_assignments(target_subgroup_id)
  WHERE target_subgroup_id IS NOT NULL;

-- 4. Fix interviews RLS: restrict to assigned coach (not all coaches)
DROP POLICY IF EXISTS "interviews_coach_select" ON interviews;
CREATE POLICY "interviews_coach_select" ON interviews FOR SELECT
  USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND (
        created_by = app_user_id()
        OR athlete_id IN (
          SELECT swimmer_id FROM coach_swimmer_assignments
          WHERE coach_id = app_user_id()
        )
      )
    )
    OR athlete_id = app_user_id()
  );

DROP POLICY IF EXISTS "interviews_coach_insert" ON interviews;
CREATE POLICY "interviews_coach_insert" ON interviews FOR INSERT
  WITH CHECK (
    app_user_role() IN ('admin', 'coach')
  );

DROP POLICY IF EXISTS "interviews_coach_update" ON interviews;
CREATE POLICY "interviews_coach_update" ON interviews FOR UPDATE
  USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND (
        created_by = app_user_id()
        OR athlete_id IN (
          SELECT swimmer_id FROM coach_swimmer_assignments
          WHERE coach_id = app_user_id()
        )
      )
    )
    OR athlete_id = app_user_id()
  );
```

**Apply via MCP**, then commit.

---

## Task 2: API — `resolveSwimmerAssignments()` helper

**Files:**
- Modify: `src/lib/api/assignments.ts`
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/index.ts`

**Add type:**
```typescript
// In types.ts
export interface ResolvedSlotAssignment {
  slotId: string;                    // training_slot_id
  slotTime: string;                  // "17:00-18:00"
  slotLocation: string;
  assignedSession: Assignment | null;
  assignmentId: number | null;
  source: 'individual' | 'subgroup' | 'group' | 'none';
  alternatives: Assignment[];        // other sub-group sessions on same slot
}
```

**Add function in assignments.ts:**
```typescript
export async function resolveSwimmerAssignments(
  userId: number,
  date: string, // ISO date
): Promise<ResolvedSlotAssignment[]>
```

**Logic:**
1. Fetch swimmer's `swimmer_training_slots` for this day_of_week (is_active=true)
2. Fetch ALL `session_assignments` for this date where:
   - `target_user_id = userId` (individual)
   - OR `target_group_id IN (user's group_ids)` (group)
   - OR `target_subgroup_id IN (user's group_ids)` (sub-group)
3. For each swimmer slot:
   a. Find individual assignment with matching `training_slot_id` or `scheduled_date` → source = "individual"
   b. Else find group assignment via `source_assignment_id` → lookup `training_slot_assignments.slot_id` → match → source = "group"
   c. Collect alternatives (other sub-group sessions on same slot)
4. Return resolved list

Export from index.ts.

---

## Task 3: Dashboard — Replace AM/PM with slot-based rendering

**Files:**
- Modify: `src/hooks/useDashboardState.ts`
- Modify: `src/pages/Dashboard.tsx`

**Key changes in useDashboardState:**
1. Replace `SlotKey = "AM" | "PM"` with slot-based identification using training_slot_id
2. `getSessionsForISO()` calls `resolveSwimmerAssignments()` instead of manual slotKey assignment
3. Each PlannedSession now carries: `slotTime`, `assignmentId`, `source`, `alternatives[]`
4. Calendar cell shows completion per resolved slot (not AM/PM pills)

**Key changes in Dashboard.tsx:**
1. Day cell shows slot times instead of AM/PM dots
2. Drawer title includes créneau time "17h-18h"

---

## Task 4: FeedbackDrawer — assignment_id + alternatives picker

**Files:**
- Modify: `src/components/dashboard/FeedbackDrawer.tsx`
- Modify: `src/lib/api.ts` or relevant save function

**Changes:**
1. Display slot time prominently in session card header
2. If `source === "individual"`: show badge "Séance personnalisée"
3. If `alternatives.length > 0`: show a discrete Select picker "Changer de séance" listing alternatives
4. On save: include `assignment_id` in the dim_sessions insert/update payload
5. Adapt the save function to pass assignment_id through to the DB

---

## Task 5: Coach UI — sub-group selector in SlotSessionSheet

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx`
- Modify: `src/lib/api/assignments.ts` (bulkCreateSlotAssignments)

**Changes:**
1. In SlotSessionSheet: add optional "Sous-groupe" Select (list of sub-groups in the slot's groups)
2. When selected: assignment created with `target_subgroup_id` instead of `target_group_id`
3. UI: show existing assignments on this slot (grouped by sub-group) so coach sees what's already assigned
4. Individual exception: when coach selects a specific swimmer, assignment has `target_user_id` — UI shows "Exception individuelle" badge

---

## Task 6: Audit #4 remaining fixes (batch)

**Files:** Multiple

**Fixes to apply in parallel:**
- M4: `save_strength_run_atomic` — check ROW_COUNT after assignment UPDATE, log warning if 0
- M5: Catch FK violation in RPC, save partial data to draft instead of losing everything
- M6: Wellness cron timezone — add explicit `AT TIME ZONE 'Europe/Paris'` to date comparison
- S5: Include slot time in assignment notification body

---

## Task 7: Documentation

**Files:**
- CLAUDE.md, implementation-log.md, ROADMAP.md

Add §101 entry, update chantier table.

---

## Execution Order & Dependencies

```
Task 1 (DB migration) → Task 2 (API helper) → Task 3 (Dashboard) → Task 4 (Drawer)
                                              → Task 5 (Coach UI)
Task 6 (audit fixes) — independent, parallel with Tasks 3-5
Task 7 (docs) — after all
```

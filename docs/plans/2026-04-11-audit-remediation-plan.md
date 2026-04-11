# Audit Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remédier les 17 items identifiés par l'audit complet (sécurité, performance, UX, robustesse).

**Architecture:** 7 migrations Supabase (00079-00085) appliquées via MCP, modifications frontend sur ~20 fichiers existants, 3 nouveaux composants/hooks. Chaque phase est indépendante et peut être déployée séparément.

**Tech Stack:** PostgreSQL (Supabase), React 19, TypeScript, React Query 5, Tailwind CSS 4, Shadcn/Radix UI

**Supabase project ID:** `fscnobivsgornxdwqwlk`

**Règle CLAUDE.md:** Toujours appliquer les migrations via `mcp__plugin_supabase_supabase__apply_migration`, jamais via `supabase db push`.

---

## Task 1: Migration sécurité — `00079_security_hardening.sql`

**Files:**
- Create: `supabase/migrations/00079_security_hardening.sql`

**Step 1: Write the migration file**

```sql
-- 1.1 Recreate swim_records_comp without SECURITY DEFINER
DROP VIEW IF EXISTS public.swim_records_comp;
CREATE VIEW public.swim_records_comp
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (user_id, event_code, pool_length)
  id,
  user_id AS athlete_id,
  event_code AS event_name,
  pool_length,
  time_seconds,
  competition_date AS record_date,
  competition_name AS notes,
  ffn_points,
  'comp'::text AS record_type
FROM swimmer_performances sp
WHERE user_id IS NOT NULL AND time_seconds IS NOT NULL AND time_seconds > 0::double precision
ORDER BY user_id, event_code, pool_length, time_seconds;

-- 1.2 Fix search_path on all functions missing it
ALTER FUNCTION public.app_user_id() SET search_path = public;
ALTER FUNCTION public.app_user_role() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.auto_notify_competition_assignment() SET search_path = public;
ALTER FUNCTION public.auto_notify_interview_created() SET search_path = public;
ALTER FUNCTION public.auto_notify_interview_transition() SET search_path = public;
ALTER FUNCTION public.auto_notify_session_assignment() SET search_path = public;
ALTER FUNCTION public.auto_notify_slot_override() SET search_path = public;
ALTER FUNCTION public.auto_notify_swimmer_comment() SET search_path = public;
ALTER FUNCTION public.generate_swim_share_token() SET search_path = public;
ALTER FUNCTION public.sync_group_members_on_profile() SET search_path = public;
ALTER FUNCTION public.send_wellness_morning_push() SET search_path = public;
ALTER FUNCTION public.get_strength_history_aggregate(integer, integer, integer, text, timestamp with time zone, timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.get_upcoming_birthdays() SET search_path = public;
ALTER FUNCTION public.log_coach_swimmer_removal() SET search_path = public;
ALTER FUNCTION public.notify_push_on_target_insert() SET search_path = public;

-- 1.3 Restrict admin_audit_log INSERT to service_role only
DROP POLICY IF EXISTS "System can insert audit log" ON public.admin_audit_log;
CREATE POLICY "System can insert audit log" ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (current_setting('role') = 'service_role');
```

**Note:** La signature exacte de `get_strength_history_aggregate` doit être vérifiée avant d'appliquer. Exécuter `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'get_strength_history_aggregate';` pour obtenir la signature précise.

**Step 2: Apply via MCP**

Run: `mcp__plugin_supabase_supabase__apply_migration` with name `00079_security_hardening` and the SQL above.

**Step 3: Verify**

Run SQL to confirm:
```sql
-- Check view is security invoker
SELECT relname, reloptions FROM pg_class WHERE relname = 'swim_records_comp';

-- Check all functions have search_path
SELECT proname, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proconfig IS NULL AND proname NOT IN ('handle_new_auth_user');

-- Check audit log policy
SELECT polname, pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polrelid = 'admin_audit_log'::regclass;
```

**Step 4: Commit**

```bash
git add supabase/migrations/00079_security_hardening.sql
git commit -m "fix(security): harden view, search_path, audit_log RLS policy"
```

---

## Task 2: Migration index FK — `00080_missing_fk_indexes.sql`

**Files:**
- Create: `supabase/migrations/00080_missing_fk_indexes.sql`

**Step 1: Write the migration file**

```sql
-- Add missing indexes on foreign keys for JOIN/DELETE performance
-- Using CREATE INDEX IF NOT EXISTS for idempotency

-- High priority (large or frequently joined tables)
CREATE INDEX IF NOT EXISTS idx_strength_session_items_exercise ON public.strength_session_items (exercise_id);
CREATE INDEX IF NOT EXISTS idx_sa_swim_catalog ON public.session_assignments (swim_catalog_id) WHERE swim_catalog_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sa_strength_session ON public.session_assignments (strength_session_id) WHERE strength_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competition_races_athlete ON public.competition_races (athlete_id);
CREATE INDEX IF NOT EXISTS idx_strength_runs_session ON public.strength_session_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_strength_sessions_folder ON public.strength_sessions (folder_id) WHERE folder_id IS NOT NULL;

-- Medium priority
CREATE INDEX IF NOT EXISTS idx_objectives_competition ON public.objectives (competition_id) WHERE competition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objectives_created_by ON public.objectives (created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON public.notifications (created_by);
CREATE INDEX IF NOT EXISTS idx_comp_checklists_athlete ON public.competition_checklists (athlete_id);
CREATE INDEX IF NOT EXISTS idx_one_rm_exercise ON public.one_rm_records (exercise_id);
CREATE INDEX IF NOT EXISTS idx_one_rm_source_run ON public.one_rm_records (source_run_id) WHERE source_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interviews_created_by ON public.interviews (created_by);
CREATE INDEX IF NOT EXISTS idx_interviews_cycle ON public.interviews (current_cycle_id) WHERE current_cycle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_cycles_created_by ON public.training_cycles (created_by);
CREATE INDEX IF NOT EXISTS idx_training_cycles_start_comp ON public.training_cycles (start_competition_id) WHERE start_competition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_cycles_end_comp ON public.training_cycles (end_competition_id) WHERE end_competition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dim_exercices_folder ON public.dim_exercices (folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checklist_templates_athlete ON public.checklist_templates (athlete_id) WHERE athlete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_checklists_template ON public.competition_checklists (checklist_template_id) WHERE checklist_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_race_routines_routine ON public.race_routines (routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_templates_athlete ON public.routine_templates (athlete_id) WHERE athlete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swim_exercise_logs_source ON public.swim_exercise_logs (source_item_id) WHERE source_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swimmer_slots_created_by ON public.swimmer_training_slots (created_by);
CREATE INDEX IF NOT EXISTS idx_slot_overrides_created_by ON public.training_slot_overrides (created_by);
CREATE INDEX IF NOT EXISTS idx_training_slots_created_by ON public.training_slots (created_by);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups (created_by);
CREATE INDEX IF NOT EXISTS idx_import_logs_triggered_by ON public.import_logs (triggered_by);
CREATE INDEX IF NOT EXISTS idx_csa_assigned_by ON public.coach_swimmer_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_slot_coaches_coach ON public.training_slot_coaches (coach_id);

-- Drop confirmed unused indexes
DROP INDEX IF EXISTS public.idx_swim_exercise_logs_user_event;
DROP INDEX IF EXISTS public.idx_user_profiles_updated;
```

**Step 2: Apply via MCP**

**Step 3: Verify** — Run `SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';` (should increase by ~30).

**Step 4: Commit**

```bash
git add supabase/migrations/00080_missing_fk_indexes.sql
git commit -m "perf(db): add 30 missing FK indexes, drop 2 unused"
```

---

## Task 3: Migration RPC pagination — `00081_pagination_rpcs.sql`

**Files:**
- Create: `supabase/migrations/00081_pagination_rpcs.sql`

**Step 1: Write the migration file**

```sql
-- RPC: get_athletes_paginated
-- Replaces 3 separate queries in getAthletes() (users.ts:113)
CREATE OR REPLACE FUNCTION public.get_athletes_paginated(
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_group_id int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_total int;
BEGIN
  WITH filtered AS (
    SELECT
      u.id,
      u.display_name,
      u.email,
      u.role,
      u.created_at,
      up.ffn_iuf,
      up.avatar_url,
      up.sex,
      up.birthdate,
      up.phone,
      up.bio,
      up.neurotype_result,
      gm.group_id,
      g.name AS group_name
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN group_members gm ON gm.user_id = u.id
    LEFT JOIN groups g ON g.id = gm.group_id AND g.is_temporary = false
    WHERE u.role = 'athlete'
      AND (p_search IS NULL OR u.display_name ILIKE '%' || p_search || '%')
      AND (p_group_id IS NULL OR gm.group_id = p_group_id)
  )
  SELECT
    jsonb_build_object(
      'athletes', COALESCE(jsonb_agg(row_to_json(f.*) ORDER BY f.display_name) FILTER (WHERE f.id IS NOT NULL), '[]'::jsonb),
      'total', (SELECT count(DISTINCT f2.id) FROM filtered f2)
    )
  INTO v_result
  FROM (
    SELECT DISTINCT ON (id) * FROM filtered ORDER BY id, group_id
  ) sub
  CROSS JOIN LATERAL (SELECT * FROM filtered f2 WHERE f2.id = sub.id LIMIT 1) f
  OFFSET p_offset
  LIMIT p_limit;

  RETURN COALESCE(v_result, '{"athletes":[],"total":0}'::jsonb);
END;
$$;

-- RPC: get_swim_catalog_paginated
-- Replaces full load in getSwimSessions() (swim.ts:16)
CREATE OR REPLACE FUNCTION public.get_swim_catalog_paginated(
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_folder text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'sessions', COALESCE(jsonb_agg(s ORDER BY s.created_at DESC), '[]'::jsonb),
      'total', (
        SELECT count(*) FROM swim_sessions_catalog sc
        WHERE (NOT sc.is_archived OR sc.is_archived IS NULL)
          AND (p_search IS NULL OR sc.name ILIKE '%' || p_search || '%')
          AND (p_folder IS NULL OR sc.folder = p_folder)
      )
    )
    FROM (
      SELECT
        sc.id, sc.name, sc.description, sc.total_distance, sc.folder,
        sc.is_archived, sc.created_at, sc.created_by, sc.share_token,
        COALESCE(
          (SELECT jsonb_agg(row_to_json(si.*) ORDER BY si.ordre)
           FROM swim_session_items si WHERE si.catalog_id = sc.id),
          '[]'::jsonb
        ) AS items
      FROM swim_sessions_catalog sc
      WHERE (NOT sc.is_archived OR sc.is_archived IS NULL)
        AND (p_search IS NULL OR sc.name ILIKE '%' || p_search || '%')
        AND (p_folder IS NULL OR sc.folder = p_folder)
      ORDER BY sc.created_at DESC
      OFFSET p_offset LIMIT p_limit
    ) s
  );
END;
$$;

-- RPC: get_strength_catalog_paginated
-- Replaces full load in getStrengthSessions() (strength.ts:140)
CREATE OR REPLACE FUNCTION public.get_strength_catalog_paginated(
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_folder_id int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'sessions', COALESCE(jsonb_agg(s ORDER BY s.created_at DESC), '[]'::jsonb),
      'total', (
        SELECT count(*) FROM strength_sessions ss
        WHERE (p_search IS NULL OR ss.name ILIKE '%' || p_search || '%')
          AND (p_folder_id IS NULL OR ss.folder_id = p_folder_id)
      )
    )
    FROM (
      SELECT
        ss.id, ss.name, ss.description, ss.cycle, ss.created_at,
        ss.created_by, ss.folder_id,
        COALESCE(
          (SELECT jsonb_agg(row_to_json(si.*) ORDER BY si.ordre)
           FROM strength_session_items si WHERE si.session_id = ss.id),
          '[]'::jsonb
        ) AS items
      FROM strength_sessions ss
      WHERE (p_search IS NULL OR ss.name ILIKE '%' || p_search || '%')
        AND (p_folder_id IS NULL OR ss.folder_id = p_folder_id)
      ORDER BY ss.created_at DESC
      OFFSET p_offset LIMIT p_limit
    ) s
  );
END;
$$;
```

**Step 2: Apply via MCP**

**Step 3: Verify** — Test each RPC:
```sql
SELECT get_athletes_paginated(0, 5, NULL, NULL);
SELECT get_swim_catalog_paginated(0, 5, NULL, NULL);
SELECT get_strength_catalog_paginated(0, 5, NULL, NULL);
```

**Step 4: Commit**

```bash
git add supabase/migrations/00081_pagination_rpcs.sql
git commit -m "feat(db): add 3 paginated RPC functions (athletes, swim, strength)"
```

---

## Task 4: Migration RPC agrégation — `00082_aggregation_rpcs.sql`

**Files:**
- Create: `supabase/migrations/00082_aggregation_rpcs.sql`

**Step 1: Write the migration file**

```sql
-- RPC: get_strength_run_summary
-- Replaces client-side computeRunTonnage/computeRunTotalReps (strengthHistoryUtils.ts)
CREATE OR REPLACE FUNCTION public.get_strength_run_summary(p_run_id int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'tonnage', COALESCE(SUM(CASE WHEN weight > 0 THEN weight * reps ELSE 0 END), 0),
      'total_reps', COALESCE(SUM(reps), 0),
      'total_sets', count(*),
      'avg_difficulty', ROUND(AVG(difficulty)::numeric, 1),
      'exercises', COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'exercise_id', ssl.exercise_id,
          'exercise_name', de.nom_exercice,
          'sets', (SELECT count(*) FROM strength_set_logs s2 WHERE s2.run_id = p_run_id AND s2.exercise_id = ssl.exercise_id),
          'total_reps', (SELECT COALESCE(SUM(s2.reps), 0) FROM strength_set_logs s2 WHERE s2.run_id = p_run_id AND s2.exercise_id = ssl.exercise_id),
          'tonnage', (SELECT COALESCE(SUM(CASE WHEN s2.weight > 0 THEN s2.weight * s2.reps ELSE 0 END), 0) FROM strength_set_logs s2 WHERE s2.run_id = p_run_id AND s2.exercise_id = ssl.exercise_id),
          'avg_difficulty', (SELECT ROUND(AVG(s2.difficulty)::numeric, 1) FROM strength_set_logs s2 WHERE s2.run_id = p_run_id AND s2.exercise_id = ssl.exercise_id)
        )),
        '[]'::jsonb
      )
    )
    FROM strength_set_logs ssl
    LEFT JOIN dim_exercices de ON de.id = ssl.exercise_id
    WHERE ssl.run_id = p_run_id
  );
END;
$$;

-- RPC: batch_upsert_1rm
-- Replaces N parallel update1RM() calls (strength.ts:956)
CREATE OR REPLACE FUNCTION public.batch_upsert_1rm(p_records jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at, notes)
  SELECT
    (r->>'athlete_id')::int,
    (r->>'exercise_id')::int,
    (r->>'one_rm')::numeric,
    (r->>'source_run_id')::int,
    now(),
    r->>'notes'
  FROM jsonb_array_elements(p_records) AS r
  ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
    one_rm = EXCLUDED.one_rm,
    source_run_id = EXCLUDED.source_run_id,
    recorded_at = EXCLUDED.recorded_at,
    notes = COALESCE(EXCLUDED.notes, one_rm_records.notes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

**Step 2: Apply via MCP**

**Step 3: Verify** — Test RPCs (use existing run IDs from the DB):
```sql
SELECT id FROM strength_session_runs LIMIT 1;
-- Then: SELECT get_strength_run_summary(<id>);
-- And: SELECT batch_upsert_1rm('[]'::jsonb);  -- empty array = 0 rows
```

**Step 4: Commit**

```bash
git add supabase/migrations/00082_aggregation_rpcs.sql
git commit -m "feat(db): add run summary + batch 1RM upsert RPCs"
```

---

## Task 5: Migration transaction atomique — `00083_save_strength_run_atomic.sql`

**Files:**
- Create: `supabase/migrations/00083_save_strength_run_atomic.sql`

**Step 1: Write the migration file**

```sql
-- RPC: save_strength_run_atomic
-- Replaces 5-step saveStrengthRun() in strength.ts:528
-- Single transaction: if any step fails, full rollback
CREATE OR REPLACE FUNCTION public.save_strength_run_atomic(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id int;
  v_run_record record;
  v_1rm_count int := 0;
BEGIN
  -- Step 1: Insert the run
  INSERT INTO strength_session_runs (
    session_id, athlete_id, assignment_id, started_at, status
  ) VALUES (
    (p_data->>'session_id')::int,
    (p_data->>'athlete_id')::int,
    (p_data->>'assignment_id')::int,
    COALESCE((p_data->>'started_at')::timestamptz, now()),
    'completed'
  )
  RETURNING id INTO v_run_id;

  -- Step 2: Insert all set logs
  INSERT INTO strength_set_logs (run_id, exercise_id, set_number, reps, weight, difficulty, completed_at, notes)
  SELECT
    v_run_id,
    (log->>'exercise_id')::int,
    (log->>'set_number')::int,
    (log->>'reps')::int,
    (log->>'weight')::numeric,
    (log->>'difficulty')::int,
    COALESCE((log->>'completed_at')::timestamptz, now()),
    log->>'notes'
  FROM jsonb_array_elements(p_data->'logs') AS log;

  -- Step 3: Batch upsert 1RM estimates (if any)
  IF p_data->'one_rm_estimates' IS NOT NULL AND jsonb_array_length(p_data->'one_rm_estimates') > 0 THEN
    INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at)
    SELECT
      (r->>'athlete_id')::int,
      (r->>'exercise_id')::int,
      (r->>'one_rm')::numeric,
      v_run_id,
      now()
    FROM jsonb_array_elements(p_data->'one_rm_estimates') AS r
    ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
      one_rm = EXCLUDED.one_rm,
      source_run_id = EXCLUDED.source_run_id,
      recorded_at = EXCLUDED.recorded_at;

    GET DIAGNOSTICS v_1rm_count = ROW_COUNT;
  END IF;

  -- Step 4: Update run with completion data
  UPDATE strength_session_runs SET
    completed_at = now(),
    status = 'completed',
    feeling = (p_data->>'feeling')::int,
    rpe = (p_data->>'rpe')::int,
    duration = (p_data->>'duration')::int,
    comments = p_data->>'comments'
  WHERE id = v_run_id;

  -- Step 5: Update assignment status if linked
  IF (p_data->>'assignment_id') IS NOT NULL THEN
    UPDATE session_assignments
    SET status = 'completed'
    WHERE id = (p_data->>'assignment_id')::int;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'logs_count', jsonb_array_length(p_data->'logs'),
    'one_rm_count', v_1rm_count
  );
END;
$$;
```

**Step 2: Apply via MCP**

**Step 3: Verify** — Dry test with `SELECT save_strength_run_atomic('...'::jsonb);` using valid test data.

**Step 4: Commit**

```bash
git add supabase/migrations/00083_save_strength_run_atomic.sql
git commit -m "feat(db): add atomic save_strength_run RPC (single transaction)"
```

---

## Task 6: Migration CHECK constraints — `00084_text_length_constraints.sql`

**Files:**
- Create: `supabase/migrations/00084_text_length_constraints.sql`

**Step 1: Write the migration file**

```sql
-- Text length constraints to prevent DB bloat from unbounded user input
-- Using NOT VALID to skip validation of existing rows (faster apply)

ALTER TABLE dim_sessions ADD CONSTRAINT chk_sessions_comments_len CHECK (length(comments) <= 2000) NOT VALID;
ALTER TABLE dim_sessions ADD CONSTRAINT chk_sessions_coach_notes_len CHECK (length(coach_notes) <= 2000) NOT VALID;

ALTER TABLE user_profiles ADD CONSTRAINT chk_profiles_bio_len CHECK (length(bio) <= 500) NOT VALID;
ALTER TABLE user_profiles ADD CONSTRAINT chk_profiles_display_name_len CHECK (length(display_name) <= 100) NOT VALID;
ALTER TABLE user_profiles ADD CONSTRAINT chk_profiles_phone_len CHECK (length(phone) <= 20) NOT VALID;

ALTER TABLE notifications ADD CONSTRAINT chk_notif_title_len CHECK (length(title) <= 200) NOT VALID;
ALTER TABLE notifications ADD CONSTRAINT chk_notif_body_len CHECK (length(body) <= 2000) NOT VALID;

ALTER TABLE interviews ADD CONSTRAINT chk_interviews_text_len CHECK (
  length(athlete_goals) <= 5000
  AND length(athlete_successes) <= 5000
  AND length(athlete_difficulties) <= 5000
  AND length(athlete_commitments) <= 5000
  AND length(athlete_commitment_review) <= 5000
  AND length(coach_comment_goals) <= 5000
  AND length(coach_comment_successes) <= 5000
  AND length(coach_comment_difficulties) <= 5000
  AND length(coach_actions) <= 5000
  AND length(coach_objectives) <= 5000
  AND length(coach_review) <= 5000
) NOT VALID;

ALTER TABLE objectives ADD CONSTRAINT chk_objectives_text_len CHECK (length(text) <= 1000) NOT VALID;

ALTER TABLE strength_sessions ADD CONSTRAINT chk_ss_name_len CHECK (length(name) <= 200) NOT VALID;
ALTER TABLE strength_sessions ADD CONSTRAINT chk_ss_desc_len CHECK (length(description) <= 2000) NOT VALID;

ALTER TABLE competitions ADD CONSTRAINT chk_comp_name_len CHECK (length(name) <= 200) NOT VALID;
ALTER TABLE competitions ADD CONSTRAINT chk_comp_desc_len CHECK (length(description) <= 2000) NOT VALID;

ALTER TABLE strength_set_logs ADD CONSTRAINT chk_set_notes_len CHECK (length(notes) <= 500) NOT VALID;
ALTER TABLE strength_session_runs ADD CONSTRAINT chk_run_comments_len CHECK (length(comments) <= 2000) NOT VALID;

ALTER TABLE wellness_checks ADD CONSTRAINT chk_wellness_notes_len CHECK (length(notes) <= 1000) NOT VALID;
```

**Step 2: Apply via MCP**

**Step 3: Verify** — `SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%_len';` — should return ~15 rows.

**Step 4: Commit**

```bash
git add supabase/migrations/00084_text_length_constraints.sql
git commit -m "fix(db): add CHECK constraints on text columns to prevent bloat"
```

---

## Task 7: Migration cron cleanup — `00085_notification_cleanup.sql`

**Files:**
- Create: `supabase/migrations/00085_notification_cleanup.sql`

**Step 1: Write the migration file**

```sql
-- Cleanup function for expired notifications and stale push subscriptions
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif_deleted int;
  v_push_deleted int;
BEGIN
  -- Delete expired notification targets (> 30 days past expiry)
  DELETE FROM notification_targets
  WHERE notification_id IN (
    SELECT id FROM notifications
    WHERE expires_at IS NOT NULL AND expires_at < now() - interval '30 days'
  );

  -- Delete expired notifications
  DELETE FROM notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM notification_targets nt WHERE nt.notification_id = notifications.id
    );
  GET DIAGNOSTICS v_notif_deleted = ROW_COUNT;

  -- Delete stale push subscriptions (no update in 90 days)
  DELETE FROM push_subscriptions
  WHERE updated_at < now() - interval '90 days'
    OR (updated_at IS NULL AND created_at < now() - interval '90 days');
  GET DIAGNOSTICS v_push_deleted = ROW_COUNT;

  RAISE LOG 'cleanup_expired_notifications: % notifications, % push_subscriptions deleted',
    v_notif_deleted, v_push_deleted;
END;
$$;

-- Schedule weekly cleanup via pg_cron (Sunday 3am UTC)
-- Note: pg_cron must be enabled in Supabase dashboard (Extensions)
SELECT cron.schedule(
  'cleanup-notifications',
  '0 3 * * 0',
  $$ SELECT public.cleanup_expired_notifications(); $$
);
```

**Step 2: Apply via MCP**

**Important:** Vérifier que `pg_cron` est activé dans les extensions Supabase avant d'appliquer. Si non, activer via le dashboard Supabase > Database > Extensions > pg_cron.

**Step 3: Verify** — `SELECT * FROM cron.job WHERE jobname = 'cleanup-notifications';`

**Step 4: Commit**

```bash
git add supabase/migrations/00085_notification_cleanup.sql
git commit -m "feat(db): add weekly notification/push cleanup cron"
```

---

## Task 8: Frontend — Pagination API layer

**Files:**
- Modify: `src/lib/api/users.ts:113-184` (getAthletes)
- Modify: `src/lib/api/swim.ts:16-83` (getSwimSessions)
- Modify: `src/lib/api/strength.ts:140-180` (getStrengthSessions)
- Modify: `src/lib/api/index.ts` (re-exports)

**Step 1: Add paginated getAthletes to `users.ts`**

Add a new export function alongside the existing `getAthletes()` (keep the old one for backward compat):

```typescript
export async function getAthletesPaginated(opts: {
  offset?: number;
  limit?: number;
  search?: string;
  groupId?: number;
} = {}): Promise<{ athletes: AthleteSummary[]; total: number }> {
  if (!canUseSupabase()) {
    const all = storage.sessions.get() as AthleteSummary[];
    return { athletes: all, total: all.length };
  }
  const { data, error } = await supabase.rpc('get_athletes_paginated', {
    p_offset: opts.offset ?? 0,
    p_limit: opts.limit ?? 20,
    p_search: opts.search ?? null,
    p_group_id: opts.groupId ?? null,
  });
  if (error) throw new Error(error.message);
  return { athletes: data?.athletes ?? [], total: data?.total ?? 0 };
}
```

**Step 2: Add paginated getSwimSessions to `swim.ts`**

```typescript
export async function getSwimSessionsPaginated(opts: {
  offset?: number;
  limit?: number;
  search?: string;
  folder?: string;
} = {}): Promise<{ sessions: SwimSessionTemplate[]; total: number }> {
  if (!canUseSupabase()) {
    const all = storage.swimSessions.get() as SwimSessionTemplate[];
    return { sessions: all, total: all.length };
  }
  const { data, error } = await supabase.rpc('get_swim_catalog_paginated', {
    p_offset: opts.offset ?? 0,
    p_limit: opts.limit ?? 20,
    p_search: opts.search ?? null,
    p_folder: opts.folder ?? null,
  });
  if (error) throw new Error(error.message);
  return { sessions: data?.sessions ?? [], total: data?.total ?? 0 };
}
```

**Step 3: Add paginated getStrengthSessions to `strength.ts`**

```typescript
export async function getStrengthSessionsPaginated(opts: {
  offset?: number;
  limit?: number;
  search?: string;
  folderId?: number;
} = {}): Promise<{ sessions: StrengthSessionTemplate[]; total: number }> {
  if (!canUseSupabase()) {
    const all = storage.strengthSessions.get() as StrengthSessionTemplate[];
    return { sessions: all, total: all.length };
  }
  const { data, error } = await supabase.rpc('get_strength_catalog_paginated', {
    p_offset: opts.offset ?? 0,
    p_limit: opts.limit ?? 20,
    p_search: opts.search ?? null,
    p_folder_id: opts.folderId ?? null,
  });
  if (error) throw new Error(error.message);
  return { sessions: data?.sessions ?? [], total: data?.total ?? 0 };
}
```

**Step 4: Export from index.ts**

Add to `src/lib/api/index.ts`:
```typescript
export { getAthletesPaginated } from './users';
export { getSwimSessionsPaginated } from './swim';
export { getStrengthSessionsPaginated } from './strength';
```

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (new functions don't break existing code)

**Step 6: Commit**

```bash
git add src/lib/api/users.ts src/lib/api/swim.ts src/lib/api/strength.ts src/lib/api/index.ts
git commit -m "feat(api): add paginated RPC wrappers for athletes, swim, strength catalogs"
```

---

## Task 9: Frontend — Infinite scroll composants coach

**Files:**
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx`
- Modify: `src/pages/coach/SwimCatalog.tsx`
- Modify: `src/pages/coach/StrengthCatalog.tsx`

**Step 1: Refactor CoachSwimmersOverview to use `useInfiniteQuery`**

Replace the existing `useQuery` call for athletes with `useInfiniteQuery`:

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { getAthletesPaginated } from '@/lib/api';

const PAGE_SIZE = 20;

const {
  data: athletePages,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
} = useInfiniteQuery({
  queryKey: ['athletes', searchText, selectedGroupId],
  queryFn: ({ pageParam = 0 }) =>
    getAthletesPaginated({
      offset: pageParam,
      limit: PAGE_SIZE,
      search: searchText || undefined,
      groupId: selectedGroupId || undefined,
    }),
  getNextPageParam: (lastPage, allPages) => {
    const loaded = allPages.reduce((sum, p) => sum + p.athletes.length, 0);
    return loaded < lastPage.total ? loaded : undefined;
  },
  initialPageParam: 0,
});

const athletes = athletePages?.pages.flatMap(p => p.athletes) ?? [];
```

Add a "Charger plus" button at the bottom of the grid:

```tsx
{hasNextPage && (
  <Button
    variant="outline"
    className="w-full mt-4"
    onClick={() => fetchNextPage()}
    disabled={isFetchingNextPage}
  >
    {isFetchingNextPage ? "Chargement..." : "Charger plus"}
  </Button>
)}
```

**Step 2: Apply same pattern to SwimCatalog and StrengthCatalog**

Same `useInfiniteQuery` pattern, adapted to each component's filter state (folder, search, cycle).

**Step 3: Run type check + dev server**

Run: `npx tsc --noEmit && npm run dev`
Test: Open each view, verify pagination works, search filters, "Charger plus" button.

**Step 4: Commit**

```bash
git add src/pages/coach/CoachSwimmersOverview.tsx src/pages/coach/SwimCatalog.tsx src/pages/coach/StrengthCatalog.tsx
git commit -m "feat(coach): add infinite scroll pagination to swimmers, swim & strength catalogs"
```

---

## Task 10: Frontend — Batch 1RM + run summary RPCs

**Files:**
- Modify: `src/lib/api/strength.ts:528-598` (saveStrengthRun → use save_strength_run_atomic)
- Modify: `src/components/strength/RunDetailSheet.tsx:86-90` (use get_strength_run_summary)
- Modify: `src/lib/strengthHistoryUtils.ts` (keep as fallback for offline)

**Step 1: Replace saveStrengthRun with atomic RPC call**

In `src/lib/api/strength.ts`, replace the 5-step `saveStrengthRun()` (lines 528-598) body when online:

```typescript
export async function saveStrengthRun(run: SaveStrengthRunPayload): Promise<SaveStrengthRunResult> {
  if (!canUseSupabase()) {
    // Keep existing localStorage fallback unchanged
    return saveStrengthRunOffline(run);
  }

  const { data, error } = await supabase.rpc('save_strength_run_atomic', {
    p_data: {
      session_id: run.sessionId,
      athlete_id: run.athleteId,
      assignment_id: run.assignmentId ?? null,
      started_at: run.startedAt,
      logs: run.logs.map((l, i) => ({
        exercise_id: l.exerciseId,
        set_number: i + 1,
        reps: l.reps,
        weight: l.weight,
        difficulty: l.difficulty,
        completed_at: l.completedAt,
        notes: l.notes ?? null,
      })),
      one_rm_estimates: run.oneRmEstimates ?? [],
      feeling: run.feeling ?? null,
      rpe: run.rpe ?? null,
      duration: run.duration ?? null,
      comments: run.comments ?? null,
    },
  });

  if (error) throw new Error(error.message);
  return { runId: data.run_id, logsCount: data.logs_count, oneRmCount: data.one_rm_count };
}
```

**Note:** The exact field names in the existing `run` parameter must be checked against the actual `saveStrengthRun` call sites in `Strength.tsx`. Adapt the mapping accordingly.

**Step 2: Use run summary RPC in RunDetailSheet**

In `src/components/strength/RunDetailSheet.tsx`, replace the `useMemo` calls (lines 86-90) with a `useQuery`:

```typescript
const { data: summary } = useQuery({
  queryKey: ['strength-run-summary', run.id],
  queryFn: () => supabase.rpc('get_strength_run_summary', { p_run_id: run.id }).then(r => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }),
  enabled: !!run.id,
  staleTime: 5 * 60 * 1000,
});

const tonnage = summary?.tonnage ?? 0;
const totalReps = summary?.total_reps ?? 0;
const avgDifficulty = summary?.avg_difficulty ?? null;
const exerciseGroups = summary?.exercises ?? [];
```

**Step 3: Keep strengthHistoryUtils.ts as offline fallback**

Don't remove the file — it's still needed for localStorage-based offline calculations. Add a comment at the top:

```typescript
/**
 * Offline fallback helpers for strength history calculations.
 * When online, prefer the get_strength_run_summary RPC.
 */
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/lib/api/strength.ts src/components/strength/RunDetailSheet.tsx src/lib/strengthHistoryUtils.ts
git commit -m "feat(strength): use atomic RPC for save + server-side run summary"
```

---

## Task 11: Frontend — Auto-close drawer + champ manquant indicator

**Files:**
- Modify: `src/pages/Dashboard.tsx:267` (onSuccess save) and disabled button area

**Step 1: Auto-close drawer after save**

In `Dashboard.tsx`, find the save mutation `onSuccess` (around line 267). Add drawer close with delay:

```typescript
onSuccess: () => {
  // ... existing invalidation + toast code ...
  setSaveState("saved");
  setTimeout(() => setSaveState("idle"), 2000);
  // Auto-close drawer after brief feedback
  setTimeout(() => {
    setDrawerOpen(false);
    setActiveSessionId(null);
    setDetailsOpen(false);
  }, 600);
},
```

**Step 2: Add missing field indicator**

Find the save button in the FeedbackDrawer (around lines 976-1001). Wrap with a click interceptor:

```tsx
const [showMissing, setShowMissing] = useState(false);
const missingIndicators = [difficulty, fatigue, performance, engagement].filter(v => v == null);
const canSave = missingIndicators.length === 0;

// Wrapper div that catches clicks on disabled button
<div
  onClick={() => {
    if (!canSave) {
      setShowMissing(true);
      setTimeout(() => setShowMissing(false), 2000);
    }
  }}
>
  <Button disabled={!canSave} onClick={handleSave}>
    Enregistrer
  </Button>
</div>
{showMissing && (
  <p className="text-destructive text-xs mt-1 animate-pulse">
    Remplis les 4 indicateurs pour enregistrer
  </p>
)}
```

Add `ring-2 ring-destructive` class to the corresponding `ScaleSelector5` components when `showMissing && value == null`.

**Step 3: Test in dev server**

Run: `npm run dev`
Test: Click save with missing indicators → see highlight + message. Fill all → save → drawer closes.

**Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(dashboard): auto-close drawer after save + missing field indicator"
```

---

## Task 12: Frontend — Breadcrumbs coach

**Files:**
- Create: `src/hooks/useCoachBreadcrumb.ts`
- Create: `src/components/shared/CoachBreadcrumb.tsx`
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx`
- Modify: `src/pages/coach/CoachChronoHistoryScreen.tsx`

**Step 1: Create the hook**

```typescript
// src/hooks/useCoachBreadcrumb.ts
import { useMemo } from 'react';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export function useCoachBreadcrumb(segments: BreadcrumbSegment[]) {
  return useMemo(() => [
    { label: 'Coach', href: '#/coach' },
    ...segments,
  ], [segments]);
}
```

**Step 2: Create the component**

```tsx
// src/components/shared/CoachBreadcrumb.tsx
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { BreadcrumbSegment } from '@/hooks/useCoachBreadcrumb';

export function CoachBreadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  if (segments.length <= 1) return null;
  return (
    <Breadcrumb className="px-4 py-2">
      <BreadcrumbList>
        {segments.map((seg, i) => (
          <BreadcrumbItem key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            {i === segments.length - 1 ? (
              <BreadcrumbPage>{seg.label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink href={seg.href}>{seg.label}</BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

**Step 3: Integrate into CoachSwimmerDetail**

At the top of the component, after the header, add:

```tsx
import { CoachBreadcrumb } from '@/components/shared/CoachBreadcrumb';
import { useCoachBreadcrumb } from '@/hooks/useCoachBreadcrumb';

// Inside component:
const breadcrumb = useCoachBreadcrumb([
  { label: 'Nageurs', href: '#/coach?section=swimmers' },
  { label: athleteName ?? 'Nageur' },
]);

// In JSX, before the tabs:
<CoachBreadcrumb segments={breadcrumb} />
```

**Step 4: Integrate into CoachChronoHistoryScreen** — same pattern with `[{ label: 'Chrono', href: '#/coach?section=chrono' }, { label: 'Historique' }]`.

**Step 5: Run type check**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/hooks/useCoachBreadcrumb.ts src/components/shared/CoachBreadcrumb.tsx src/pages/coach/CoachSwimmerDetail.tsx src/pages/coach/CoachChronoHistoryScreen.tsx
git commit -m "feat(coach): add breadcrumb navigation to swimmer detail + chrono history"
```

---

## Task 13: Frontend — Dark mode toggle admin

**Files:**
- Modify: `src/lib/api/index.ts` (add getAppSetting/setAppSetting)
- Modify: `src/App.tsx` (apply dark class on mount)
- Modify: admin page (add Apparence section)

**Step 1: Add app settings API functions**

In `src/lib/api/index.ts` or a new `src/lib/api/settings.ts`:

```typescript
export async function getAppSetting(key: string): Promise<string | null> {
  if (!canUseSupabase()) return null;
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (!canUseSupabase()) return;
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
```

**Step 2: Apply dark mode in App.tsx**

Add a `useDarkMode` hook or inline effect in the root App component:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getAppSetting } from '@/lib/api';

// Inside App component:
const { data: darkModeSetting } = useQuery({
  queryKey: ['app-setting', 'dark_mode'],
  queryFn: () => getAppSetting('dark_mode'),
  staleTime: 5 * 60 * 1000,
});

useEffect(() => {
  const root = document.documentElement;
  if (darkModeSetting === 'dark') {
    root.classList.add('dark');
  } else if (darkModeSetting === 'light') {
    root.classList.remove('dark');
  } else {
    // "system" or null — respect prefers-color-scheme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}, [darkModeSetting]);
```

**Step 3: Add toggle in admin page**

Find the admin page and add an "Apparence" section:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setAppSetting } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

// In admin page JSX:
<section className="space-y-3">
  <h3 className="font-display uppercase italic tracking-tight text-lg">Apparence</h3>
  <div className="flex items-center justify-between">
    <span className="text-sm">Thème du club</span>
    <Select
      value={darkModeSetting ?? 'system'}
      onValueChange={async (v) => {
        await setAppSetting('dark_mode', v);
        queryClient.invalidateQueries({ queryKey: ['app-setting', 'dark_mode'] });
      }}
    >
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">Système</SelectItem>
        <SelectItem value="light">Clair</SelectItem>
        <SelectItem value="dark">Sombre</SelectItem>
      </SelectContent>
    </Select>
  </div>
</section>
```

**Step 4: Run type check + test in browser**

Run: `npx tsc --noEmit && npm run dev`
Test: Go to admin page, toggle theme, verify `.dark` class is applied to `<html>`.

**Step 5: Commit**

```bash
git add src/lib/api/index.ts src/App.tsx <admin-page-path>
git commit -m "feat(admin): add dark mode toggle (system/light/dark)"
```

---

## Task 14: Frontend — Offline conflict resolution

**Files:**
- Modify: `src/lib/api/localStorage.ts`
- Modify: `src/lib/api/client.ts`
- Create: `src/components/shared/OfflineSyncBanner.tsx`

**Step 1: Add versioned wrapper to localStorage**

In `src/lib/api/localStorage.ts`, modify `localStorageGet` and `localStorageSave`:

```typescript
interface VersionedEntry<T> {
  data: T;
  version: number;
  updatedAt: string; // ISO timestamp
}

export const localStorageGetVersioned = <T = unknown>(key: string): VersionedEntry<T> | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Support both old (raw array) and new (versioned) format
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      return parsed as VersionedEntry<T>;
    }
    // Migrate old format
    return { data: parsed as T, version: 0, updatedAt: new Date(0).toISOString() };
  } catch {
    return null;
  }
};

export const localStorageSaveVersioned = <T = unknown>(key: string, data: T): void => {
  try {
    const existing = localStorageGetVersioned<T>(key);
    const entry: VersionedEntry<T> = {
      data,
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('[localStorage] Failed to save:', key, error);
  }
};
```

Keep the existing `localStorageGet`/`localStorageSave` as-is for backward compat. The versioned variants are used in the sync logic.

**Step 2: Create OfflineSyncBanner**

```tsx
// src/components/shared/OfflineSyncBanner.tsx
import { useState, useEffect } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { AlertCircle, Check } from 'lucide-react';

export function OfflineSyncBanner() {
  const isOnline = useOnlineStatus();
  const [syncResult, setSyncResult] = useState<{ conflicts: number; synced: number } | null>(null);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) setWasOffline(true);
    if (isOnline && wasOffline) {
      // Trigger sync check — compare localStorage timestamps vs server
      // This is handled by each API module's refetch on reconnect
      setWasOffline(false);
    }
  }, [isOnline, wasOffline]);

  if (!syncResult) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-[var(--z-index-toast)] px-4">
      <div className="mx-auto max-w-md rounded-xl border bg-card p-3 shadow-lg flex items-center gap-3">
        {syncResult.conflicts > 0 ? (
          <>
            <AlertCircle className="h-5 w-5 text-status-warning shrink-0" />
            <p className="text-sm">
              {syncResult.conflicts} conflit(s) — données serveur appliquées
            </p>
          </>
        ) : (
          <>
            <Check className="h-5 w-5 text-status-success shrink-0" />
            <p className="text-sm">{syncResult.synced} modification(s) synchronisée(s)</p>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/api/localStorage.ts src/components/shared/OfflineSyncBanner.tsx
git commit -m "feat(offline): add versioned localStorage + sync banner on reconnect"
```

---

## Task 15: Frontend — maxLength sur les formulaires

**Files:**
- Modify: multiple form components (Dashboard.tsx, profile forms, interview forms, etc.)

**Step 1: Add maxLength attributes**

For each text input/textarea that corresponds to a CHECK constraint in Task 6, add the `maxLength` prop:

| Component | Field | maxLength |
|-----------|-------|-----------|
| Dashboard.tsx (feedback comments) | `<textarea>` | 2000 |
| Profile edit (bio) | `<textarea>` | 500 |
| Profile edit (display_name) | `<input>` | 100 |
| Profile edit (phone) | `<input>` | 20 |
| Interview forms | all `<textarea>` | 5000 |
| Objective form (text) | `<textarea>` | 1000 |
| Strength session builder (name) | `<input>` | 200 |
| Strength session builder (description) | `<textarea>` | 2000 |
| Competition form (name) | `<input>` | 200 |
| Competition form (description) | `<textarea>` | 2000 |
| Strength set notes | `<input>` | 500 |
| Wellness notes | `<textarea>` | 1000 |

**Step 2: Run type check**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add -u
git commit -m "fix(forms): add maxLength to match DB CHECK constraints"
```

---

## Task 16: Frontend — Session refresh auth

**Files:**
- Modify: `src/lib/auth.ts`

**Step 1: Add session refresh logic**

Find the `onAuthStateChange` listener in `auth.ts` and enrich it. Add after the existing listener setup:

```typescript
// Session refresh timer — force refresh if no event in 55 min
let lastRefreshAt = Date.now();
const REFRESH_INTERVAL = 55 * 60 * 1000; // 55 minutes

const refreshTimer = setInterval(async () => {
  if (Date.now() - lastRefreshAt > REFRESH_INTERVAL) {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[auth] Session refresh failed, signing out', error);
        await supabase.auth.signOut();
        useAuth.getState().clearAuth();
        window.location.hash = '#/';
      } else {
        lastRefreshAt = Date.now();
      }
    } catch {
      // Network error — will retry next interval
    }
  }
}, 60 * 1000); // Check every minute
```

In the `onAuthStateChange` callback, add cases:

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session) {
    lastRefreshAt = Date.now();
    useAuth.getState().setTokens(session.access_token, session.refresh_token);
  }

  if (event === 'SIGNED_OUT') {
    useAuth.getState().clearAuth();
    window.location.hash = '#/';
  }

  // ... existing handling ...
});
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix(auth): add proactive session refresh + token expiry handling"
```

---

## Task 17: Documentation — Update CLAUDE.md + implementation-log

**Files:**
- Modify: `CLAUDE.md` (update chantier table)
- Modify: `docs/implementation-log.md` (add entry)
- Modify: `docs/FEATURES_STATUS.md` (update status)
- Modify: `docs/ROADMAP.md` (update status)

**Step 1: Add entry to implementation-log.md**

```markdown
## §100 — Remédiation Audit Complet (sécurité, perf, UX, robustesse)

**Date** : 2026-04-11
**Contexte** : Audit complet frontend + backend + Supabase ayant identifié 18 recommandations.

**Changements** :
- 7 migrations Supabase (00079-00085) : security hardening, FK indexes, pagination RPCs, aggregation RPCs, atomic transaction, CHECK constraints, notification cleanup cron
- Frontend : pagination infinite scroll (3 catalogues), atomic save strength run, run summary RPC, auto-close drawer, breadcrumbs coach, missing field indicator, dark mode toggle admin, versioned localStorage, session refresh auth, maxLength forms

**Fichiers modifiés** : ~25 fichiers (voir design doc docs/plans/2026-04-11-audit-remediation-design.md)

**Tests** : npx tsc --noEmit, npm run dev, vérification manuelle des parcours impactés

**Décisions** :
- Leaked password protection (Pro plan) exclu
- Quick-add feedback (item 9) exclu — à traiter séparément
- Dark mode : toggle admin uniquement (pas per-user)
- Index "unused" : 5/7 conservés car queries existantes pas encore éprouvées par le volume
- Offline : last-write-wins avec notification utilisateur (pas de merge complexe)
```

**Step 2: Update CLAUDE.md chantier table**

Add row: `| 64 | Remédiation audit (sécurité, perf, UX, robustesse) | Haute | Fait (§100) |`

**Step 3: Commit**

```bash
git add CLAUDE.md docs/implementation-log.md docs/FEATURES_STATUS.md docs/ROADMAP.md
git commit -m "docs: add audit remediation to implementation log + update roadmap"
```

---

## Récapitulatif d'exécution

| Task | Type | Dépendances | Durée estimée |
|------|------|------------|---------------|
| 1 | Migration DB | Aucune | — |
| 2 | Migration DB | Aucune | — |
| 3 | Migration DB | Aucune | — |
| 4 | Migration DB | Aucune | — |
| 5 | Migration DB | Task 4 (batch_upsert_1rm) | — |
| 6 | Migration DB | Aucune | — |
| 7 | Migration DB | Aucune (vérifier pg_cron activé) | — |
| 8 | Frontend API | Task 3 (RPCs doivent exister) | — |
| 9 | Frontend UI | Task 8 (API layer ready) | — |
| 10 | Frontend API+UI | Tasks 4+5 (RPCs doivent exister) | — |
| 11 | Frontend UI | Aucune | — |
| 12 | Frontend UI | Aucune | — |
| 13 | Frontend UI | Aucune | — |
| 14 | Frontend | Aucune | — |
| 15 | Frontend | Task 6 (CHECK constraints) | — |
| 16 | Frontend | Aucune | — |
| 17 | Docs | Toutes les autres | — |

**Parallélisation possible** : Tasks 1-7 (migrations) sont indépendantes entre elles sauf 5 qui dépend de 4. Tasks 11-14 (UX + robustesse frontend) sont indépendantes entre elles. Task 8-10 dépendent des migrations.

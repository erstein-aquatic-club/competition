-- §122 — Simplify timesheet RLS policies
-- Replace fragile email-join pattern (inherited from pre-migration dashboard policies,
-- mechanically wrapped in 00111 for initplan perf) with the project-standard
-- app_user_role() helper used by ~100 other policies (see 00001).
--
-- Semantics unchanged: coach/admin can read/insert/delete rows; everyone else blocked.
-- Only the implementation changes.

-- timesheet_group_labels
DROP POLICY IF EXISTS "Coaches can delete group labels" ON public.timesheet_group_labels;
CREATE POLICY "Coaches can delete group labels"
  ON public.timesheet_group_labels
  AS PERMISSIVE FOR DELETE TO public
  USING (app_user_role() = ANY (ARRAY['coach'::text, 'admin'::text]));

DROP POLICY IF EXISTS "Coaches can insert group labels" ON public.timesheet_group_labels;
CREATE POLICY "Coaches can insert group labels"
  ON public.timesheet_group_labels
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (app_user_role() = ANY (ARRAY['coach'::text, 'admin'::text]));

DROP POLICY IF EXISTS "Coaches can read group labels" ON public.timesheet_group_labels;
CREATE POLICY "Coaches can read group labels"
  ON public.timesheet_group_labels
  AS PERMISSIVE FOR SELECT TO public
  USING (app_user_role() = ANY (ARRAY['coach'::text, 'admin'::text]));

-- timesheet_shift_groups
DROP POLICY IF EXISTS "Coaches can delete shift groups" ON public.timesheet_shift_groups;
CREATE POLICY "Coaches can delete shift groups"
  ON public.timesheet_shift_groups
  AS PERMISSIVE FOR DELETE TO public
  USING (app_user_role() = ANY (ARRAY['coach'::text, 'admin'::text]));

DROP POLICY IF EXISTS "Coaches can insert shift groups" ON public.timesheet_shift_groups;
CREATE POLICY "Coaches can insert shift groups"
  ON public.timesheet_shift_groups
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (app_user_role() = ANY (ARRAY['coach'::text, 'admin'::text]));

DROP POLICY IF EXISTS "Coaches can read shift groups" ON public.timesheet_shift_groups;
CREATE POLICY "Coaches can read shift groups"
  ON public.timesheet_shift_groups
  AS PERMISSIVE FOR SELECT TO public
  USING (app_user_role() = ANY (ARRAY['coach'::text, 'admin'::text]));

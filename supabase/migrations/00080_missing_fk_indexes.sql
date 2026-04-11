-- Migration 00080: Add missing indexes on foreign keys + drop 2 confirmed unused
-- ~30 CREATE INDEX IF NOT EXISTS for JOIN/DELETE performance

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

-- Drop confirmed unused indexes (no matching query patterns)
DROP INDEX IF EXISTS public.idx_swim_exercise_logs_user_event;
DROP INDEX IF EXISTS public.idx_user_profiles_updated;

-- §162 Sprint 1 perf — Ajoute les 8 indexes FK manquants signalés par l'advisor
-- Supabase (unindexed_foreign_keys). Tables toutes petites (< 1k rows) →
-- CREATE INDEX sans CONCURRENTLY acceptable.

CREATE INDEX IF NOT EXISTS idx_planned_absences_training_slot_id
  ON public.planned_absences (training_slot_id);

CREATE INDEX IF NOT EXISTS idx_session_attendance_recorded_by
  ON public.session_attendance (recorded_by);

CREATE INDEX IF NOT EXISTS idx_session_comments_author_user_id
  ON public.session_comments (author_user_id);

CREATE INDEX IF NOT EXISTS idx_session_comments_recorded_by
  ON public.session_comments (recorded_by);

CREATE INDEX IF NOT EXISTS idx_strength_planning_slot_overrides_session_template_id
  ON public.strength_planning_slot_overrides (session_template_id);

CREATE INDEX IF NOT EXISTS idx_strength_planning_slots_session_template_id
  ON public.strength_planning_slots (session_template_id);

CREATE INDEX IF NOT EXISTS idx_swim_planning_slot_overrides_recorded_by
  ON public.swim_planning_slot_overrides (recorded_by);

CREATE INDEX IF NOT EXISTS idx_swim_planning_slots_recorded_by
  ON public.swim_planning_slots (recorded_by);

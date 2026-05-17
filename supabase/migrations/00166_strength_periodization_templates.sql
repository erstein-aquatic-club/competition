-- 00166_strength_periodization_templates.sql
-- §292 — Chantier A : référentiel des templates de périodisation du Bilan
-- Muscu. 7 templates par spécialité d'épreuve, seedés après validation
-- coach (migration séparée). RLS : lecture pour tout authentifié, écriture
-- coach/admin.
BEGIN;

CREATE TABLE strength_periodization_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_group  TEXT NOT NULL,
  name         TEXT NOT NULL,
  week_count   INTEGER NOT NULL CHECK (week_count > 0 AND week_count <= 24),
  structure    JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER strength_periodization_templates_set_updated_at
  BEFORE UPDATE ON strength_periodization_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE strength_periodization_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY spt_select ON strength_periodization_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY spt_write ON strength_periodization_templates
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

COMMIT;

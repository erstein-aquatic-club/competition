-- 00195_mesocycles_template_id_nullable.sql — §305.
-- Le modèle nage × distance compose le plan à la volée (composeTemplate) : il n'y
-- a plus de ligne strength_periodization_templates unique à référencer. Les
-- nouvelles générations posent donc template_id = NULL ; la taxonomie ciblée est
-- portée par event_group (clé composée 'freestyle_100', etc.). Les anciennes
-- lignes (template_id renseigné) restent valides — la table templates est
-- conservée. La RPC apply_strength_mesocycle est INCHANGÉE (elle insère déjà
-- p_template_id/p_event_group ; on lui passe désormais NULL/clé composée).
-- Simplification §305 (vs design initial : pas de colonnes stroke/distance ni de
-- réécriture RPC — YAGNI, event_group suffit). Design : docs/plans/2026-05-25-muscu-305-taxonomie-nage-distance-design.md
BEGIN;

ALTER TABLE strength_mesocycles
  ALTER COLUMN template_id DROP NOT NULL;

COMMIT;

-- 00183_mesocycle_session_items_recompute.sql
-- §297 — Backfill rétroactif des paramètres de chargement (sets/reps/%1RM/repos)
-- pour les items des sessions générées par un mésocycle.
--
-- Contexte : avant le fix moteur §297, `toMesocycleExercise` appliquait le
-- midRange du scheme générique uniformément à tous les items pour les cycles
-- puissance/maintien/affutage/pic, y compris :
--   • les items warmup (Face Pull à 70% 1RM, absurde)
--   • les items pliométriques (Box Jump à 70% au lieu de 0%)
--   • tous les items main au même chargement (pas de variation par exercice)
--
-- Nouvelle doctrine (cf. docs/plans/bilan-muscu-cycles-vocabulaire.md §3) :
--   1. Échauffement (block='warmup' OU bucket='mobility') → colonnes *_endurance
--      du catalogue + repos clampé à 60s.
--   2. Cycles catalogue (prepa_generale, force_max) → lecture directe catalogue.
--   3. Cycles dérivés (puissance, maintien, affutage, pic) → catalogue *_force
--      avec modulation :
--        • puissance  : pct_1rm = max(0, force - 15) ; sets/reps inchangés
--        • maintien   : sets × 0.5 (volume réduit), %1RM tenu
--        • affutage   : sets × 0.4 (volume décroissant), %1RM tenu
--        • pic        : 2 séries × clamp(reps, 2, 4), %1RM × 0.6
--
-- Ce backfill applique la nouvelle logique aux items existants (identifiables
-- via raw_payload->>'mesocycle_id'). Aucun impact sur les sessions non-méso.

BEGIN;

UPDATE strength_session_items si
   SET sets = CASE
        -- Warmup ou mobility → colonnes endurance
        WHEN si.block = 'warmup' OR si.raw_payload->>'bucket' = 'mobility'
          THEN COALESCE(d.nb_series_endurance, 2)
        -- Catalogue
        WHEN si.raw_payload->>'periodization_cycle' = 'prepa_generale'
          THEN COALESCE(d.nb_series_endurance, 2)
        WHEN si.raw_payload->>'periodization_cycle' = 'force_max'
          THEN COALESCE(d.nb_series_force, 4)
        -- Dérivés
        WHEN si.raw_payload->>'periodization_cycle' = 'puissance'
          THEN COALESCE(d.nb_series_force, 4)
        WHEN si.raw_payload->>'periodization_cycle' = 'maintien'
          THEN GREATEST(2, ROUND(COALESCE(d.nb_series_force, 4) * 0.5)::int)
        WHEN si.raw_payload->>'periodization_cycle' = 'affutage'
          THEN GREATEST(1, ROUND(COALESCE(d.nb_series_force, 4) * 0.4)::int)
        WHEN si.raw_payload->>'periodization_cycle' = 'pic'
          THEN 2
        ELSE si.sets
      END,
      reps = CASE
        WHEN si.block = 'warmup' OR si.raw_payload->>'bucket' = 'mobility'
          THEN COALESCE(d.nb_reps_endurance, 10)
        WHEN si.raw_payload->>'periodization_cycle' = 'prepa_generale'
          THEN COALESCE(d.nb_reps_endurance, 10)
        WHEN si.raw_payload->>'periodization_cycle' = 'force_max'
          THEN COALESCE(d.nb_reps_force, 5)
        WHEN si.raw_payload->>'periodization_cycle' IN ('puissance', 'maintien', 'affutage')
          THEN COALESCE(d.nb_reps_force, 5)
        WHEN si.raw_payload->>'periodization_cycle' = 'pic'
          THEN GREATEST(2, LEAST(4, COALESCE(d.nb_reps_force, 4)))
        ELSE si.reps
      END,
      pct_1rm = CASE
        WHEN si.block = 'warmup' OR si.raw_payload->>'bucket' = 'mobility'
          THEN COALESCE(d.pourcentage_charge_1rm_endurance, 0)
        WHEN si.raw_payload->>'periodization_cycle' = 'prepa_generale'
          THEN d.pourcentage_charge_1rm_endurance
        WHEN si.raw_payload->>'periodization_cycle' = 'force_max'
          THEN d.pourcentage_charge_1rm_force
        WHEN si.raw_payload->>'periodization_cycle' = 'puissance'
          THEN GREATEST(0, COALESCE(d.pourcentage_charge_1rm_force, 0) - 15)::double precision
        WHEN si.raw_payload->>'periodization_cycle' IN ('maintien', 'affutage')
          THEN d.pourcentage_charge_1rm_force
        WHEN si.raw_payload->>'periodization_cycle' = 'pic'
          THEN ROUND(COALESCE(d.pourcentage_charge_1rm_force, 0) * 0.6)::double precision
        ELSE si.pct_1rm
      END,
      rest_series_s = CASE
        WHEN si.block = 'warmup' OR si.raw_payload->>'bucket' = 'mobility'
          THEN LEAST(60, COALESCE(d.recup_series_endurance, 45))
        WHEN si.raw_payload->>'periodization_cycle' = 'prepa_generale'
          THEN COALESCE(d.recup_series_endurance, 60)
        WHEN si.raw_payload->>'periodization_cycle' IN ('force_max', 'puissance', 'maintien', 'affutage', 'pic')
          THEN COALESCE(d.recup_series_force, 180)
        ELSE si.rest_series_s
      END
  FROM dim_exercices d
 WHERE si.exercise_id = d.id
   AND si.raw_payload ? 'mesocycle_id';

COMMIT;

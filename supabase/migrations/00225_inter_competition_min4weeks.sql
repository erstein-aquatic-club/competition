-- §366 — Abaisse le minimum inter_competition de 5 à 4 semaines.
--
-- Avant : puissance.min_weeks = 2 → Σ min = 5 → impossible de générer un
-- méso inter_competition avec 4 semaines restantes avant une compétition.
-- Après : puissance.min_weeks = 1 → Σ min = 4 → cycle 1+1+1+1 autorisé.
--
-- Cycle 4 sem : maintien(1) → puissance(1) → affûtage(1) → pic(1).
-- Physiologiquement défendable pour un pic court avant une compétition rapprochée.

-- 1. Profils : min_week_count 5 → 4
UPDATE strength_distance_profiles
SET min_week_count = 4,
    updated_at     = now()
WHERE kind = 'inter_competition'
  AND min_week_count = 5;

-- 2. Phases : puissance.min_weeks 2 → 1 dans le JSONB structure.phases
UPDATE strength_distance_profiles
SET structure   = jsonb_set(
                    structure,
                    '{phases}',
                    (
                      SELECT jsonb_agg(
                        CASE
                          WHEN phase->>'cycle' = 'puissance'
                          THEN jsonb_set(phase, '{min_weeks}', '1'::jsonb)
                          ELSE phase
                        END
                        ORDER BY ordinality
                      )
                      FROM jsonb_array_elements(structure->'phases')
                           WITH ORDINALITY AS t(phase, ordinality)
                    )
                  ),
    updated_at  = now()
WHERE kind = 'inter_competition';

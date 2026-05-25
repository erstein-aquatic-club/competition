-- 00198_stroke_prehab_affinity.sql — §306 Phase 2 (préhab proactif event-aware).
-- Colonne d'affinité préhab par nage sur dim_exercices : un exo tagué pour une
-- nage est PRÉFÉRÉ (remonté dans son seau, au-dessus des non-cores ordinaires)
-- quand le mésocycle cible cette nage — sans déloger un core de force.
-- selectExercises lit cette colonne via une passe de préférence (mesocycleEngine).
--
-- V1 — brasse → adducteurs : Copenhague (58), Fente latérale (37), Squat bulgare
-- (33). Extensible (coiffe/épaule → crawl/fly/dos) ; à compléter coach.
-- Colonne nullable (mapper applique `?? []`). Idempotent (ADD COLUMN IF NOT EXISTS).
-- Aucune policy/RLS touchée.
BEGIN;

ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS stroke_prehab_affinity text[];

UPDATE dim_exercices
SET stroke_prehab_affinity = ARRAY['breaststroke']
WHERE id IN (58, 37, 33);

COMMIT;

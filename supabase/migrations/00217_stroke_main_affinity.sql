-- §366 — affinité de nage des exercices principaux (tirage signature par nage).
--
-- Mécanisme : `selectExercises` (moteur mésocycle) épingle un exo « signature »
-- comme staple pour les nages listées et le rétrograde en neutre pour les autres.
-- Affinité NULL/vide ⇒ sélection inchangée (rétrocompat totale).
ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS stroke_main_affinity text[];

-- Dos : le tirage vertical unilatéral supination (id 11) devient le staple dos
-- (geste alterné, proche du dos), à la place du pulldown « schéma papillon ».
UPDATE dim_exercices SET stroke_main_affinity = ARRAY['backstroke'] WHERE id = 11;

-- Straight-arm pulldown « schéma papillon » (id 12) : reste staple pour toutes
-- les nages SAUF le dos (retiré du dos uniquement, comportement inchangé ailleurs).
UPDATE dim_exercices
SET stroke_main_affinity = ARRAY['freestyle','butterfly','breaststroke','medley']
WHERE id = 12;

-- 00197_contraindication_groin_adductors.sql — §306 Phase 1 (défensif).
-- Rend la douleur adducteurs/aine EFFECTIVE : tague les exos qui chargent
-- franchement les adducteurs avec left_groin/right_groin (zones désormais
-- déclarables depuis le body-map, §306). Le moteur (selectExercises) exclut
-- alors ces exos quand l'aine est douloureuse, et l'override force la mobilité
-- si la douleur est intense — logique déjà générique, aucun code moteur touché.
--
-- Liste focalisée (à valider coach) — exos clairement adducteurs/coup-de-pied :
--   58 Planche Copenhague, 37 Fente latérale, 33 Squat bulgare,
--   36 Soulevé de terre roumain unilat. (lower_strength) ;
--   76 Fente sautée alternée, 92 départ avec ceinture (lower_power).
-- Volontairement PAS tous les exos « hanche » (sur-exclusion évitée).
--
-- Append GARDÉ idempotent (n'ajoute que si absent ; préserve l'ordre existant).
-- Donnée seule — aucune policy/RLS/structure touchée. Réversible.
BEGIN;

UPDATE dim_exercices
SET contraindication_zones = contraindication_zones || ARRAY['left_groin','right_groin']::text[]
WHERE id IN (58, 37, 33, 36, 76, 92)
  AND NOT ('left_groin' = ANY(contraindication_zones));

COMMIT;

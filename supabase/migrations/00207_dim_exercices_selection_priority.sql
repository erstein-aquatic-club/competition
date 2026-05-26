-- 00207 — Priorité de sélection coach (§319) : imposer les staples, démoter les exotiques.
--
-- Retour terrain (François, 50 m crawl) : l'engine servait Front Lever (au lieu
-- des tractions lestées), Gainage lesté (au lieu de roue abdos / relevé jambes),
-- Trap Bar (au lieu de Box Jump). Cause : le tri `is_core → niveau décroissant →
-- ordre catalogue` n'a aucune notion d'« exo préféré du coach » → il sert le plus
-- avancé/composé ou un arbitraire.
--
-- Solution : colonne `selection_priority` (entier, défaut 0) triée EN PREMIER
-- dans `selectExercises` (cf. mesocycleEngine.ts §319). Plus haut = préféré ;
-- négatif = démoté (sans retirer l'exo du catalogue). Défaut 0 = comportement
-- historique inchangé pour tous les exos non seedés.
--
-- Seed validé coach (staples sprint façon McEvoy) :
--   upper_strength : Tractions lestées (13)=100, Straight-Arm Pulldown « schéma
--                    papillon » (12)=90 ; Front Lever + variantes (62,65,66,67,69)=-10
--   upper_power    : Front Lever — Ice Cream Maker (68)=-10 (med-ball/bench pull OK par défaut)
--   lower_power    : Box Jump (8)=100
--   core           : Ab Wheel Rollout (72)=100, Relevés de jambes suspendu (23)=90 ;
--                    Gainage lesté (61)=-10
--
-- Aucune RLS/policy touchée. Réversible (DROP COLUMN ou tout remettre à 0).

ALTER TABLE dim_exercices
  ADD COLUMN IF NOT EXISTS selection_priority integer NOT NULL DEFAULT 0;

-- Staples (préférés).
UPDATE dim_exercices SET selection_priority = 100 WHERE id IN (13, 8, 72);   -- tractions lestées, box jump, roue abdos
UPDATE dim_exercices SET selection_priority = 90  WHERE id IN (12, 23);       -- pull-over fly, relevé jambes suspendu

-- Exotiques / complexes démotés (restent au catalogue, ne sont plus pioché·e·s).
UPDATE dim_exercices SET selection_priority = -10 WHERE id IN (62, 65, 66, 67, 69, 68, 61);

-- Vérif :
--   SELECT id, nom_exercice, bucket, selection_priority FROM dim_exercices
--    WHERE selection_priority <> 0 ORDER BY bucket, selection_priority DESC;

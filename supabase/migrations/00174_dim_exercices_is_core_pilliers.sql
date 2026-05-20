-- 00174_dim_exercices_is_core_pilliers.sql
-- §293-fix : rééquilibrage du tag `is_core` sur dim_exercices.
--
-- Au §291, `is_core` a été interprété comme « exercice de gainage / tronc »
-- (Ab Wheel, L-Sit, Plank walkout, Relevés de jambes suspendus). Or
-- sémantiquement, `is_core` doit signifier « exercice fondamental du seau,
-- affiché en premier par le moteur » (cf. CatalogExercise.isCore — sortie
-- priorisée dans selectExercises).
--
-- Cette migration ajoute le drapeau aux PILIERS des seaux (constatés sur la
-- prépa McEvoy de F. Wagner — `training_plans` id=2), sans toucher aux
-- exercices de gainage déjà flaggés.
--
-- Conséquence côté moteur : pour un template focalisé puissance (sprint_50),
-- les Tractions lestées / Squat arrière / Trap Bar Jump / Bench Pull sortiront
-- au sommet du pool selectExercises et seront retenus en premier dans les
-- séances générées.

BEGIN;

UPDATE dim_exercices
   SET is_core = true
 WHERE id IN (
   -- upper_strength : piliers du tirage / poussée
   13,  -- Tractions lestées
   5,   -- Tractions prise neutre
   60,  -- Bench Pull
   14,  -- Dips
   77,  -- Pike Push-Up (pieds surélevés)
   62,  -- Front Lever (calisthenics avancé)
   -- lower_strength : pilier squat
   26,  -- Squat arrière
   33,  -- Squat bulgare
   -- lower_power : piliers explosifs
   7,   -- Soulevé de terre trap bar
   90,  -- Trap Bar Jump
   8,   -- Box Jump
   27,  -- Squat sauté
   20,  -- Squat sauté chargé léger
   -- upper_power : piliers (seau peu peuplé, ces 2 = essentiels)
   17,  -- Bench Pull explosif
   53,  -- Lancer rotatif médecine-ball
   -- mobility : préhab postérieure pour nageurs
   49   -- Face Pull
 );

COMMIT;

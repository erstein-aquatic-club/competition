-- 00214_strength_catalog_rest_volume_coherence.sql
-- §332 — Cohérence de durée des séances muscu (retour terrain François, butterfly_50).
--
-- Trois exercices staples portaient des valeurs catalogue qui gonflaient les
-- séances de développement (jusqu'à 77-81 min) sans bénéfice physiologique :
--   * Tractions lestées (#13) et Soulevé de terre trap bar (#7) : repos force 330 s
--     (5,5 min) = haut extrême. Ramené à 210 s (3,5 min), pleinement dans la zone
--     force max (3-5 min) → -10 min/séance sur les semaines de construction.
--   * Lancer rotatif médecine-ball (#53) : 6 séries de force pour un exo explosif où
--     la qualité chute avec la fatigue. Ramené à 4 séries (volume explosif standard).
--
-- Le repos des cycles dérivés (puissance/affûtage/pic) est par ailleurs borné dans
-- la bande config par le moteur (clampToRange, mesocycleEngine.ts, §332) — ces
-- valeurs catalogue ne pèsent donc plus que sur les semaines `force_max`.
--
-- L'amorce PAP est immunisée (repos 180/150 s + 2 séries codés en dur dans le
-- moteur) — ces UPDATE ne la touchent pas.
--
-- Aucun impact RLS : données seedées de dim_exercices, pas de policy ni de DDL.

UPDATE public.dim_exercices SET recup_series_force = 210 WHERE id = 13; -- Tractions lestées
UPDATE public.dim_exercices SET recup_series_force = 210 WHERE id = 7;  -- Soulevé de terre trap bar
UPDATE public.dim_exercices SET nb_series_force   = 4   WHERE id = 53; -- Lancer rotatif médecine-ball

-- 00204 — Catalogue : nouveau bucket `core` + re-tag des exercices de tronc.
--
-- ⚠️ DRAFT — NON APPLIQUÉE EN PROD. Le périmètre des exercices re-taggés est une
--    DÉCISION D'ENTRAÎNEMENT → À VALIDER COACH avant tout `apply_migration`
--    (cf. docs/plans/2026-05-26-muscu-seau-core-r5-design.md §3).
--
-- Contexte : les exercices de tronc (gainage, anti-rotation, anti-extension,
-- flexion/extension du tronc, ondulation) étaient dispersés dans `upper_strength`
-- et `lower_strength`. On crée le seau `core` et on les y regroupe.
--
-- Re-tag (12 exercices, ids vérifiés sur prod 2026-05-26) :
--   id 78 Hollow Body Hold            (US → core, is_core true)  anti-extension/streamline
--   id 61 Gainage lesté               (US → core, is_core true)  anti-extension
--   id 47 Planche latérale            (US → core)                anti-flexion latérale
--   id 82 Planche dynamique (touché)  (US → core)                anti-rotation dynamique
--   id 79 Planche instable (Swiss)    (US → core)                anti-extension instable
--   id 45 Pallof Press                (US → core, is_core true)  ANTI-ROTATION (crawl/dos)
--   id 46 Dead Bug                    (US → core, is_core true)  anti-extension contrôle
--   id 72 Ab Wheel Rollout            (US → core)                anti-extension avancé
--   id 23 Relevés de jambes suspendu  (US → core)                flexion-tronc
--   id 75 Plank walkout (Inchworm)    (US → core)                anti-extension dynamique
--   id 32 Abdos                       (US → core)                flexion-tronc basique
--   id 80 Superman dynamique          (LS → core, is_core true)  EXTENSION/ONDULATION (fly/dos)
--
-- NE bougent PAS (restent upper_power, alimentent le KPI/PAP puissance) :
--   id 53 Lancer rotatif médecine-ball, id 54 Lancer latéral médecine-ball.
--   → balistique (puissance), pas du gainage. À VALIDER COACH si on veut un
--     doublon core pour le lancer rotatif (transfert tronc dynamique).
--
-- Réversible : ré-affecter chaque id à son bucket d'origine (US/LS) + restaurer
-- is_core (voir bloc commenté en fin de fichier).

BEGIN;

-- 0) Élargir le CHECK de bucket pour accepter 'core'.
ALTER TABLE dim_exercices
  DROP CONSTRAINT IF EXISTS dim_exercices_bucket_check;
ALTER TABLE dim_exercices
  ADD CONSTRAINT dim_exercices_bucket_check
  CHECK (bucket IS NULL OR bucket = ANY (ARRAY[
    'lower_strength','lower_power','upper_strength','upper_power','mobility','core'
  ]));

-- 1) Re-tag des 12 exercices de tronc vers `core`.
UPDATE dim_exercices SET bucket = 'core'
  WHERE id IN (78, 61, 47, 82, 79, 45, 46, 72, 23, 75, 32, 80);

-- 2) is_core (exos « fondamentaux » du seau, remontés en premier par le moteur).
--    Couvre les 4 familles : anti-extension (78, 61, 46), anti-rotation (45),
--    extension/ondulation (80). Les autres restent accessoires.
UPDATE dim_exercices SET is_core = true  WHERE id IN (78, 61, 46, 45, 80);
UPDATE dim_exercices SET is_core = false WHERE id IN (47, 82, 79, 72, 23, 75, 32);

COMMIT;

-- Vérif lecture (post-apply) :
--   SELECT bucket, count(*) FROM dim_exercices GROUP BY bucket ORDER BY bucket;
--     → core attendu = 12 ; upper_strength 37→26 ; lower_strength 19→18.
--
-- TODO (nice-to-have, NON bloquant) : ajouter un branch CASE « Tronc » au label
--   de session dans la RPC apply_strength_mesocycle (00181) — sinon un slot core
--   s'affiche « core » brut (le ELSE v_primary_bucket gère déjà ce cas sans crash).
--
-- ── Rollback (réversibilité) ──────────────────────────────────────────────────
-- BEGIN;
--   UPDATE dim_exercices SET bucket = 'upper_strength'
--     WHERE id IN (78, 61, 47, 82, 79, 45, 46, 72, 23, 75, 32);
--   UPDATE dim_exercices SET bucket = 'lower_strength' WHERE id = 80;
--   UPDATE dim_exercices SET is_core = true  WHERE id = 80;   -- était core en LS
--   UPDATE dim_exercices SET is_core = false WHERE id IN (78, 61, 47, 82, 79, 45, 46, 72, 23, 75, 32);
--   -- (optionnel) re-resserrer le CHECK sans 'core'.
-- COMMIT;

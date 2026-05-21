-- 00184_catalog_force_params_audit.sql
-- §297-bis — Audit catalog force_params : fix 4 exos qui avaient des
-- paramètres `*_force` NULL ou 0 alors qu'ils sont sémantiquement des
-- mouvements lestés.
--
-- Distinction (user feedback) :
--   • Tractions (prise neutre id 5, scap pull up id 71, élastiques id 95) :
--     PDC OU lestée selon niveau → pct_force = 0 légitimement ambivalent.
--   • Pliométrie pure (Box Jump, Trap Bar Jump, etc.) : pct_force = 0 définitif.
--   • Calisthenics gainage (L-Sit, Hollow Body, planches…) : pct_force = 0 définitif.
--   • Lancers médecine-ball : pct_force = 0 définitif.
--   • **Bench Pull, Power Clean, Hang Clean, glute machine** : doivent
--     impérativement être lestés → fix.
--
-- Aussi : cleanup NULL → 0 sur les exos calisthenics/pliométrie qui avaient
-- des NULL au lieu de 0 explicite (cohérence catalogue, évite les fallback
-- silencieux côté moteur).

BEGIN;

-- ── 1. Fix les 4 bugs critiques ────────────────────────────────────────────

-- Bench Pull (id 60) — tirage horizontal à la barre, force max classique
UPDATE dim_exercices
   SET nb_series_force = 5,
       nb_reps_force = 5,
       pourcentage_charge_1rm_force = 70,
       recup_series_force = 240
 WHERE id = 60;

-- Power Clean (id 63) — épaulé sol-suspension, force-vitesse olympique
UPDATE dim_exercices
   SET nb_series_force = 5,
       nb_reps_force = 3,
       pourcentage_charge_1rm_force = 75,
       recup_series_force = 240
 WHERE id = 63;

-- Hang Clean (id 64) — épaulé départ debout, idem
UPDATE dim_exercices
   SET nb_series_force = 5,
       nb_reps_force = 3,
       pourcentage_charge_1rm_force = 75,
       recup_series_force = 240
 WHERE id = 64;

-- glute machine (id 93) — machine fessiers, charge progressive
UPDATE dim_exercices
   SET pourcentage_charge_1rm_force = 65
 WHERE id = 93;

-- ── 2. Cleanup NULL → 0 sur les calisthenics/pliométrie/lancers PDC ────────
-- Exos sans charge (catégorie A/B/C de l'audit). NULL → 0 explicite.
-- Sets/reps fallback aussi pour éviter les valeurs par défaut du moteur.

UPDATE dim_exercices
   SET pourcentage_charge_1rm_force = COALESCE(pourcentage_charge_1rm_force, 0),
       nb_series_force = COALESCE(nb_series_force, 4),
       nb_reps_force = COALESCE(nb_reps_force, 5),
       recup_series_force = COALESCE(recup_series_force, 120)
 WHERE id IN (
   -- Calisthenics / gainage upper (PDC légitime)
   61,  -- Gainage lesté (le nom dit "lesté" mais c'est du gainage isométrique)
   62, 65, 66, 67, 68, 69,  -- Front Lever variants
   70,  -- Tirage inversé (Australian Pull-Up)
   75,  -- Plank walkout
   77,  -- Pike Push-Up (pieds surélevés) — calisthenics
   78,  -- Hollow Body Hold
   79,  -- Planche instable (Swiss Ball)
   82,  -- Planche dynamique
   -- Pliométrie / sauts (PDC définitif)
   76,  -- Fente sautée alternée
   81,  -- Mountain Climbers
   90,  -- Trap Bar Jump
   -- Rowing élastique (résistance variable, pas %1RM)
   73, 74,
   -- Lower strength variantes calisthenics
   80   -- Superman dynamique
 )
   AND (
     pourcentage_charge_1rm_force IS NULL
     OR nb_series_force IS NULL
     OR nb_reps_force IS NULL
     OR recup_series_force IS NULL
   );

COMMIT;

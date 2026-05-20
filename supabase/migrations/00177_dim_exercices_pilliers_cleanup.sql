-- 00177_dim_exercices_pilliers_cleanup.sql
-- §294 — Nettoyage du tag is_core sur upper_strength + ajout d'un pilier
-- accessible pour le niveau beginner.
--
-- Contexte (audit §293, 2026-05-20) :
--   * La mig 00174 (vague A McEvoy) ajoute is_core aux piliers de tirage
--     (Tractions, Bench Pull, Dips, Pike Push-Up, Front Lever) « sans toucher
--     aux exercices de gainage déjà flaggés au §291 ».
--   * Conséquence : pour un sprinter beginner, les 4 cores beginner de
--     upper_strength sont uniquement du gainage (Abdos, Plank walkout,
--     Hollow Body Hold, Planche dynamique) → buildSession sélectionne du
--     gainage au lieu de tirage.
--   * Pour un sprinter advanced, le tri level desc fait remonter L-Sit
--     (gainage advanced) avant Tractions prise neutre (pilier intermediate).
--
-- Cette migration :
--   1. Crée un pilier accessible au niveau beginner : "Tractions élastiques"
--      (= traction verticale à la barre fixe, avec un élastique placé sous
--      les pieds ou genoux pour décharger le mouvement).
--   2. Retire is_core des 8 exercices de gainage hérités du §291 sur le
--      seau upper_strength — la sémantique de is_core reste « pilier de
--      seau » comme attendu par selectExercises (Vague A McEvoy).
--
-- Effet engine post-migration :
--   * beginner : primary upper_strength = Tractions élastiques (+ fallback)
--   * intermediate : primary = Tractions prise neutre + Dips (inchangé)
--   * advanced : primary = Tractions lestées + Front Lever (inchangé)
--
-- Aucun exercice n'est supprimé — le gainage reste dispo dans le pool
-- non-core, sélectionnable en complement / maintien.

BEGIN;

-- ── 1. Création du pilier beginner ──────────────────────────────────────────
INSERT INTO dim_exercices (
  nom_exercice,
  description,
  illustration_gif,
  exercise_type,
  exercise_subtype,
  nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance,
    recup_series_endurance, recup_exercices_endurance,
  nb_series_hypertrophie, nb_reps_hypertrophie, pourcentage_charge_1rm_hypertrophie,
    recup_series_hypertrophie, recup_exercices_hypertrophie,
  nb_series_force, nb_reps_force, pourcentage_charge_1rm_force,
    recup_series_force, recup_exercices_force,
  bucket,
  level,
  is_core,
  contraindication_zones
) VALUES (
  'Tractions élastiques',
  'Tractions verticales à la barre fixe assistées par un élastique placé sous les pieds (ou les genoux pour plus d''assistance). Mouvement entrée pour développer la force de tirage chez le nageur débutant, avant de progresser vers la traction prise neutre puis lestée. Garder les épaules basses, contrôle des omoplates, amplitude complète.',
  NULL,                       -- illustration_gif à fournir
  'strength',
  'strength_accessory',
  -- endurance
  3, 12, 0,    90, 180,
  -- hypertrophie
  3, 10, 0,   120, 180,
  -- force (charge=0 car PDC assisté ; le moteur sprint utilisera surtout
  -- force_max et puissance via les cycles génériques)
  4, 8, 0,    180, 240,
  'upper_strength',
  'beginner',
  true,
  ARRAY['left_shoulder','right_shoulder','left_elbow','right_elbow']
);

-- ── 2. Cleanup is_core sur les 8 exercices de gainage upper_strength ────────
-- (le gainage reste dans le catalogue mais n'est plus considéré comme
--  « pilier de seau » par selectExercises)
UPDATE dim_exercices
   SET is_core = false
 WHERE bucket = 'upper_strength'
   AND id IN (
     15,  -- L-Sit
     23,  -- Relevés de jambes suspendu
     32,  -- Abdos
     72,  -- Ab Wheel Rollout
     75,  -- Plank walkout (Inchworm)
     78,  -- Hollow Body Hold
     79,  -- Planche instable (Swiss Ball)
     82   -- Planche dynamique (touché épaule)
   );

COMMIT;

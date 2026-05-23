-- 00186_intensity_metric.sql
-- §298 — Métrique d'intensité par exercice : Box Jump → hauteur cm, etc.

-- A) Métrique d'intensité au catalogue
ALTER TABLE dim_exercices
ADD COLUMN IF NOT EXISTS intensity_metric TEXT NOT NULL DEFAULT 'weight_kg'
  CHECK (intensity_metric IN ('weight_kg','height_cm','distance_cm','time_s'));

COMMENT ON COLUMN dim_exercices.intensity_metric IS
  'Métrique d''intensité : weight_kg (défaut, charge + %1RM), height_cm (Box Jump), distance_cm (saut longueur), time_s (gainage). Pilote l''UI runner + le gating 1RM.';

-- B) Cible absolue prescrite par le coach (métriques non-poids)
ALTER TABLE strength_session_items
ADD COLUMN IF NOT EXISTS target_intensity DOUBLE PRECISION;

COMMENT ON COLUMN strength_session_items.target_intensity IS
  'Cible absolue (cm/s) prescrite par le coach pour les exos dont intensity_metric != weight_kg. NULL = libre.';

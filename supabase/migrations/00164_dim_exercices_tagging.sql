-- 00164_dim_exercices_tagging.sql
-- §291 — Chantier A : colonnes de tagging du catalogue d'exercices pour le
-- moteur Bilan Muscu. Colonnes nullable ; le mapping des 94 exercices est
-- seedé après validation coach (migration séparée).
BEGIN;

ALTER TABLE dim_exercices
  ADD COLUMN bucket TEXT
    CHECK (bucket IN ('lower_strength','lower_power','upper_strength','upper_power','mobility')),
  ADD COLUMN contraindication_zones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN level TEXT
    CHECK (level IN ('beginner','intermediate','advanced'));

CREATE INDEX dim_exercices_bucket_idx ON dim_exercices (bucket) WHERE bucket IS NOT NULL;

COMMIT;

-- 00183_dim_exercices_is_bodyweight.sql
-- §297 — Flag is_bodyweight pour distinguer les exos au poids de corps
-- (pas de 1RM requis, UI Charge masquée pendant la séance).
ALTER TABLE dim_exercices
ADD COLUMN IF NOT EXISTS is_bodyweight BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN dim_exercices.is_bodyweight IS
  'Si TRUE, exercice au poids de corps : le OneRmGate ignore cet exo et le WorkoutRunner masque le champ Charge (log auto avec BODYWEIGHT_SENTINEL).';

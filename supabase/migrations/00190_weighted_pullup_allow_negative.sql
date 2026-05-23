-- §301 T1 — weighted_pullup : autoriser une charge ≤ 0.
--
-- Le KPI « traction lestée » mesure la charge ADDITIONNELLE max sur 1 traction.
-- Pour les nageurs faibles (ados, filles, débutants), cette charge peut être
-- nulle (1 traction au poids de corps) ou NÉGATIVE (traction assistée à
-- l'élastique). Le barème `weighted_pullup` (kpiBaremes.ts) a d'ailleurs des
-- ancres ≤ 0 (jusqu'à -10 kg). L'ancien CHECK `value >= 0` rendait ces mesures
-- impossibles → le seau force-haut tombait à `null` pour la population même que
-- le barème vise à mesurer.
--
-- On relâche le CHECK pour ce seul KPI ; les 4 autres restent strictement
-- positifs. Aucune RLS touchée (simple contrainte CHECK).

ALTER TABLE strength_kpi_measurements
  DROP CONSTRAINT IF EXISTS strength_kpi_measurements_value_check;

ALTER TABLE strength_kpi_measurements
  ADD CONSTRAINT strength_kpi_measurements_value_check
  CHECK (value >= 0 OR kpi_key = 'weighted_pullup');

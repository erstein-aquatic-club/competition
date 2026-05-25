-- 00192_retag_tractions_lestees_intermediate.sql
-- §304 (écart GA) — cohérence KPI ↔ prescription. Le KPI weighted_pullup est
-- mesuré dès l'intermédiaire ; l'unique exo de traction lestée doit l'être
-- aussi. Tractions lestées (id 13) : advanced → intermediate.
-- Design : docs/plans/2026-05-25-muscu-304-couplage-niveau-tier-design.md §3.
BEGIN;

UPDATE dim_exercices
  SET level = 'intermediate'
  WHERE id = 13 AND nom_exercice = 'Tractions lestées';

COMMIT;

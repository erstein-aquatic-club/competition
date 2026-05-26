-- 00206 — 50 m crawl plus fidèle à la prépa McEvoy (audit terrain François §318).
--
-- Deux défauts constatés sur un 50 m crawl généré, vs la référence McEvoy
-- (`docs/plans/bilan-muscu-templates-sources.md` T1 `sprint_50`) :
--
-- #1 RÉPÉTITION — `Soulevé de terre trap bar` (id 7) était `bucket=lower_power`,
--    comme `Trap Bar Jump` (id 90). Le soulevé 5×3 @85 % est un mouvement de
--    FORCE MAX, pas de puissance. Avec `lower_power` en seau focus, l'allocation
--    piochait les DEUX trap-bar → répétition. Re-tag en `lower_strength` (sa
--    vraie qualité) → puissance (sauts/cleans) et force (squat/SDT) séparées.
--
-- #3 EMPHASE — `upper_power` du profil 50 m était 0.50, alors que la référence
--    McEvoy dit 1.0 (« le 50 m est une épreuve de puissance quasi pure ; la
--    traction explosive domine »). À 0.50, la puissance haute n'était pas un
--    focus → aucune traction explosive / med-ball dans la séance. Remontée à
--    0.95 (≈1.0 McEvoy) → devient co-focus avec `upper_strength`.
--    ⚠️ Profil 50 stroke-agnostic : composé, ça relève aussi papillon/dos 50
--    (clampé à 1.0) — cohérent (sprints explosifs), validé coach.
--
-- Aucune RLS/policy touchée. Réversible (valeurs d'origine : id 7 lower_power ;
-- 50 upper_power 0.50).

BEGIN;

-- #1 — le soulevé de terre trap bar est un mouvement de force, pas de puissance.
UPDATE dim_exercices SET bucket = 'lower_strength' WHERE id = 7;

-- #3 — 50 m : la puissance haute (traction explosive) domine (McEvoy).
UPDATE strength_distance_profiles
   SET emphasis = jsonb_set(emphasis, '{upper_power}', '0.95'::jsonb), updated_at = now()
 WHERE distance_key = '50';

COMMIT;

-- Vérif :
--   SELECT bucket FROM dim_exercices WHERE id = 7;                       -- lower_strength
--   SELECT distance_key, emphasis->>'upper_power' FROM strength_distance_profiles WHERE distance_key='50';  -- 0.95 (×2)

-- 00199_audit_recalibration_r3_r6.sql — recos R3 + R6 de l'audit matrice
-- (docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md).
--
-- R3 (dos, 🟠) : signature backstroke lower_strength ×0.857 → ×0.95. La réduction
--   ×0.857 n'était pas étayée — le dos s'appuie lourdement sur le coup de pied
--   dauphin au mur (ischios/fessiers) + des départs explosifs → besoin de force
--   jambes comparable au crawl. ⚠️ Modifie une valeur SEEDÉE HISTORIQUEMENT
--   (reproduit l'ancien template dos au 200 m), pas de-novo → à valider coach.
--   Effet composé lower_strength dos : 50 .73→.81, 100 .70→.78, 200 .60→.67, 400+ .69→.76.
--
-- R6 (100 m, 🟡) : profil distance 100 upper_power 0.60 → 0.65 (les 2 kinds
--   season/inter_competition). Le 100 soutient la puissance plus longtemps que
--   le 50 ; nudge optionnel de l'audit (le 100 m était déjà ✅ validé).
--   Effet composé upper_power 100 m : crawl .60→.65, papillon .81→.88,
--   dos .68→.73, brasse .45→.49, 4n .60→.65.
--
-- jsonb_set préserve les autres clés. Donnée seule, aucune policy/RLS touchée.
-- Réversible (restaurer backstroke lower_strength=0.857 ; 100 upper_power=0.60).
BEGIN;

-- R3 — dos
UPDATE strength_stroke_signatures
SET mult = jsonb_set(mult, '{lower_strength}', '0.95'::jsonb)
WHERE stroke_key = 'backstroke';

-- R6 — 100 m (season + inter_competition)
UPDATE strength_distance_profiles
SET emphasis = jsonb_set(emphasis, '{upper_power}', '0.65'::jsonb)
WHERE distance_key = '100';

COMMIT;

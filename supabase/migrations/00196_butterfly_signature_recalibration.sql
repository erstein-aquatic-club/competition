-- 00196_butterfly_signature_recalibration.sql — R1 de l'audit matrice §305.
--
-- Recalibre la SIGNATURE PAPILLON (strength_stroke_signatures), seule nage
-- 100 % de-novo (aucun template historique — cf. 00193:7). L'audit
-- docs/audits/2026-05-25-audit-muscu-matrice-complete-vs-elite.md (§4-A, R1) la
-- juge sous-pondérée sur deux seaux vs l'élite mondiale du papillon :
--   • upper_power : ×1.05 → ×1.35  (le tirage à deux bras est le plus balistique
--     de la natation ; à ×1.05 l'upper_power composé valait ~la moitié du
--     lower_power au 50/100 — réf. Dressel / med-ball RCT 2021).
--   • mobility    : ×1.15 → ×1.35  (le papillon a la charge épaule + rachis
--     thoracique + lombaire + cheville la plus élevée ; 0.35 au 50 fly trop bas).
--
-- Inchangés : lower_strength (1.0), lower_power (1.15), upper_strength (1.0).
-- L'option upper_strength ×1.0 → 1.05 (R1) est VOLONTAIREMENT omise : impact
-- marginal (seul le 100/200 bougent, le 50/400 sont déjà clampés à 1.0) et la
-- littérature juge ×1.0 acceptable. À rouvrir si le coach le souhaite.
--
-- Limite structurelle (à connaître) : une signature est un scalaire par seau,
-- distance-agnostique. Elle RELÈVE le niveau global d'upper_power du papillon
-- mais ne peut PAS inverser l'ordre par distance (50 < 100 < 200), qui vient du
-- profil distance ancré crawl (strength_distance_profiles). « Sprint = upper_power
-- le plus haut » exigerait un profil papillon-spécifique (hors périmètre R1).
--
-- Effet sur l'emphasis composé papillon (= distance.emphasis × mult, round2,
-- clamp01) — format LS / LP / US / UP / MOB :
--   distance   avant (×1.05/×1.15)        après (×1.35/×1.35)
--   50    .85 / 1.0 / 1.0 / .53 / .35  →  .85 / 1.0 / 1.0 / .68 / .41
--   100   .82 / .98 / .97 / .63 / .48  →  .82 / .98 / .97 / .81 / .57
--   200   .70 / .86 / .90 / .84 / .69  →  .70 / .86 / .90 / 1.0 / .81
--   400+  .80 / .69 / 1.0 / .68 / .92  →  .80 / .69 / 1.0 / .88 / 1.0
--
-- Donnée seule (UPDATE 1 ligne) — aucune policy/RLS/structure touchée.
-- Réversible : restaurer mult upper_power=1.05, mobility=1.15.
-- Statut barème : de-novo, À VALIDER COACH (comme à la livraison §305).
BEGIN;

UPDATE strength_stroke_signatures
SET mult = '{"lower_strength":1.0,"lower_power":1.15,"upper_strength":1.0,"upper_power":1.35,"mobility":1.35}'::jsonb
WHERE stroke_key = 'butterfly';

COMMIT;

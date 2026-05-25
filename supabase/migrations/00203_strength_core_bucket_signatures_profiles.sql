-- 00203 — Seau « tronc / core » (R5) : clé `core` dans signatures + profils.
--
-- ⚠️ DRAFT — NON APPLIQUÉE EN PROD. Les valeurs d'emphase core sont une DÉCISION
--    D'ENTRAÎNEMENT → À VALIDER COACH avant tout `apply_migration` (cf.
--    docs/plans/2026-05-26-muscu-seau-core-r5-design.md).
--
-- Contexte : le moteur n'avait que 5 seaux entraînables. Le tronc (ondulation
-- papillon/dos, rotation crawl/dos, gainage/streamline) n'était pilotable
-- qu'indirectement (dispersé dans upper/lower_strength). On ajoute un 6ᵉ seau
-- `core`, composé comme les autres (composeTemplate) :
--   emphasis_core = clamp01(round2(profil.emphasis.core × signature.mult.core)).
--
-- Matrice proposée (À VALIDER COACH) — cf. design R5 §1 :
--   • emphase core par distance (ancrée crawl) : 50→0.45, 100→0.50, 200→0.60,
--     400plus→0.65, fond→0.70. Socle permanent, jamais nul.
--   • signature core par nage : crawl 1.0, papillon 1.40 (ondulation = max),
--     dos 1.25, 4 nages 1.30, brasse 0.85.
--
-- `jsonb_set` préserve les 5 clés existantes. Aucune RLS/policy touchée (tables
-- de référence en lecture seule côté app). Réversible : retirer la clé `core`
--   `UPDATE … SET mult = mult - 'core'` / `emphasis = emphasis - 'core'`.
--
-- Ordre d'application (post-validation coach) : 00203 PUIS 00204 (catalogue).

BEGIN;

-- 1) Signature core par nage (multiplicateur vs crawl ≡ 1.0).  [À VALIDER COACH]
UPDATE strength_stroke_signatures SET mult = jsonb_set(mult, '{core}', '1.0'::jsonb)
  WHERE stroke_key = 'freestyle';
UPDATE strength_stroke_signatures SET mult = jsonb_set(mult, '{core}', '1.40'::jsonb)
  WHERE stroke_key = 'butterfly';
UPDATE strength_stroke_signatures SET mult = jsonb_set(mult, '{core}', '1.25'::jsonb)
  WHERE stroke_key = 'backstroke';
UPDATE strength_stroke_signatures SET mult = jsonb_set(mult, '{core}', '0.85'::jsonb)
  WHERE stroke_key = 'breaststroke';
UPDATE strength_stroke_signatures SET mult = jsonb_set(mult, '{core}', '1.30'::jsonb)
  WHERE stroke_key = 'medley';

-- 2) Emphase core par distance (ancrée crawl, season + inter_competition).  [À VALIDER COACH]
UPDATE strength_distance_profiles SET emphasis = jsonb_set(emphasis, '{core}', '0.45'::jsonb)
  WHERE distance_key = '50';
UPDATE strength_distance_profiles SET emphasis = jsonb_set(emphasis, '{core}', '0.50'::jsonb)
  WHERE distance_key = '100';
UPDATE strength_distance_profiles SET emphasis = jsonb_set(emphasis, '{core}', '0.60'::jsonb)
  WHERE distance_key = '200';
UPDATE strength_distance_profiles SET emphasis = jsonb_set(emphasis, '{core}', '0.65'::jsonb)
  WHERE distance_key = '400plus';
UPDATE strength_distance_profiles SET emphasis = jsonb_set(emphasis, '{core}', '0.70'::jsonb)
  WHERE distance_key = 'fond';

COMMIT;

-- Vérif lecture (post-apply) :
--   SELECT stroke_key, mult->>'core' FROM strength_stroke_signatures ORDER BY 1;
--   SELECT distance_key, emphasis->>'core' FROM strength_distance_profiles ORDER BY 1;

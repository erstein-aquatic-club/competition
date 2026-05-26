-- 00210_stroke_aware_forced_focus.sql
-- §323 — focus forcé STROKE-AWARE sur les sprints (50/100).
--
-- Remplace le forced_focus per-distance (§322, mig 00209, ['upper_power'] sur
-- 50/100, stroke-agnostique) par un forced_focus par NAGE, que composeTemplate
-- applique uniquement aux distances sprint. L'ordre du tableau compte : le 1ᵉʳ
-- seau devient le bloc PRIMAIRE (2 exos), le 2ᵉ le complément (1 exo).
--   - pull-dominantes (crawl/papillon/dos) → ['upper_strength','upper_power']
--     (tractions lestées + pull-over fly garantis, puis bench pull explosif)
--   - brasse (jambes-dominante)            → ['lower_strength','lower_power']
--   - 4 nages (équilibrée)                 → ['upper_power','lower_power']

ALTER TABLE strength_stroke_signatures
  ADD COLUMN IF NOT EXISTS forced_focus jsonb;

UPDATE strength_stroke_signatures
  SET forced_focus = '["upper_strength","upper_power"]'::jsonb
  WHERE stroke_key IN ('freestyle', 'butterfly', 'backstroke');

UPDATE strength_stroke_signatures
  SET forced_focus = '["lower_strength","lower_power"]'::jsonb
  WHERE stroke_key = 'breaststroke';

UPDATE strength_stroke_signatures
  SET forced_focus = '["upper_power","lower_power"]'::jsonb
  WHERE stroke_key = 'medley';

-- Le forced_focus per-distance (§322) devient redondant : composeTemplate pilote
-- désormais le focus forcé des sprints via la nage. On le retire (single-source).
UPDATE strength_distance_profiles
  SET structure = structure - 'forced_focus'
  WHERE structure ? 'forced_focus';

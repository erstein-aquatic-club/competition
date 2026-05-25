-- 00202 — Profil de distance « fond » (≥ 800 m, demi-fond) — Audit 2026-05-26 (R4)
--
-- Contexte : la taxonomie §305 (00194) s'arrêtait à `400plus`, qui servait
-- 400/800/1500 avec la même emphase « 400 m » → trop de lower_power (0.60) et
-- pas assez de mobilité/préhab (0.80) pour le fond pur. L'audit matrice
-- (2026-05-25, R4) recommandait de rétablir l'emphase demi-fond historique.
--
-- Décision : séparer `fond` de `400plus`.
--   • `400plus` redevient « 400 m » (épreuve ~4 min, encore puissante).
--   • `fond` = demi-fond ≥ 800 m : moins de puissance jambes, force-économie
--     maintenue (US 1.0), mobilité/préhab au maximum (1.0). Valeurs = ancien
--     template `distance` { LS .75, LP .40, UP .45, US 1.0, MOB 1.0 }.
--
-- Arc de périodisation :
--   • season : base aérobie longue (prepa_generale) + force max (économie),
--     PAS de bloc puissance balistique (peu pertinent pour un 1500), affûtage
--     + pic conservés. Σmin=9 = min_week_count, Σmax=20 = max_week_count.
--   • inter_competition : maintien → force_max (économie) → affûtage → pic.
--     Σmin=5, Σmax=8.
--
-- Idempotent (ON CONFLICT). Aucune RLS touchée (table de référence en lecture
-- seule côté app). Les mésocycles déjà matérialisés en `*_400plus` ne sont pas
-- affectés (snapshots figés) ; seules les nouvelles générations voient `fond`.

-- 0) Le CHECK de 00194 ne connaissait pas `fond` → l'élargir.
ALTER TABLE strength_distance_profiles
  DROP CONSTRAINT IF EXISTS strength_distance_profiles_distance_key_check;
ALTER TABLE strength_distance_profiles
  ADD CONSTRAINT strength_distance_profiles_distance_key_check
  CHECK (distance_key = ANY (ARRAY['50','100','200','400plus','fond']));

-- 1) `400plus` n'absorbe plus le fond → relabel.
UPDATE strength_distance_profiles
   SET label = '400 m', updated_at = now()
 WHERE distance_key = '400plus';

-- 2) Profil fond — season + inter_competition.
INSERT INTO strength_distance_profiles
  (distance_key, kind, label, emphasis, structure, min_week_count, max_week_count)
VALUES
  (
    'fond', 'season', '800 m / 1500 m',
    '{"lower_strength":0.75,"lower_power":0.40,"upper_strength":1.0,"upper_power":0.45,"mobility":1.0}'::jsonb,
    '{"phases":[
       {"cycle":"prepa_generale","min_weeks":2,"nominal_weeks":5,"max_weeks":8},
       {"cycle":"force_max","min_weeks":3,"nominal_weeks":4,"max_weeks":5},
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}
     ]}'::jsonb,
    9, 20
  ),
  (
    'fond', 'inter_competition', '800 m / 1500 m',
    '{"lower_strength":0.75,"lower_power":0.40,"upper_strength":1.0,"upper_power":0.45,"mobility":1.0}'::jsonb,
    '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}
     ]}'::jsonb,
    5, 8
  )
ON CONFLICT (distance_key, kind) DO UPDATE
  SET label = EXCLUDED.label,
      emphasis = EXCLUDED.emphasis,
      structure = EXCLUDED.structure,
      min_week_count = EXCLUDED.min_week_count,
      max_week_count = EXCLUDED.max_week_count,
      updated_at = now();

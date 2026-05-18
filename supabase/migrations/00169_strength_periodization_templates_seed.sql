-- 00169_strength_periodization_templates_seed.sql
-- Design : docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md
-- Seed des 14 templates (7 saison + 7 mini-prépa) validés par le coach.
-- Source : docs/plans/bilan-muscu-templates-sources.md (version validée).
BEGIN;

INSERT INTO strength_periodization_templates
  (event_group, kind, name, min_week_count, max_week_count, structure)
VALUES
  -- T1 — sprint_50 · saison
  ('sprint_50', 'season', 'Sprint 50 m — Force-vitesse', 7, 15,
   '{"phases":[
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":2,"max_weeks":4},
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":3},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":3,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_power":1.0,"lower_power":0.95,"upper_strength":0.6,"lower_strength":0.55,"mobility":0.4}}'::jsonb),

  -- T2 — breaststroke · saison
  ('breaststroke', 'season', 'Brasse — Hanche & adducteurs', 7, 18,
   '{"phases":[
       {"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":3,"max_weeks":6},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"lower_power":1.0,"lower_strength":0.85,"mobility":0.8,"upper_power":0.6,"upper_strength":0.55}}'::jsonb),

  -- T3 — backstroke · saison
  ('backstroke', 'season', 'Dos — Chaîne postérieure & épaule', 7, 18,
   '{"phases":[
       {"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":3,"max_weeks":6},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_power":0.9,"upper_strength":0.85,"mobility":0.8,"lower_power":0.7,"lower_strength":0.6}}'::jsonb),

  -- T4 — 200m · saison
  ('200m', 'season', '200 m — Force-endurance mixte', 7, 18,
   '{"phases":[
       {"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":3,"max_weeks":6},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":0.9,"upper_power":0.8,"lower_power":0.75,"lower_strength":0.7,"mobility":0.6}}'::jsonb),

  -- T5 — 400m · saison
  ('400m', 'season', '400 m — Force-endurance aérobie', 9, 22,
   '{"phases":[
       {"cycle":"prepa_generale","min_weeks":2,"nominal_weeks":4,"max_weeks":7},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":3},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":1.0,"lower_strength":0.8,"mobility":0.8,"upper_power":0.65,"lower_power":0.6}}'::jsonb),

  -- T6 — distance · saison
  ('distance', 'season', 'Demi-fond — Endurance de force & préhab', 10, 23,
   '{"phases":[
       {"cycle":"prepa_generale","min_weeks":3,"nominal_weeks":5,"max_weeks":8},
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":3},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":1.0,"mobility":1.0,"lower_strength":0.75,"upper_power":0.45,"lower_power":0.4}}'::jsonb),

  -- T7 — medley · saison
  ('medley', 'season', '4 nages — Polyvalence force-puissance', 8, 21,
   '{"phases":[
       {"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":3,"max_weeks":6},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":3},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":0.85,"upper_power":0.8,"lower_power":0.8,"mobility":0.8,"lower_strength":0.75}}'::jsonb),

  -- T8 — sprint_50 · mini-prépa
  ('sprint_50', 'inter_competition', 'Sprint 50 m — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_power":1.0,"lower_power":0.95,"upper_strength":0.6,"lower_strength":0.55,"mobility":0.4}}'::jsonb),

  -- T9 — breaststroke · mini-prépa
  ('breaststroke', 'inter_competition', 'Brasse — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"lower_power":1.0,"lower_strength":0.85,"mobility":0.8,"upper_power":0.6,"upper_strength":0.55}}'::jsonb),

  -- T10 — backstroke · mini-prépa
  ('backstroke', 'inter_competition', 'Dos — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_power":0.9,"upper_strength":0.85,"mobility":0.8,"lower_power":0.7,"lower_strength":0.6}}'::jsonb),

  -- T11 — 200m · mini-prépa
  ('200m', 'inter_competition', '200 m — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":0.9,"upper_power":0.8,"lower_power":0.75,"lower_strength":0.7,"mobility":0.6}}'::jsonb),

  -- T12 — 400m · mini-prépa
  ('400m', 'inter_competition', '400 m — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":1.0,"lower_strength":0.8,"mobility":0.8,"upper_power":0.65,"lower_power":0.6}}'::jsonb),

  -- T13 — distance · mini-prépa
  ('distance', 'inter_competition', 'Demi-fond — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"force_max","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":1.0,"mobility":1.0,"lower_strength":0.75,"upper_power":0.45,"lower_power":0.4}}'::jsonb),

  -- T14 — medley · mini-prépa
  ('medley', 'inter_competition', '4 nages — Mini-prépa inter-compétitions', 5, 8,
   '{"phases":[
       {"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},
       {"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},
       {"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}],
     "bucket_emphasis":{"upper_strength":0.85,"upper_power":0.8,"lower_power":0.8,"mobility":0.8,"lower_strength":0.75}}'::jsonb);

-- Garde-fou : 14 lignes, et cohérence min/max_week_count ↔ structure.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM strength_periodization_templates;
  IF bad <> 14 THEN RAISE EXCEPTION 'Attendu 14 templates, trouvé %', bad; END IF;

  SELECT count(*) INTO bad FROM strength_periodization_templates t
  WHERE t.min_week_count <> (
      SELECT sum((p->>'min_weeks')::int)
      FROM jsonb_array_elements(t.structure->'phases') p)
     OR t.max_week_count <> (
      SELECT sum((p->>'max_weeks')::int)
      FROM jsonb_array_elements(t.structure->'phases') p);
  IF bad > 0 THEN
    RAISE EXCEPTION '% template(s) : min/max_week_count incohérent avec structure', bad;
  END IF;
END $$;

COMMIT;

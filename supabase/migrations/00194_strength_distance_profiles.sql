-- 00194_strength_distance_profiles.sql — §305.
-- Référentiel "distance" : emphase canonique par seau (ancrée crawl) + arc de
-- périodisation, par (distance_key, kind). Composé avec strength_stroke_signatures
-- à la génération (composeTemplate). emphasis crawl reproduit exactement les
-- templates crawl seedés (50/200/400). Les arcs 50/200/400plus sont repris à
-- l'identique des templates 00169 (sprint_50/200m/400m) ; 100 est de-novo
-- (sprint à pic moins dépouillé + force_max retenue — à valider coach).
-- 400plus reprend les valeurs 400 m (épreuve réaliste ; le fond rare s'y rattache).
-- min/max_week_count = Σ phases min/max. RLS calquée sur 00166.
-- Design : docs/plans/2026-05-25-muscu-305-taxonomie-nage-distance-design.md
BEGIN;

CREATE TABLE strength_distance_profiles (
  distance_key   TEXT NOT NULL CHECK (distance_key IN ('50','100','200','400plus')),
  kind           TEXT NOT NULL CHECK (kind IN ('season','inter_competition')),
  label          TEXT NOT NULL,
  emphasis       JSONB NOT NULL,
  structure      JSONB NOT NULL,
  min_week_count INTEGER NOT NULL CHECK (min_week_count > 0),
  max_week_count INTEGER NOT NULL CHECK (max_week_count >= min_week_count),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (distance_key, kind)
);

CREATE TRIGGER strength_distance_profiles_set_updated_at
  BEFORE UPDATE ON strength_distance_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE strength_distance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY sdp_select ON strength_distance_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY sdp_write ON strength_distance_profiles
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

INSERT INTO strength_distance_profiles (distance_key, kind, label, emphasis, structure, min_week_count, max_week_count) VALUES
 ('50','season','50 m',
  '{"lower_strength":0.85,"lower_power":0.9,"upper_strength":1.0,"upper_power":0.5,"mobility":0.3}',
  '{"phases":[{"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},{"cycle":"prepa_generale","min_weeks":0,"nominal_weeks":1,"max_weeks":2},{"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":3},{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  8, 16),
 ('50','inter_competition','50 m',
  '{"lower_strength":0.85,"lower_power":0.9,"upper_strength":1.0,"upper_power":0.5,"mobility":0.3}',
  '{"phases":[{"cycle":"maintien","min_weeks":1,"nominal_weeks":2,"max_weeks":3},{"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},{"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":1},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  5, 8),
 ('100','season','100 m',
  '{"lower_strength":0.82,"lower_power":0.85,"upper_strength":0.97,"upper_power":0.6,"mobility":0.42}',
  '{"phases":[{"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},{"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  8, 15),
 ('100','inter_competition','100 m',
  '{"lower_strength":0.82,"lower_power":0.85,"upper_strength":0.97,"upper_power":0.6,"mobility":0.42}',
  '{"phases":[{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},{"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":1},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  5, 7),
 ('200','season','200 m',
  '{"lower_strength":0.7,"lower_power":0.75,"upper_strength":0.9,"upper_power":0.8,"mobility":0.6}',
  '{"phases":[{"cycle":"prepa_generale","min_weeks":1,"nominal_weeks":3,"max_weeks":6},{"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},{"cycle":"puissance","min_weeks":2,"nominal_weeks":3,"max_weeks":4},{"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  7, 18),
 ('200','inter_competition','200 m',
  '{"lower_strength":0.7,"lower_power":0.75,"upper_strength":0.9,"upper_power":0.8,"mobility":0.6}',
  '{"phases":[{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":3},{"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  5, 8),
 ('400plus','season','400 m +',
  '{"lower_strength":0.8,"lower_power":0.6,"upper_strength":1.0,"upper_power":0.65,"mobility":0.8}',
  '{"phases":[{"cycle":"prepa_generale","min_weeks":2,"nominal_weeks":4,"max_weeks":7},{"cycle":"force_max","min_weeks":2,"nominal_weeks":3,"max_weeks":4},{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":3},{"cycle":"puissance","min_weeks":2,"nominal_weeks":2,"max_weeks":4},{"cycle":"affutage","min_weeks":1,"nominal_weeks":2,"max_weeks":3},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  9, 22),
 ('400plus','inter_competition','400 m +',
  '{"lower_strength":0.8,"lower_power":0.6,"upper_strength":1.0,"upper_power":0.65,"mobility":0.8}',
  '{"phases":[{"cycle":"maintien","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"force_max","min_weeks":2,"nominal_weeks":2,"max_weeks":3},{"cycle":"affutage","min_weeks":1,"nominal_weeks":1,"max_weeks":2},{"cycle":"pic","min_weeks":1,"nominal_weeks":1,"max_weeks":1}]}',
  5, 8);

COMMIT;

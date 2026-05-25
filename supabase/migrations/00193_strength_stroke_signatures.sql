-- 00193_strength_stroke_signatures.sql — §305.
-- Référentiel "signature musculaire" par nage : multiplicateur par seau vs crawl
-- (crawl ≡ 1.0). Composé avec strength_distance_profiles à la génération
-- (composeTemplate). RLS calquée sur strength_periodization_templates (00166) :
-- lecture pour tout authentifié, écriture coach/admin.
-- Calibration : mult[b] = emphase_nage[b] / crawl_200[b]. Reproduit exactement
-- les emphases brasse/dos/4nages seedées au 200 m. Papillon = de-novo (à valider
-- coach). Design : docs/plans/2026-05-25-muscu-305-taxonomie-nage-distance-design.md
BEGIN;

CREATE TABLE strength_stroke_signatures (
  stroke_key TEXT PRIMARY KEY
    CHECK (stroke_key IN ('freestyle','butterfly','backstroke','breaststroke','medley')),
  label      TEXT  NOT NULL,
  mult       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER strength_stroke_signatures_set_updated_at
  BEFORE UPDATE ON strength_stroke_signatures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE strength_stroke_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY sss_select ON strength_stroke_signatures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY sss_write ON strength_stroke_signatures
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

INSERT INTO strength_stroke_signatures (stroke_key, label, mult) VALUES
 ('freestyle','Crawl',
   '{"lower_strength":1.0,"lower_power":1.0,"upper_strength":1.0,"upper_power":1.0,"mobility":1.0}'),
 ('breaststroke','Brasse',
   '{"lower_strength":1.214,"lower_power":1.333,"upper_strength":0.611,"upper_power":0.75,"mobility":1.333}'),
 ('backstroke','Dos',
   '{"lower_strength":0.857,"lower_power":0.933,"upper_strength":0.944,"upper_power":1.125,"mobility":1.333}'),
 ('medley','4 nages',
   '{"lower_strength":1.071,"lower_power":1.067,"upper_strength":0.944,"upper_power":1.0,"mobility":1.333}'),
 ('butterfly','Papillon',
   '{"lower_strength":1.0,"lower_power":1.15,"upper_strength":1.0,"upper_power":1.05,"mobility":1.15}');

COMMIT;

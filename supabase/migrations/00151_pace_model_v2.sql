-- §186 — Pace Model v2
-- (a) Refonte coach_pace_zones : DROP + recréation schema v2 (multi-row par famille × zone)
-- Pas de données à préserver : aucun coach n'a calibré les zones v1 en production.
DROP TABLE IF EXISTS coach_pace_zones CASCADE;

CREATE TABLE coach_pace_zones (
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_family text NOT NULL CHECK (event_family IN ('50m','100m','200m','400m','800m_1500m')),
  zone text NOT NULL CHECK (zone IN ('V0','V1','V2','V3','V4','MAX')),
  k_value numeric(5,4) NOT NULL CHECK (k_value > 0 AND k_value <= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, event_family, zone)
);
ALTER TABLE coach_pace_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_zones_select_own"
  ON coach_pace_zones FOR SELECT
  USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_insert_own"
  ON coach_pace_zones FOR INSERT
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_update_own"
  ON coach_pace_zones FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_delete_own"
  ON coach_pace_zones FOR DELETE
  USING (coach_id = (SELECT auth.uid()));

-- (b) Nouvelle table coach_stroke_adjustments (override coach des mS par nage/famille)
CREATE TABLE coach_stroke_adjustments (
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stroke text NOT NULL CHECK (stroke IN ('crawl','dos','brasse','papillon')),
  event_family text NOT NULL CHECK (event_family IN ('50m','100m','200m','400m','800m_1500m')),
  m_value numeric(5,4) NOT NULL CHECK (m_value >= -0.20 AND m_value <= 0.20),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, stroke, event_family)
);
ALTER TABLE coach_stroke_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_stroke_adj_select_own"
  ON coach_stroke_adjustments FOR SELECT
  USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_stroke_adj_insert_own"
  ON coach_stroke_adjustments FOR INSERT
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_stroke_adj_update_own"
  ON coach_stroke_adjustments FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_stroke_adj_delete_own"
  ON coach_stroke_adjustments FOR DELETE
  USING (coach_id = (SELECT auth.uid()));

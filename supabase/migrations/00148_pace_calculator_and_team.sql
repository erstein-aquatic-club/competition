-- §184 — Coach Pace Calculator + Mon équipe
-- (a) Étendre coach_manual_swimmers : birthdate + sex + policy UPDATE
ALTER TABLE coach_manual_swimmers
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS sex char(1) CHECK (sex IN ('M','F'));

-- policy UPDATE manquante (édition nom/sexe/date)
CREATE POLICY "coach_manual_swimmers_update_own"
  ON coach_manual_swimmers FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (b) coach_pace_zones — overrides du défaut par coach
CREATE TABLE coach_pace_zones (
  coach_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  v0_pct     int NOT NULL DEFAULT 140 CHECK (v0_pct BETWEEN 100 AND 200),
  v1_pct     int NOT NULL DEFAULT 130 CHECK (v1_pct BETWEEN 100 AND 200),
  v2_pct     int NOT NULL DEFAULT 115 CHECK (v2_pct BETWEEN 100 AND 200),
  v3_pct     int NOT NULL DEFAULT 110 CHECK (v3_pct BETWEEN 100 AND 200),
  max_pct    int NOT NULL DEFAULT 105 CHECK (max_pct BETWEEN 100 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (v0_pct >= v1_pct AND v1_pct >= v2_pct AND v2_pct >= v3_pct AND v3_pct >= max_pct)
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
  USING  (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (c) coach_pace_targets — 1 ligne par (coach × nageur × nage × distance)
CREATE TABLE coach_pace_targets (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id             uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swimmer_account_id   bigint  REFERENCES users(id) ON DELETE CASCADE,
  swimmer_manual_id    uuid    REFERENCES coach_manual_swimmers(id) ON DELETE CASCADE,
  stroke               text    NOT NULL CHECK (stroke IN ('NL','Dos','Brasse','Pap','4N')),
  target_distance_m    int     NOT NULL CHECK (target_distance_m IN (50,100,200,400,800,1500)),
  target_time_ms       int     NOT NULL CHECK (target_time_ms > 0),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
-- partial unique indexes (supabase-js .upsert onConflict cible l'index par nom)
CREATE UNIQUE INDEX uq_pace_targets_account
  ON coach_pace_targets (coach_id, swimmer_account_id, stroke, target_distance_m)
  WHERE swimmer_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_pace_targets_manual
  ON coach_pace_targets (coach_id, swimmer_manual_id, stroke, target_distance_m)
  WHERE swimmer_manual_id IS NOT NULL;
ALTER TABLE coach_pace_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_targets_all_own"
  ON coach_pace_targets FOR ALL
  USING  (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (d) pace_share_links — token public lecture seule
CREATE TABLE pace_share_links (
  token                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id             uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swimmer_account_id   bigint  REFERENCES users(id) ON DELETE CASCADE,
  swimmer_manual_id    uuid    REFERENCES coach_manual_swimmers(id) ON DELETE CASCADE,
  expires_at           timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
ALTER TABLE pace_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pace_share_links_owner_all"
  ON pace_share_links FOR ALL
  USING  (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (e) RPC get_pace_share_payload — lecture publique via token (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_pace_share_payload(token_in uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link          record;
  swimmer_name  text;
  zones         jsonb;
  targets       jsonb;
BEGIN
  SELECT * INTO link FROM pace_share_links
   WHERE token = token_in AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF link.swimmer_account_id IS NOT NULL THEN
    SELECT display_name INTO swimmer_name FROM users WHERE id = link.swimmer_account_id;
  ELSE
    SELECT display_name INTO swimmer_name FROM coach_manual_swimmers WHERE id = link.swimmer_manual_id;
  END IF;

  SELECT row_to_json(z)::jsonb INTO zones
    FROM coach_pace_zones z WHERE coach_id = link.coach_id;

  SELECT jsonb_agg(t) INTO targets
    FROM coach_pace_targets t
   WHERE coach_id = link.coach_id
     AND (
       (swimmer_account_id IS NOT NULL AND swimmer_account_id = link.swimmer_account_id)
       OR
       (swimmer_manual_id IS NOT NULL AND swimmer_manual_id = link.swimmer_manual_id)
     );

  RETURN jsonb_build_object(
    'swimmer_name', swimmer_name,
    'zones',        COALESCE(zones,   '{}'::jsonb),
    'targets',      COALESCE(targets, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_pace_share_payload(uuid) TO anon, authenticated;

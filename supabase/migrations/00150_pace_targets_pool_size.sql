-- §185 — Bassin 50m / 25m sur les cibles d'allures
--
-- 1. Ajoute target_pool_size à coach_pace_targets (défaut 50m).
-- 2. Met à jour upsert_pace_target pour accepter et persister le champ.
-- 3. Met à jour get_pace_share_payload pour inclure swimmer_sex (conversion 25m↔50m).

ALTER TABLE coach_pace_targets
  ADD COLUMN IF NOT EXISTS target_pool_size text NOT NULL DEFAULT '50m'
    CHECK (target_pool_size IN ('25m','50m'));

-- Recréer la RPC pour inclure p_pool_size (DEFAULT '50m' → rétrocompat).
CREATE OR REPLACE FUNCTION upsert_pace_target(
  p_stroke             text,
  p_distance_m         int,
  p_time_ms            int,
  p_pool_size          text    DEFAULT '50m',
  p_swimmer_account_id bigint  DEFAULT NULL,
  p_swimmer_manual_id  uuid    DEFAULT NULL
)
RETURNS coach_pace_targets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_result   coach_pace_targets;
BEGIN
  v_coach_id := auth.uid();
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_swimmer_account_id IS NOT NULL THEN
    INSERT INTO coach_pace_targets (
      coach_id, swimmer_account_id, swimmer_manual_id,
      stroke, target_distance_m, target_time_ms, target_pool_size, updated_at
    ) VALUES (
      v_coach_id, p_swimmer_account_id, NULL,
      p_stroke, p_distance_m, p_time_ms, p_pool_size, now()
    )
    ON CONFLICT (coach_id, swimmer_account_id, stroke, target_distance_m)
    WHERE swimmer_account_id IS NOT NULL
    DO UPDATE SET
      target_time_ms   = EXCLUDED.target_time_ms,
      target_pool_size = EXCLUDED.target_pool_size,
      updated_at       = now()
    RETURNING * INTO v_result;
  ELSE
    IF p_swimmer_manual_id IS NULL THEN
      RAISE EXCEPTION 'swimmer_ref_required' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO coach_pace_targets (
      coach_id, swimmer_account_id, swimmer_manual_id,
      stroke, target_distance_m, target_time_ms, target_pool_size, updated_at
    ) VALUES (
      v_coach_id, NULL, p_swimmer_manual_id,
      p_stroke, p_distance_m, p_time_ms, p_pool_size, now()
    )
    ON CONFLICT (coach_id, swimmer_manual_id, stroke, target_distance_m)
    WHERE swimmer_manual_id IS NOT NULL
    DO UPDATE SET
      target_time_ms   = EXCLUDED.target_time_ms,
      target_pool_size = EXCLUDED.target_pool_size,
      updated_at       = now()
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_pace_target(text, int, int, text, bigint, uuid) TO authenticated;
-- Revoke the old 5-arg signature to avoid ambiguity.
DROP FUNCTION IF EXISTS upsert_pace_target(text, int, int, bigint, uuid);

-- Update get_pace_share_payload to include swimmer_sex for 25m↔50m conversion.
CREATE OR REPLACE FUNCTION get_pace_share_payload(token_in uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link          record;
  swimmer_name  text;
  swimmer_sex   text;
  zones         jsonb;
  targets       jsonb;
BEGIN
  SELECT * INTO link FROM pace_share_links
   WHERE token = token_in AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF link.swimmer_account_id IS NOT NULL THEN
    SELECT u.display_name, up.sex
      INTO swimmer_name, swimmer_sex
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.auth_id
     WHERE u.id = link.swimmer_account_id;
  ELSE
    SELECT display_name, sex
      INTO swimmer_name, swimmer_sex
      FROM coach_manual_swimmers
     WHERE id = link.swimmer_manual_id;
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
    'swimmer_sex',  swimmer_sex,
    'zones',        COALESCE(zones,   '{}'::jsonb),
    'targets',      COALESCE(targets, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_pace_share_payload(uuid) TO anon, authenticated;

-- §186 — RPC get_pace_share_payload adapté au schema v2 de coach_pace_zones.
-- Remplace la version §184/§185 (row unique → multi-row zones_v2).
-- SECURITY DEFINER : callable par anon (lien partagé public).
CREATE OR REPLACE FUNCTION get_pace_share_payload(token_in uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  link         record;
  swimmer_name text;
  swimmer_sex  text;
  zones_v2     jsonb;
  targets      jsonb;
BEGIN
  SELECT * INTO link FROM pace_share_links WHERE token = token_in AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF link.swimmer_account_id IS NOT NULL THEN
    SELECT u.display_name, p.sex INTO swimmer_name, swimmer_sex
      FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = link.swimmer_account_id;
  ELSE
    SELECT display_name, sex INTO swimmer_name, swimmer_sex
      FROM coach_manual_swimmers WHERE id = link.swimmer_manual_id;
  END IF;

  SELECT jsonb_object_agg(event_family, family_zones) INTO zones_v2
    FROM (
      SELECT event_family, jsonb_object_agg(zone, k_value) AS family_zones
        FROM coach_pace_zones WHERE coach_id = link.coach_id
        GROUP BY event_family
    ) t;

  SELECT jsonb_agg(t) INTO targets FROM coach_pace_targets t
    WHERE coach_id = link.coach_id
      AND (
        (swimmer_account_id IS NOT NULL AND swimmer_account_id = link.swimmer_account_id)
        OR (swimmer_manual_id IS NOT NULL AND swimmer_manual_id = link.swimmer_manual_id)
      );

  RETURN jsonb_build_object(
    'swimmer_name', swimmer_name,
    'swimmer_sex',  swimmer_sex,
    'zones_v2',     COALESCE(zones_v2, '{}'::jsonb),
    'targets',      COALESCE(targets,  '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_pace_share_payload(uuid) TO anon, authenticated;

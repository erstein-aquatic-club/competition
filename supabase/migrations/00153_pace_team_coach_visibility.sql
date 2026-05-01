-- §186 — Vue Allures avec sélecteur de coach.
-- Permet à un coach de consulter l'équipe d'un autre coach via la vue Allures
-- (read-only). On expose une RPC SECURITY DEFINER pour accéder aux manuals
-- d'un autre coach via son app_user_id (bigint), parce que la table
-- coach_manual_swimmers stocke coach_id en uuid (auth.users.id) et que la
-- jointure avec auth.users.raw_app_meta_data n'est pas directement accessible
-- depuis le client.
-- coach_swimmer_assignments est déjà ouvert en SELECT à tous les
-- coachs/admins (cf. migration 00072).

CREATE OR REPLACE FUNCTION list_manual_swimmers_for_coach(p_coach_id integer)
RETURNS SETOF coach_manual_swimmers
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT cms.*
  FROM coach_manual_swimmers cms
  JOIN auth.users au ON au.id = cms.coach_id
  WHERE (au.raw_app_meta_data->>'app_user_id')::integer = p_coach_id;
$$;

REVOKE ALL ON FUNCTION list_manual_swimmers_for_coach(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_manual_swimmers_for_coach(integer) TO authenticated;

-- §260 fix: batch mapping public.users.id → auth.users.id via app_user_id metadata
-- Used by CoachPaceCalculatorScreen auto-sync (objectives → pace targets)
CREATE OR REPLACE FUNCTION public.get_auth_uids_for_users(p_user_ids integer[])
RETURNS TABLE(user_id integer, auth_uid uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (au.raw_app_meta_data->>'app_user_id')::integer AS user_id, au.id AS auth_uid
  FROM auth.users au
  WHERE (au.raw_app_meta_data->>'app_user_id')::integer = ANY(p_user_ids);
$$;

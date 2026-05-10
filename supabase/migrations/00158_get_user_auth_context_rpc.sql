-- §247 — RPC get_user_auth_context : retourne role + is_approved en 1 round-trip.
-- Remplace 2 selects séquentiels post-signIn dans auth.ts loadUser() :
--   1. users.select('role').eq('id', userId)
--   2. user_profiles.select('is_approved').eq('user_id', userId)
-- Réduit le waterfall login Slow 3G de ~400-800ms (2 RTT → 1 RTT).
--
-- security definer : nécessaire car les policies RLS sur users.SELECT
-- n'autorisent pas forcément la lecture de role par le user lui-même
-- (lecture admin uniquement dans certains setups). Le check app_user_id()
-- = users.id à l'intérieur de la fonction garantit que l'utilisateur ne
-- peut récupérer QUE son propre contexte (aucune exfiltration possible).

create or replace function public.get_user_auth_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id bigint := app_user_id();
  v_role text;
  v_is_approved boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('role', null, 'is_approved', null);
  end if;

  select u.role, p.is_approved
  into v_role, v_is_approved
  from public.users u
  left join public.user_profiles p on p.user_id = u.id
  where u.id = v_user_id
  limit 1;

  return jsonb_build_object(
    'role', v_role,
    'is_approved', v_is_approved
  );
end;
$$;

grant execute on function public.get_user_auth_context() to authenticated;

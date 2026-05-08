-- §223 — RPC get_coach_kpis : agrège les valeurs de fatigue (sessions + runs)
-- pour une liste d'athlètes sur une fenêtre [from_date, to_date].
-- Remplace 2N requêtes REST (Coach.tsx coachKpisQuery) par 1 round-trip.
-- security invoker : RLS héritée des policies existantes sur dim_sessions
-- et strength_session_runs. Pas de bypass — un coach ne voit que les
-- athlètes qu'il peut déjà lire individuellement.
--
-- Schéma effectif (vérifié via list_tables/information_schema, 2026-05-08) :
--   dim_sessions          : fatigue (int, null), rpe (int, NOT NULL), session_date (date)
--   strength_session_runs : fatigue (int, null), raw_payload (jsonb, null),
--                           started_at (tstz, null), completed_at (tstz, null)
--                           (pas de date/created_at)
-- Le filtre temporel runs utilise donc coalesce(completed_at, started_at).
-- Un run sans aucun timestamp est ignoré (parité avec getRunTimestamp JS qui
-- aurait retourné new Date(0).getTime() = 0, jamais ≥ startDate).

create or replace function public.get_coach_kpis(
  athlete_ids int[],
  from_date date,
  to_date date
)
returns table (
  athlete_id int,
  fatigue_values numeric[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with swim_fatigue as (
    select s.athlete_id, coalesce(s.fatigue, s.rpe)::numeric as v
    from public.dim_sessions s
    where s.athlete_id = any(athlete_ids)
      and s.session_date between from_date and to_date
      and coalesce(s.fatigue, s.rpe) is not null
  ),
  strength_fatigue as (
    select r.athlete_id,
      coalesce(
        r.fatigue::numeric,
        nullif(r.raw_payload->>'fatigue', '')::numeric
      ) as v
    from public.strength_session_runs r
    where r.athlete_id = any(athlete_ids)
      and coalesce(r.completed_at, r.started_at)
          between from_date::timestamptz
              and (to_date + interval '1 day')::timestamptz
      and (r.fatigue is not null or r.raw_payload->>'fatigue' is not null)
  ),
  combined as (
    select athlete_id, v from swim_fatigue
    union all
    select athlete_id, v from strength_fatigue
  )
  select
    a.id as athlete_id,
    coalesce(
      array_agg(c.v) filter (where c.v is not null),
      '{}'::numeric[]
    ) as fatigue_values
  from unnest(athlete_ids) as a(id)
  left join combined c on c.athlete_id = a.id
  group by a.id;
$$;

grant execute on function public.get_coach_kpis(int[], date, date)
  to authenticated;

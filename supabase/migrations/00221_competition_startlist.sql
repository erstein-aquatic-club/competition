-- 00221_competition_startlist.sql
-- liveffn startlist URL + persisted manual name→user match overrides on competitions.
alter table public.competitions
  add column if not exists liveffn_startlist_url text,
  add column if not exists startlist_athlete_map jsonb not null default '{}'::jsonb;

comment on column public.competitions.liveffn_startlist_url is
  'liveffn.com "liste de départ par structure" URL (coach-pasted).';
comment on column public.competitions.startlist_athlete_map is
  'Map normalized startlist key (lastname-firstname-year) -> user id (number) or null = intentionally unmatched. Manual overrides only; auto-match fills the rest at render.';

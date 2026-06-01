-- 00223_competition_pool_length.sql
-- Bassin (25/50 m) of a competition — contextualises Jour J pace tables + times.
alter table public.competitions add column if not exists pool_length integer;
comment on column public.competitions.pool_length is 'Bassin de la compétition en mètres (25 ou 50), nullable.';

-- 00224_competition_results_snapshot.sql
-- Stocke l'URL liveffn "Résultats" (par structure) + un snapshot BRUT des
-- résultats parsés (display-only ; n'alimente PAS swimmer_performances).
alter table public.competitions
  add column if not exists liveffn_results_url text,
  add column if not exists results_snapshot jsonb,
  add column if not exists results_imported_at timestamptz;

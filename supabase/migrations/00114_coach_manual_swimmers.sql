-- Manual swimmers (sans compte) qu'un coach peut réutiliser dans plusieurs chronos

create table if not exists public.coach_manual_swimmers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_coach_manual_swimmers_coach_created
  on public.coach_manual_swimmers(coach_id, created_at desc);

alter table public.coach_manual_swimmers enable row level security;

create policy "coach_manual_swimmers_select_own"
  on public.coach_manual_swimmers for select
  using (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_insert_own"
  on public.coach_manual_swimmers for insert
  with check (coach_id = (select auth.uid()));

create policy "coach_manual_swimmers_delete_own"
  on public.coach_manual_swimmers for delete
  using (coach_id = (select auth.uid()));

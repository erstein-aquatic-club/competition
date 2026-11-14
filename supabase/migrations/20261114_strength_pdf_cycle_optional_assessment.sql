-- Import de cycles coach externes : aucun faux bilan requis.
-- Un cycle issu du moteur garde un bilan obligatoire.
alter table public.strength_mesocycles
  alter column assessment_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.strength_mesocycles'::regclass
       and conname = 'strength_mesocycles_assessment_or_pdf_source'
  ) then
    alter table public.strength_mesocycles
      add constraint strength_mesocycles_assessment_or_pdf_source
      check (
        assessment_id is not null
        or engine_version like 'external_pdf:%'
      );
  end if;
end;
$$;

-- 00167_periodization_templates_variable.sql
-- Design : docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md
-- La table strength_periodization_templates est vide → ALTER sans migration de
-- données. Durée variable : week_count fixe remplacé par min/max_week_count,
-- + colonne kind (season / inter_competition). Aucune policy RLS modifiée.
BEGIN;

ALTER TABLE strength_periodization_templates
  DROP COLUMN week_count,
  ADD COLUMN kind TEXT NOT NULL
    CHECK (kind IN ('season','inter_competition')),
  ADD COLUMN min_week_count INTEGER NOT NULL
    CHECK (min_week_count > 0 AND min_week_count <= 24),
  ADD COLUMN max_week_count INTEGER NOT NULL
    CHECK (max_week_count > 0 AND max_week_count <= 24),
  ADD CONSTRAINT spt_week_count_order CHECK (min_week_count <= max_week_count);

COMMIT;

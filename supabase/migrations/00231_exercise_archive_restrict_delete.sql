-- 00231_exercise_archive_restrict_delete.sql — §394 (audit muscu 2ᵉ passe, R3).
--
-- Avant : supprimer un exercice du catalogue (dim_exercices) supprimait EN CASCADE
-- ses lignes de séances-modèles (strength_session_items), toutes les séries
-- enregistrées (strength_set_logs) et tous les 1RM (one_rm_records) de TOUS les
-- nageurs, sans avertissement.
--
-- Après :
--   1. colonne `archived_at` : un exercice utilisé s'ARCHIVE (retiré du catalogue,
--      des sélecteurs et du moteur de mésocycle ; historique conservé, restaurable) ;
--   2. les 3 FK passent en ON DELETE RESTRICT : la base refuse désormais la
--      suppression d'un exercice référencé (filet de sécurité derrière l'UI, qui
--      vérifie les usages et propose l'archivage). Erreur 23503 côté client →
--      `ExerciseInUseError`.
--
-- Noms de contraintes résolus dynamiquement (pas de dépendance au nom par défaut).
-- Aucune policy RLS modifiée.

ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN dim_exercices.archived_at IS
  '§394 — date d''archivage. NULL = actif. Archivé = hors catalogue/sélecteurs/moteur, historique conservé.';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.dim_exercices'::regclass
      AND c.conrelid IN (
        'public.strength_session_items'::regclass,
        'public.strength_set_logs'::regclass,
        'public.one_rm_records'::regclass
      )
      AND a.attname = 'exercise_id'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.dim_exercices(id) ON DELETE RESTRICT',
      r.tbl, r.conname, r.col
    );
  END LOOP;
END $$;

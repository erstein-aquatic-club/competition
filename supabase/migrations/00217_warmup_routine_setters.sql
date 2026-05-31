-- 00217_warmup_routine_setters.sql — §354 setters atomiques des routines warmup.
-- SECURITY INVOKER (défaut) → les policies RLS écriture coach/admin (00214/00215)
-- s'appliquent : un athlète déclenche une erreur RLS sur l'INSERT.

CREATE OR REPLACE FUNCTION set_warmup_common_routine(p_ids int[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM warmup_common_routine;
  INSERT INTO warmup_common_routine (ordre, exercise_id)
  SELECT (ord - 1)::int, id FROM unnest(coalesce(p_ids, '{}')) WITH ORDINALITY AS t(id, ord);
$$;

CREATE OR REPLACE FUNCTION set_warmup_activation_routine(p_bucket text, p_ids int[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM warmup_activation_routine WHERE bucket = p_bucket;
  INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id)
  SELECT p_bucket, ord::int, id FROM unnest(coalesce(p_ids, '{}')) WITH ORDINALITY AS t(id, ord);
$$;

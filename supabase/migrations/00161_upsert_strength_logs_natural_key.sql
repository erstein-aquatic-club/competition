-- §269 R4 sub-§B — Natural key UNIQUE index on strength_set_logs
-- Enables UPSERT ON CONFLICT (run_id, exercise_id, set_index) to prevent
-- duplicate rows when reconcileStrengthRunLogs + queue replay both fire.

-- Step 1: Deduplicate existing rows, keeping the one with the highest id
-- (most recent insert, preserves the last-written value).
DELETE FROM public.strength_set_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY run_id, exercise_id, set_index
             ORDER BY id DESC
           ) AS rn
    FROM public.strength_set_logs
    WHERE set_index IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add partial unique index (WHERE set_index IS NOT NULL) because
-- set_index is nullable and standard UNIQUE constraints treat NULLs as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS strength_set_logs_natural_key_idx
  ON public.strength_set_logs (run_id, exercise_id, set_index)
  WHERE set_index IS NOT NULL;

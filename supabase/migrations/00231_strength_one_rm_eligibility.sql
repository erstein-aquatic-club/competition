-- Calibration 1RM: explicit opt-in. New movements never trigger a test by default.
-- Deploy BEFORE the frontend using one_rm_eligible (older PWA builds remain compatible).
ALTER TABLE public.dim_exercices
  ADD COLUMN IF NOT EXISTS one_rm_eligible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dim_exercices.one_rm_eligible IS
  'True only for loaded strength exercises where a 1RM reference is meaningful. Does not require an athlete to test.';

-- Seed known loaded strength exercises only. Do not assume every kg-based
-- movement can/should be tested (jumps, throws, carries, core and bands cannot).
UPDATE public.dim_exercices
   SET one_rm_eligible = true
 WHERE id IN (
   1, 2, 3, 4, 6, 7, 11, 12, 13, 16, 18, 19,
   22, 25, 26, 28, 29, 33, 34, 35, 36, 37, 40, 41, 42, 60, 93
 )
 AND exercise_type = 'strength'
 AND NOT is_bodyweight
 AND intensity_metric = 'weight_kg';

-- Correct exercise measurement and bodyweight classification. These changes
-- do not delete any historical logs or existing 1RM records.
UPDATE public.dim_exercices SET intensity_metric = 'height_cm'
  WHERE id IN (56, 110) AND intensity_metric = 'weight_kg';  -- Drop/Depth Jump
UPDATE public.dim_exercices SET intensity_metric = 'distance_cm'
  WHERE id = 21 AND intensity_metric = 'weight_kg';           -- Broad Jump
UPDATE public.dim_exercices SET intensity_metric = 'time_s'
  WHERE id IN (47, 58, 79, 82) AND intensity_metric = 'weight_kg'; -- Plank variations
UPDATE public.dim_exercices SET is_bodyweight = true
  WHERE id IN (10, 27, 31, 52, 76, 91) AND NOT is_bodyweight;

-- Never opt in for non-kg measurements or bodyweight, even if an existing row
-- was edited before this migration.
UPDATE public.dim_exercices SET one_rm_eligible = false
 WHERE is_bodyweight OR intensity_metric <> 'weight_kg' OR exercise_type = 'warmup';

-- Server-side safety net for older PWAs and direct RPC/offline replays.
-- Retain notes/history rows; disallow new positive 1RM values for exercises
-- without a meaningful reference (jumps, planks, mobility, non-kg metrics).
CREATE OR REPLACE FUNCTION public.guard_ineligible_one_rm()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dim_exercices e
    WHERE e.id = NEW.exercise_id
      AND e.one_rm_eligible
      AND NOT e.is_bodyweight
      AND e.intensity_metric = 'weight_kg'
      AND e.exercise_type = 'strength'
  ) THEN
    NEW.one_rm := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS one_rm_eligibility_guard ON public.one_rm_records;
CREATE TRIGGER one_rm_eligibility_guard
BEFORE INSERT OR UPDATE ON public.one_rm_records
FOR EACH ROW EXECUTE FUNCTION public.guard_ineligible_one_rm();

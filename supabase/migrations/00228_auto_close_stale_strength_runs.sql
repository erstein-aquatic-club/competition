-- §384 — Auto-clôture des séances muscu restées « en cours » > 4h
--
-- Problème : une séance de muscu (strength_session_runs) démarrée puis jamais
-- terminée reste status='in_progress' indéfiniment (28 runs concernées au
-- déploiement, certaines ouvertes depuis > 100 jours). Elles polluent
-- l'historique, faussent les stats et laissent des assignments bloqués.
--
-- Règle produit : si une run est « en cours » depuis plus de 4h, on la passe
-- d'office en 'completed' EN CONSERVANT progress_pct (le niveau d'avancement
-- atteint — on ne le force PAS à 100). completed_at est posé à now() si absent.
-- Les assignments liés (le cas échéant) passent aussi en 'completed', par
-- cohérence avec les autres chemins de complétion (save_strength_run_atomic,
-- updateStrengthRun côté JS).
--
-- Mécanisme : fonction SECURITY DEFINER appelée par un cron horaire, plus un
-- backfill immédiat à l'application de la migration pour purger l'existant.

CREATE OR REPLACE FUNCTION public.close_stale_strength_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed integer := 0;
BEGIN
  -- Passe en 'completed' toute run in_progress démarrée il y a plus de 4h.
  -- progress_pct est laissé tel quel (statut d'avancement atteint).
  WITH closed AS (
    UPDATE strength_session_runs
    SET status = 'completed',
        completed_at = COALESCE(completed_at, now())
    WHERE status = 'in_progress'
      AND started_at IS NOT NULL
      AND started_at < now() - INTERVAL '4 hours'
    RETURNING assignment_id
  ),
  closed_assignments AS (
    -- Débloque les assignments restés 'in_progress' à cause de ces runs.
    UPDATE session_assignments sa
    SET status = 'completed'
    WHERE sa.id IN (SELECT assignment_id FROM closed WHERE assignment_id IS NOT NULL)
      AND sa.status = 'in_progress'
    RETURNING sa.id
  )
  SELECT count(*) INTO v_closed FROM closed;

  RETURN v_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.close_stale_strength_runs() FROM PUBLIC;

-- Cron horaire (à HH:10). Seuil de 4h → une granularité horaire suffit.
SELECT cron.unschedule('close-stale-strength-runs')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'close-stale-strength-runs'
);

SELECT cron.schedule(
  'close-stale-strength-runs',
  '10 * * * *',
  $$SELECT public.close_stale_strength_runs();$$
);

-- Backfill immédiat : purge des séances déjà restées ouvertes > 4h.
SELECT public.close_stale_strength_runs();

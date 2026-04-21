-- §163 Phase 2 — Auto-purge des notifications crons via expires_at
-- Les deux crons à gros volume ("Comment te sens-tu ce matin ?" quotidien
-- et "Séance terminée ?" toutes les 15 min) créaient des notifs sans
-- expires_at → elles s'empilaient indéfiniment dans la vue nageur.
-- Désormais chaque notif cron porte un expires_at = début du jour suivant
-- (UTC), ce qui :
--   1. Les masque immédiatement dans notifications_list (filtre serveur).
--   2. Les rend purgeables par cleanup_expired_notifications (30j+ après).

-- ============================================================================
-- 1. WELLNESS MATIN — expires fin de journée (UTC+24h depuis minuit courant)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.send_wellness_morning_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete_ids integer[];
  v_notif_id   integer;
  v_uid        integer;
BEGIN
  SELECT array_agg(DISTINCT u.id)
  INTO v_athlete_ids
  FROM users u
  JOIN push_subscriptions ps ON ps.user_id = u.id
  WHERE u.role = 'athlete'
    AND NOT EXISTS (
      SELECT 1 FROM wellness_checks wc
      WHERE wc.user_id = u.id
        AND wc.date = CURRENT_DATE
    );

  IF v_athlete_ids IS NULL OR array_length(v_athlete_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (title, body, type, metadata, expires_at)
  VALUES (
    'Comment te sens-tu ce matin ?',
    'Remplis ton bien-être en 30 secondes.',
    'wellness',
    '{"url": "/?wellness=open"}'::jsonb,
    (CURRENT_DATE + INTERVAL '1 day')::timestamptz
  )
  RETURNING id INTO v_notif_id;

  FOREACH v_uid IN ARRAY v_athlete_ids
  LOOP
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notif_id, v_uid);
  END LOOP;
END;
$$;

-- ============================================================================
-- 2. SÉANCE TERMINÉE ? — expires à la fin de la journée
-- ============================================================================
SELECT cron.unschedule('slot-session-reminder');

SELECT cron.schedule(
  'slot-session-reminder',
  '*/15 * * * *',
  $cron$
  DO $body$
  DECLARE
    rec RECORD;
    v_notif_id INTEGER;
  BEGIN
    FOR rec IN
      SELECT
        sa.id AS assignment_id,
        sa.target_group_id,
        sa.target_user_id,
        sc.name AS session_name,
        ts.end_time
      FROM session_assignments sa
      JOIN training_slots ts ON ts.id = sa.training_slot_id
      LEFT JOIN swim_sessions_catalog sc ON sc.id = sa.swim_catalog_id
      WHERE sa.training_slot_id IS NOT NULL
        AND sa.scheduled_date = CURRENT_DATE
        AND sa.notified_at IS NULL
        AND (sa.visible_from IS NULL OR sa.visible_from <= CURRENT_DATE)
        AND (ts.end_time - INTERVAL '30 minutes') <= LOCALTIME
        AND ts.end_time >= (LOCALTIME - INTERVAL '2 hours')
    LOOP
      INSERT INTO notifications (title, body, type, expires_at)
      VALUES (
        'Séance terminée ?',
        COALESCE('N''oublie pas d''enregistrer ton ressenti pour : ' || rec.session_name, 'Enregistre ton ressenti !'),
        'assignment',
        (CURRENT_DATE + INTERVAL '1 day')::timestamptz
      )
      RETURNING id INTO v_notif_id;

      IF rec.target_user_id IS NOT NULL THEN
        INSERT INTO notification_targets (notification_id, target_user_id)
        VALUES (v_notif_id, rec.target_user_id);
      ELSIF rec.target_group_id IS NOT NULL THEN
        INSERT INTO notification_targets (notification_id, target_group_id)
        VALUES (v_notif_id, rec.target_group_id);
      END IF;

      UPDATE session_assignments
      SET notified_at = NOW()
      WHERE id = rec.assignment_id;
    END LOOP;
  END $body$;
  $cron$
);

-- ============================================================================
-- 3. BACKFILL — notifs wellness/séance existantes sans expires_at
--    Évite que l'historique accumulé reste visible indéfiniment côté nageur
--    après le déploiement. Expire = created_at + 24h.
-- ============================================================================
UPDATE notifications
SET expires_at = created_at + INTERVAL '1 day'
WHERE expires_at IS NULL
  AND (
    type = 'wellness'
    OR (type = 'assignment' AND title = 'Séance terminée ?')
  );

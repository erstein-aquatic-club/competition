-- Session 1 — Fix cron job slot-session-reminder
-- Bug : le command utilisait `WHERE id = rec.id` alors que le SELECT aliasait
-- sa.id en assignment_id → ERROR "record rec has no field id" à chaque tick.
-- Conséquence : depuis le déploiement, aucun rappel de fin de séance n'a été envoyé.
-- Ajout d'un garde-fou ts.end_time >= LOCALTIME - INTERVAL '2 hours' pour éviter
-- un backlog de rappels rétroactifs au premier tick réussi.

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
      INSERT INTO notifications (title, body, type)
      VALUES (
        'Séance terminée ?',
        COALESCE('N''oublie pas d''enregistrer ton ressenti pour : ' || rec.session_name, 'Enregistre ton ressenti !'),
        'assignment'
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

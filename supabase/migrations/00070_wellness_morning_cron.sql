-- Morning wellness push notification cron job
-- Sends a push to athletes who haven't filled their wellness_checks for today.
-- Runs daily at 04:00 UTC (06:00 CEST).

-- Extend notifications type CHECK to allow 'wellness'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('message', 'assignment', 'birthday', 'wellness'));

CREATE OR REPLACE FUNCTION public.send_wellness_morning_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_athlete_ids integer[];
  v_notif_id   integer;
  v_uid        integer;
BEGIN
  -- Find athletes with active push subscriptions who haven't filled wellness today
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

  -- If nobody to notify, return early
  IF v_athlete_ids IS NULL OR array_length(v_athlete_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Create a single notification row
  INSERT INTO notifications (title, body, type, metadata)
  VALUES (
    'Comment te sens-tu ce matin ?',
    'Remplis ton bien-être en 30 secondes',
    'wellness',
    '{"url": "#/?wellness=open"}'::jsonb
  )
  RETURNING id INTO v_notif_id;

  -- Create one notification_target per athlete
  -- (triggers the existing push pipeline via trg_push_notification_on_target_insert)
  FOREACH v_uid IN ARRAY v_athlete_ids
  LOOP
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notif_id, v_uid);
  END LOOP;
END;
$$;

-- Schedule cron job: daily at 04:00 UTC (06:00 CEST)
SELECT cron.schedule(
  'wellness-morning-push',
  '0 4 * * *',
  $$SELECT public.send_wellness_morning_push();$$
);

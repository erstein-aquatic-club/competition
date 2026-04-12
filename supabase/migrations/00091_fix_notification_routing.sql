-- Fix notification type constraint to include 'interview' (added in 00090)
-- and update wellness cron to store clean metadata URL without # prefix.

-- 1. Update type constraint to allow 'interview'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('message', 'assignment', 'birthday', 'wellness', 'interview'));

-- 2. Update wellness cron function: store clean metadata URL (no # prefix)
--    The push-send edge function resolves URLs by type anyway; the # prefix
--    in metadata was causing 404s when clicked from in-app notification list.
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

  INSERT INTO notifications (title, body, type, metadata)
  VALUES (
    'Comment te sens-tu ce matin ?',
    'Remplis ton bien-être en 30 secondes',
    'wellness',
    '{"url": "/?wellness=open"}'::jsonb
  )
  RETURNING id INTO v_notif_id;

  FOREACH v_uid IN ARRAY v_athlete_ids
  LOOP
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notif_id, v_uid);
  END LOOP;
END;
$$;

-- 3. Fix existing wellness notifications with stale # prefix in metadata
UPDATE notifications
SET metadata = jsonb_set(metadata, '{url}', '"/?wellness=open"')
WHERE type = 'wellness'
  AND metadata->>'url' = '#/?wellness=open';

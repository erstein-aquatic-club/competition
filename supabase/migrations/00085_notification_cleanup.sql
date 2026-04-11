-- Migration 00085: Notification + push subscription cleanup
-- Weekly cron to purge expired data

CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_targets_deleted int;
  v_notif_deleted int;
  v_push_deleted int;
BEGIN
  -- Delete targets for expired notifications (> 30 days past expiry)
  DELETE FROM notification_targets
  WHERE notification_id IN (
    SELECT id FROM notifications
    WHERE expires_at IS NOT NULL AND expires_at < now() - interval '30 days'
  );
  GET DIAGNOSTICS v_targets_deleted = ROW_COUNT;

  -- Delete orphaned expired notifications
  DELETE FROM notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM notification_targets nt WHERE nt.notification_id = notifications.id
    );
  GET DIAGNOSTICS v_notif_deleted = ROW_COUNT;

  -- Delete stale push subscriptions (no update in 90 days)
  DELETE FROM push_subscriptions
  WHERE COALESCE(updated_at, created_at) < now() - interval '90 days';
  GET DIAGNOSTICS v_push_deleted = ROW_COUNT;

  RAISE LOG 'cleanup_expired_notifications: targets=%, notifications=%, push_subscriptions=% deleted',
    v_targets_deleted, v_notif_deleted, v_push_deleted;
END;
$$;

-- Schedule weekly cleanup: Sunday 3am UTC
-- Requires pg_cron extension to be enabled
SELECT cron.schedule(
  'cleanup-notifications',
  '0 3 * * 0',
  $$ SELECT public.cleanup_expired_notifications(); $$
);

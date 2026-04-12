-- 00103_push_webhook_secret.sql
-- Sprint 1 security fix — authenticate the DB → push-send webhook call.
--
-- The push-send Edge Function now rejects unauthenticated callers. The DB
-- trigger defined in 00044_push_webhook_trigger.sql must therefore pass a
-- shared secret via the `x-webhook-secret` header so the Edge Function can
-- distinguish it from a front-end call (which uses a JWT).
--
-- REQUIRED MANUAL STEPS (run ONCE via the Supabase SQL editor with a
-- superuser connection BEFORE this migration takes effect in production):
--
--   1. Generate a shared secret (e.g. `openssl rand -hex 32`).
--   2. Expose it to the Edge Function:
--        Dashboard → Project Settings → Edge Functions → Secrets
--        → add PUSH_WEBHOOK_SECRET=<secret>
--   3. Expose the same value to the database session used by pg_net:
--        ALTER DATABASE postgres SET app.push_webhook_secret = '<secret>';
--      Note: `ALTER DATABASE` only takes effect on new connections. Pooled
--      connections (pgbouncer transaction mode) may still return the old
--      value until reconnected.
--
-- If `app.push_webhook_secret` is not set, `current_setting(..., true)`
-- returns NULL and the Edge Function will reject the call with 401. This is
-- fail-closed by design.

CREATE OR REPLACE FUNCTION notify_push_on_target_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_url text := 'https://fscnobivsgornxdwqwlk.supabase.co/functions/v1/push-send';
  api_key text;
  webhook_secret text;
BEGIN
  -- Read API key from vault (stored as 'push_edge_function_key')
  SELECT decrypted_secret INTO api_key
  FROM vault.decrypted_secrets
  WHERE name = 'push_edge_function_key'
  LIMIT 1;

  IF api_key IS NULL THEN
    RAISE WARNING '[push] No push_edge_function_key found in vault, skipping push notification';
    RETURN NEW;
  END IF;

  -- Shared secret used by push-send to authenticate this webhook path.
  -- Configured via `ALTER DATABASE postgres SET app.push_webhook_secret = '...'`.
  webhook_secret := current_setting('app.push_webhook_secret', true);

  IF webhook_secret IS NULL OR webhook_secret = '' THEN
    RAISE WARNING '[push] app.push_webhook_secret is not set; push-send will reject this call';
  END IF;

  -- Fire-and-forget async HTTP POST via pg_net
  PERFORM net.http_post(
    url := edge_url,
    body := jsonb_build_object(
      'type', 'INSERT',
      'record', jsonb_build_object(
        'id', NEW.id,
        'notification_id', NEW.notification_id,
        'target_user_id', NEW.target_user_id,
        'target_group_id', NEW.target_group_id
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', api_key,
      'Authorization', 'Bearer ' || api_key,
      'x-webhook-secret', COALESCE(webhook_secret, '')
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger is unchanged; it already references notify_push_on_target_insert().
-- Re-creating it idempotently in case the function signature changed.
DROP TRIGGER IF EXISTS trg_push_notification_on_target_insert ON notification_targets;
CREATE TRIGGER trg_push_notification_on_target_insert
  AFTER INSERT ON notification_targets
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_target_insert();

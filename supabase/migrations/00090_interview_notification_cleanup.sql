-- Fix: interview notifications become orphaned when interviews are deleted.
-- 1. Update triggers to store interview_id in notification metadata
-- 2. Add DELETE trigger on interviews to clean up related notifications

-- ============================================================================
-- 1. Update interview creation trigger — store interview_id in metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_notify_interview_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_id INTEGER;
BEGIN
  INSERT INTO notifications (title, body, type, metadata)
  VALUES (
    'Entretien à compléter',
    'Un entretien individuel attend votre contribution.',
    'interview',
    jsonb_build_object('interview_id', NEW.id, 'url', '/suivi?tab=entretiens')
  )
  RETURNING id INTO notif_id;

  INSERT INTO notification_targets (notification_id, target_user_id)
  VALUES (notif_id, NEW.athlete_id);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Update interview transition trigger — store interview_id in metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_notify_interview_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_id INTEGER;
BEGIN
  IF OLD.status = 'draft_coach' AND NEW.status = 'sent' THEN
    INSERT INTO notifications (title, body, type, metadata)
    VALUES (
      'Entretien à relire',
      'Votre entretien est prêt pour relecture et signature.',
      'interview',
      jsonb_build_object('interview_id', NEW.id, 'url', '/suivi?tab=entretiens')
    )
    RETURNING id INTO notif_id;

    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, NEW.athlete_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Cleanup trigger: delete notifications when an interview is deleted
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_cleanup_interview_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete notification targets first (FK), then notifications
  DELETE FROM notification_targets
  WHERE notification_id IN (
    SELECT id FROM notifications
    WHERE metadata->>'interview_id' = OLD.id::text
  );

  DELETE FROM notifications
  WHERE metadata->>'interview_id' = OLD.id::text;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cleanup_interview_notifications
  BEFORE DELETE ON interviews
  FOR EACH ROW
  EXECUTE FUNCTION auto_cleanup_interview_notifications();

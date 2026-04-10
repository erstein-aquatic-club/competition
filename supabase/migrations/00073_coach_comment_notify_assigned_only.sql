-- 00073_coach_comment_notify_assigned_only.sql
-- Scope coach comment notifications to the assigned coach only.
-- Falls back to all coaches if the swimmer has no assignment (backward compatible).

CREATE OR REPLACE FUNCTION auto_notify_swimmer_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  swimmer_name TEXT;
  comment_preview TEXT;
  notif_id INTEGER;
  coach RECORD;
  assigned_coach_id INTEGER;
BEGIN
  -- Only fire when comments is set to a non-empty value
  IF NEW.comments IS NULL OR trim(NEW.comments) = '' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if comments actually changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.comments IS NOT DISTINCT FROM NEW.comments THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Get swimmer display name
  swimmer_name := COALESCE(NEW.athlete_name, 'Nageur');

  -- Truncate comment to 100 chars for push body
  comment_preview := left(trim(NEW.comments), 100);
  IF length(trim(NEW.comments)) > 100 THEN
    comment_preview := comment_preview || '...';
  END IF;

  -- Create notification
  INSERT INTO notifications (title, body, type, metadata)
  VALUES (
    'Commentaire de ' || swimmer_name,
    comment_preview,
    'message',
    jsonb_build_object('url', '#/coach?section=comments', 'session_id', NEW.id)
  )
  RETURNING id INTO notif_id;

  -- Check if swimmer has an assigned coach
  SELECT csa.coach_id INTO assigned_coach_id
  FROM coach_swimmer_assignments csa
  WHERE csa.swimmer_id = NEW.athlete_id;

  IF assigned_coach_id IS NOT NULL THEN
    -- Target only the assigned coach
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, assigned_coach_id);
  ELSE
    -- Fallback: no assignment yet → notify all coaches
    FOR coach IN
      SELECT id FROM users WHERE role = 'coach'
    LOOP
      INSERT INTO notification_targets (notification_id, target_user_id)
      VALUES (notif_id, coach.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

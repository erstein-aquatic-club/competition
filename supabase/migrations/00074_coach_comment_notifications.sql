-- 00072_coach_comment_notifications.sql
-- Auto-notify coaches when a swimmer writes a text comment in their feedback.
-- Reuses the existing notifications → notification_targets → push-send pipeline.

-- ============================================================================
-- 1. COACH COMMENT READS — track which session comments a coach has read
-- ============================================================================

CREATE TABLE coach_comment_reads (
  coach_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id integer NOT NULL REFERENCES dim_sessions(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, session_id)
);

CREATE INDEX idx_coach_comment_reads_coach ON coach_comment_reads(coach_user_id);

-- RLS
ALTER TABLE coach_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can read own reads"
  ON coach_comment_reads FOR SELECT
  USING (coach_user_id = app_user_id());

CREATE POLICY "Coaches can insert own reads"
  ON coach_comment_reads FOR INSERT
  WITH CHECK (coach_user_id = app_user_id());

-- ============================================================================
-- 2. AUTO-NOTIFY COACHES ON SWIMMER COMMENT
-- ============================================================================

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

  -- Target all coaches
  FOR coach IN
    SELECT id FROM users WHERE role = 'coach'
  LOOP
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, coach.id);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_notify_swimmer_comment
  AFTER INSERT OR UPDATE ON dim_sessions
  FOR EACH ROW
  EXECUTE FUNCTION auto_notify_swimmer_comment();

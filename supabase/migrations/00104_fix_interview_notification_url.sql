-- Fix interview notification URL: /suivi?tab=entretiens was the old hub-with-query
-- format, but after the drill-down restructure (chantier #67) the route is
-- /suivi/entretiens. Push notifications were landing on the hub (and from there
-- wouter fell through to /suivi/saison which is the default), never on the
-- actual interviews view.

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
    jsonb_build_object('interview_id', NEW.id, 'url', '/suivi/entretiens')
  )
  RETURNING id INTO notif_id;

  INSERT INTO notification_targets (notification_id, target_user_id)
  VALUES (notif_id, NEW.athlete_id);

  RETURN NEW;
END;
$$;

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
      jsonb_build_object('interview_id', NEW.id, 'url', '/suivi/entretiens')
    )
    RETURNING id INTO notif_id;

    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, NEW.athlete_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill existing unread notifications
UPDATE notifications
   SET metadata = jsonb_set(metadata, '{url}', '"/suivi/entretiens"')
 WHERE type = 'interview'
   AND metadata->>'url' = '/suivi?tab=entretiens';

-- Disable push notifications for slot overrides of type "modified".
-- Keep notifications for "cancelled" overrides.

CREATE OR REPLACE FUNCTION public.auto_notify_slot_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot_record RECORD;
  day_label TEXT;
  date_label TEXT;
  notif_title TEXT;
  notif_body TEXT;
  notif_id INTEGER;
  assignment RECORD;
  days_fr TEXT[] := ARRAY['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
BEGIN
  -- Keep push notifications only for cancellations.
  IF NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT day_of_week, start_time, end_time, location
  INTO slot_record
  FROM training_slots
  WHERE id = NEW.slot_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  day_label := days_fr[slot_record.day_of_week];
  date_label := to_char(NEW.override_date, 'DD/MM');

  notif_title := 'Créneau annulé';
  notif_body := day_label || ' ' || date_label || ' — '
    || to_char(slot_record.start_time, 'HH24:MI') || '-' || to_char(slot_record.end_time, 'HH24:MI');

  IF NEW.reason IS NOT NULL AND NEW.reason <> '' THEN
    notif_body := notif_body || ' (' || NEW.reason || ')';
  END IF;

  INSERT INTO notifications (title, body, type)
  VALUES (notif_title, notif_body, 'message')
  RETURNING id INTO notif_id;

  FOR assignment IN
    SELECT group_id FROM training_slot_assignments WHERE slot_id = NEW.slot_id
  LOOP
    INSERT INTO notification_targets (notification_id, target_group_id)
    VALUES (notif_id, assignment.group_id);
  END LOOP;

  RETURN NEW;
END;
$$;


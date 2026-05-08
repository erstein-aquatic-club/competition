-- §194 — Expiration automatique des notifs créées par triggers
--
-- Avant : les triggers `auto_notify_*` (00045, 00073/00074, 00091, 00092,
-- 00104, 00142) créaient des notifs sans `expires_at`. Le filtre serveur
-- `notifications_list` (api/notifications.ts) ignore les notifs expirées,
-- et `cleanup_expired_notifications` (00085) ne purge que celles avec
-- `expires_at IS NOT NULL`. Conséquence : ces notifs s'accumulaient
-- indéfiniment dans le centre nageur/coach (saturation ressentie côté UX).
--
-- §163 (00143) avait déjà posé `expires_at` sur les CRONS (wellness matin,
-- "Séance terminée ?"). Cette migration aligne tous les triggers, plus un
-- backfill agressif (14 j) pour vider le backlog historique sans suppression.

-- ============================================================================
-- 1. SESSION ASSIGNMENT — expire 1 j après la séance (utile jusqu'à passage)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_notify_session_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_title TEXT;
  notif_body TEXT;
  notif_id INTEGER;
  type_label TEXT;
  date_label TEXT;
  v_expires_at timestamptz;
BEGIN
  IF NEW.status <> 'assigned' THEN RETURN NEW; END IF;

  type_label := CASE WHEN NEW.assignment_type = 'swim' THEN 'natation' ELSE 'musculation' END;
  date_label := COALESCE(to_char(NEW.scheduled_date, 'DD/MM'), '');

  notif_title := 'Nouvelle séance ' || type_label;
  notif_body := 'Séance de ' || type_label || ' assignée';
  IF date_label <> '' THEN
    notif_body := notif_body || ' pour le ' || date_label;
  END IF;

  v_expires_at := COALESCE(
    (NEW.scheduled_date + INTERVAL '1 day')::timestamptz,
    now() + INTERVAL '14 days'
  );

  INSERT INTO notifications (title, body, type, expires_at)
  VALUES (notif_title, notif_body, 'assignment', v_expires_at)
  RETURNING id INTO notif_id;

  INSERT INTO notification_targets (notification_id, target_user_id, target_group_id)
  VALUES (notif_id, NEW.target_user_id, NEW.target_group_id);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. COMPETITION ASSIGNMENT — expire 2 j après la compétition
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_notify_competition_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp_name TEXT;
  comp_date_label TEXT;
  comp_start_date DATE;
  notif_id INTEGER;
BEGIN
  SELECT name, to_char(start_date, 'DD/MM'), start_date
  INTO comp_name, comp_date_label, comp_start_date
  FROM competitions
  WHERE id = NEW.competition_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO notifications (title, body, type, expires_at)
  VALUES (
    'Nouvelle compétition',
    'Tu es inscrit(e) à ' || comp_name || ' le ' || comp_date_label || '.',
    'assignment',
    COALESCE((comp_start_date + INTERVAL '2 days')::timestamptz, now() + INTERVAL '60 days')
  )
  RETURNING id INTO notif_id;

  INSERT INTO notification_targets (notification_id, target_user_id)
  VALUES (notif_id, NEW.athlete_id);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. SLOT OVERRIDE (cancellation only, cf. 00092) — expire 1 j après l'override
-- ============================================================================
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

  INSERT INTO notifications (title, body, type, expires_at)
  VALUES (
    notif_title,
    notif_body,
    'message',
    COALESCE((NEW.override_date + INTERVAL '1 day')::timestamptz, now() + INTERVAL '14 days')
  )
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

-- ============================================================================
-- 4a. INTERVIEW CREATED — expire 30 j (l'athlète a un mois pour répondre)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_notify_interview_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_id INTEGER;
BEGIN
  INSERT INTO notifications (title, body, type, metadata, expires_at)
  VALUES (
    'Entretien à compléter',
    'Un entretien individuel attend ta contribution.',
    'interview',
    jsonb_build_object('interview_id', NEW.id, 'url', '/suivi/entretiens'),
    now() + INTERVAL '30 days'
  )
  RETURNING id INTO notif_id;

  INSERT INTO notification_targets (notification_id, target_user_id)
  VALUES (notif_id, NEW.athlete_id);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4b. INTERVIEW TRANSITION (draft_coach → sent) — expire 30 j
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_notify_interview_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_id INTEGER;
BEGIN
  IF OLD.status = 'draft_coach' AND NEW.status = 'sent' THEN
    INSERT INTO notifications (title, body, type, metadata, expires_at)
    VALUES (
      'Entretien à relire',
      'Ton entretien est prêt pour relecture et signature.',
      'interview',
      jsonb_build_object('interview_id', NEW.id, 'url', '/suivi/entretiens'),
      now() + INTERVAL '30 days'
    )
    RETURNING id INTO notif_id;

    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, NEW.athlete_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. SWIMMER COMMENT (côté coach) — expire 7 j (info périssable)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_notify_swimmer_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  swimmer_name TEXT;
  comment_preview TEXT;
  notif_id INTEGER;
  coach RECORD;
  assigned_coach_id INTEGER;
BEGIN
  IF NEW.comments IS NULL OR trim(NEW.comments) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.comments IS NOT DISTINCT FROM NEW.comments THEN
      RETURN NEW;
    END IF;
  END IF;

  swimmer_name := COALESCE(NEW.athlete_name, 'Nageur');

  comment_preview := left(trim(NEW.comments), 100);
  IF length(trim(NEW.comments)) > 100 THEN
    comment_preview := comment_preview || '...';
  END IF;

  INSERT INTO notifications (title, body, type, metadata, expires_at)
  VALUES (
    'Commentaire de ' || swimmer_name,
    comment_preview,
    'message',
    jsonb_build_object('url', '#/coach?section=comments', 'session_id', NEW.id),
    now() + INTERVAL '7 days'
  )
  RETURNING id INTO notif_id;

  SELECT csa.coach_id INTO assigned_coach_id
  FROM coach_swimmer_assignments csa
  WHERE csa.swimmer_id = NEW.athlete_id;

  IF assigned_coach_id IS NOT NULL THEN
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, assigned_coach_id);
  ELSE
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

-- ============================================================================
-- 6. BACKFILL — toutes les notifs sans expires_at obtiennent created_at + 14 j
--    Effet : les notifs > 14 j disparaissent immédiatement de la vue,
--    les + récentes restent visibles jusqu'à leur 14e jour. Aucune row
--    supprimée — uniquement masquée par le filtre serveur. La purge
--    physique (cleanup_expired_notifications, 00085) interviendra ensuite
--    naturellement (30 j après expires_at).
-- ============================================================================
UPDATE notifications
SET expires_at = created_at + INTERVAL '14 days'
WHERE expires_at IS NULL;

-- §163 Phase 1 — Cohérence textuelle des notifications
-- Aligne le ton (tutoiement) et harmonise les titres/ponctuation.
-- Concerne les triggers compétition (§00045) et entretien (§00104).

-- ============================================================================
-- 1. COMPÉTITION — titre "Compétition" → "Nouvelle compétition" + tutoiement
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_notify_competition_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp_name TEXT;
  comp_date TEXT;
  notif_id INTEGER;
BEGIN
  SELECT name, to_char(start_date, 'DD/MM')
  INTO comp_name, comp_date
  FROM competitions
  WHERE id = NEW.competition_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO notifications (title, body, type)
  VALUES (
    'Nouvelle compétition',
    'Tu es inscrit(e) à ' || comp_name || ' le ' || comp_date || '.',
    'assignment'
  )
  RETURNING id INTO notif_id;

  INSERT INTO notification_targets (notification_id, target_user_id)
  VALUES (notif_id, NEW.athlete_id);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. ENTRETIEN — tutoiement + URL /suivi/entretiens (conservée depuis §00104)
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
    'Un entretien individuel attend ta contribution.',
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
      'Ton entretien est prêt pour relecture et signature.',
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

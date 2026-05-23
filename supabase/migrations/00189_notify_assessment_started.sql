-- 00189_notify_assessment_started.sql — §299
-- Ferme le handoff coach→nageur jusqu'ici silencieux : quand un coach démarre un
-- bilan muscu pour un nageur (createAssessment avec coach_id <> athlete_id), le
-- nageur reçoit une notification l'invitant à remplir son questionnaire (il
-- découvre alors la carte QuestionnairePrompt). Aucune notification si le nageur
-- démarre lui-même son bilan (coach_id NULL, autonomie §299) — il n'a pas à se
-- notifier lui-même.
-- Pattern de notification calqué sur apply_strength_mesocycle (00172).

CREATE OR REPLACE FUNCTION public.notify_assessment_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif_id notifications.id%TYPE;
BEGIN
  IF NEW.coach_id IS NOT NULL AND NEW.coach_id <> NEW.athlete_id THEN
    INSERT INTO notifications (title, body, type, created_by, metadata)
    VALUES (
      'Bilan muscu demandé',
      'Ton coach a démarré un bilan muscu. Remplis ton questionnaire pour le préparer.',
      'message',
      NEW.coach_id,
      jsonb_build_object(
        'kind',          'strength_assessment_started',
        'assessment_id', NEW.id,
        'athlete_id',    NEW.athlete_id,
        'target_role',   'athlete'
      )
    )
    RETURNING id INTO v_notif_id;

    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notif_id, NEW.athlete_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_assessment_started ON public.strength_assessments;
CREATE TRIGGER trg_notify_assessment_started
  AFTER INSERT ON public.strength_assessments
  FOR EACH ROW EXECUTE FUNCTION public.notify_assessment_started();

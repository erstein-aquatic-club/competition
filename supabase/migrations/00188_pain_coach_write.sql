-- 00188_pain_coach_write.sql — §299
-- Le coach/admin peut écrire (INSERT/UPDATE/DELETE) les pain_reports d'un nageur.
-- Requis par le questionnaire muscu « accompagné » : quand le coach remplit le
-- questionnaire AVEC le nageur (route /coach/questionnaire/:athleteId), le submit
-- miroite les douleurs déclarées via upsertPainReports(athleteId, today, ...),
-- ce qui touche les lignes d'un autre user. Jusqu'ici pain_reports n'avait que
-- pain_own (self, ALL) et pain_coach_read (SELECT) → ces writes échouaient.
-- Cohérent avec strength_assessments_coach (accès club-wide coach/admin).
-- pain_own et pain_coach_read restent inchangées.
CREATE POLICY pain_coach_write ON public.pain_reports
  FOR ALL
  USING (app_user_role() = ANY (ARRAY['coach', 'admin']))
  WITH CHECK (app_user_role() = ANY (ARRAY['coach', 'admin']));

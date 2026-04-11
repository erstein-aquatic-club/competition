-- Migration 00084: Text length CHECK constraints
-- Prevents unbounded text input from bloating the DB
-- Using NOT VALID to skip validation of existing rows (faster apply, no lock)

ALTER TABLE dim_sessions ADD CONSTRAINT chk_sessions_comments_len
  CHECK (length(comments) <= 2000) NOT VALID;
ALTER TABLE dim_sessions ADD CONSTRAINT chk_sessions_coach_notes_len
  CHECK (length(coach_notes) <= 2000) NOT VALID;

ALTER TABLE user_profiles ADD CONSTRAINT chk_profiles_bio_len
  CHECK (length(bio) <= 500) NOT VALID;
ALTER TABLE user_profiles ADD CONSTRAINT chk_profiles_display_name_len
  CHECK (length(display_name) <= 100) NOT VALID;
ALTER TABLE user_profiles ADD CONSTRAINT chk_profiles_phone_len
  CHECK (length(phone) <= 20) NOT VALID;

ALTER TABLE notifications ADD CONSTRAINT chk_notif_title_len
  CHECK (length(title) <= 200) NOT VALID;
ALTER TABLE notifications ADD CONSTRAINT chk_notif_body_len
  CHECK (length(body) <= 2000) NOT VALID;

ALTER TABLE interviews ADD CONSTRAINT chk_interviews_text_len
  CHECK (
    length(athlete_goals) <= 5000
    AND length(athlete_successes) <= 5000
    AND length(athlete_difficulties) <= 5000
    AND length(athlete_commitments) <= 5000
    AND length(athlete_commitment_review) <= 5000
    AND length(coach_comment_goals) <= 5000
    AND length(coach_comment_successes) <= 5000
    AND length(coach_comment_difficulties) <= 5000
    AND length(coach_actions) <= 5000
    AND length(coach_objectives) <= 5000
    AND length(coach_review) <= 5000
  ) NOT VALID;

ALTER TABLE objectives ADD CONSTRAINT chk_objectives_text_len
  CHECK (length(text) <= 1000) NOT VALID;

ALTER TABLE strength_sessions ADD CONSTRAINT chk_ss_name_len
  CHECK (length(name) <= 200) NOT VALID;
ALTER TABLE strength_sessions ADD CONSTRAINT chk_ss_desc_len
  CHECK (length(description) <= 2000) NOT VALID;

ALTER TABLE competitions ADD CONSTRAINT chk_comp_name_len
  CHECK (length(name) <= 200) NOT VALID;
ALTER TABLE competitions ADD CONSTRAINT chk_comp_desc_len
  CHECK (length(description) <= 2000) NOT VALID;

ALTER TABLE strength_set_logs ADD CONSTRAINT chk_set_notes_len
  CHECK (length(notes) <= 500) NOT VALID;
ALTER TABLE strength_session_runs ADD CONSTRAINT chk_run_comments_len
  CHECK (length(comments) <= 2000) NOT VALID;

ALTER TABLE wellness_checks ADD CONSTRAINT chk_wellness_notes_len
  CHECK (length(notes) <= 1000) NOT VALID;

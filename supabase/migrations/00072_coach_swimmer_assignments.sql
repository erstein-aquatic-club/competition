-- Coach-Swimmer Assignments
CREATE TABLE coach_swimmer_assignments (
  id SERIAL PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  swimmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (swimmer_id)
);

CREATE INDEX idx_csa_coach ON coach_swimmer_assignments(coach_id);
CREATE INDEX idx_csa_swimmer ON coach_swimmer_assignments(swimmer_id);

-- History table
CREATE TABLE coach_swimmer_history (
  id SERIAL PRIMARY KEY,
  coach_id INTEGER NOT NULL,
  swimmer_id INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_by INTEGER
);

CREATE INDEX idx_csh_swimmer ON coach_swimmer_history(swimmer_id);

-- Trigger: on DELETE or UPDATE of coach_id/swimmer_id, log to history
CREATE OR REPLACE FUNCTION log_coach_swimmer_removal()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO coach_swimmer_history (coach_id, swimmer_id, assigned_at, removed_at, removed_by)
  VALUES (
    OLD.coach_id,
    OLD.swimmer_id,
    OLD.assigned_at,
    now(),
    COALESCE(
      (current_setting('app.current_user_id', true))::integer,
      OLD.coach_id
    )
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_coach_swimmer_removal
  BEFORE DELETE ON coach_swimmer_assignments
  FOR EACH ROW EXECUTE FUNCTION log_coach_swimmer_removal();

CREATE TRIGGER trg_coach_swimmer_update
  BEFORE UPDATE OF swimmer_id, coach_id ON coach_swimmer_assignments
  FOR EACH ROW EXECUTE FUNCTION log_coach_swimmer_removal();

-- RLS
ALTER TABLE coach_swimmer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_swimmer_history ENABLE ROW LEVEL SECURITY;

-- Coaches and admins can see all assignments
CREATE POLICY csa_select ON coach_swimmer_assignments
  FOR SELECT USING (
    app_user_role() IN ('coach', 'admin')
  );

-- Coaches: insert only for themselves, admins: for anyone
CREATE POLICY csa_insert ON coach_swimmer_assignments
  FOR INSERT WITH CHECK (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

-- Coaches: delete only their own, admins: any
CREATE POLICY csa_delete ON coach_swimmer_assignments
  FOR DELETE USING (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

-- Admins: update any assignment (reassign)
CREATE POLICY csa_update ON coach_swimmer_assignments
  FOR UPDATE USING (
    app_user_role() = 'admin'
  );

-- History: readable by coaches (their own) and admins (all)
CREATE POLICY csh_select ON coach_swimmer_history
  FOR SELECT USING (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

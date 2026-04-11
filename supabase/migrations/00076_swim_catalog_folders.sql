-- Persistent swim catalog folders (path-based, like swim_sessions_catalog.folder)
CREATE TABLE IF NOT EXISTS swim_catalog_folders (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (path)
);

-- RLS
ALTER TABLE swim_catalog_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read swim folders"
  ON swim_catalog_folders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Coaches and admins can insert swim folders"
  ON swim_catalog_folders FOR INSERT
  TO authenticated
  WITH CHECK (app_user_role() IN ('coach', 'admin'));

CREATE POLICY "Coaches and admins can update swim folders"
  ON swim_catalog_folders FOR UPDATE
  TO authenticated
  USING (app_user_role() IN ('coach', 'admin'))
  WITH CHECK (app_user_role() IN ('coach', 'admin'));

CREATE POLICY "Coaches and admins can delete swim folders"
  ON swim_catalog_folders FOR DELETE
  TO authenticated
  USING (app_user_role() IN ('coach', 'admin'));

CREATE INDEX idx_swim_catalog_folders_path ON swim_catalog_folders (path);

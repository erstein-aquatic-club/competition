CREATE TABLE IF NOT EXISTS swim_filieres (
  id text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  color text NOT NULL,
  description text,
  examples text,
  sort_order smallint NOT NULL DEFAULT 0
);

ALTER TABLE swim_filieres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swim_filieres_select" ON swim_filieres
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "swim_filieres_write" ON swim_filieres
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach', 'admin'));

-- Seed with default filières
INSERT INTO swim_filieres (id, name, short_name, color, sort_order) VALUES
  ('entretien-aerobie',        'Entretien aérobie',           'Entretien',          'sky',     1),
  ('capacite-aerobie',         'Capacité aérobie',            'Cap. aéro.',         'emerald', 2),
  ('puissance-aerobie',        'Puissance aérobie',           'Puiss. aéro.',       'orange',  3),
  ('capacite-anaerobie-lact',  'Cap. anaérobie lactique',     'Cap. ana. lact.',    'red',     4),
  ('puissance-anaerobie-lact', 'Puiss. anaérobie lactique',   'Puiss. ana. lact.',  'violet',  5),
  ('capacite-anaerobie-alact', 'Cap. anaérobie alactique',    'Cap. ana. alact.',   'slate',   6),
  ('puissance-anaerobie-alact','Puiss. anaérobie alactique',  'Puiss. ana. alact.', 'zinc',    7),
  ('technique',                'Technique',                   'Technique',          'cyan',    8)
ON CONFLICT (id) DO NOTHING;

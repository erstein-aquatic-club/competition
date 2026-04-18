-- Extend swim_filieres with full set of editable fields so coach can
-- configure every element visible to swimmers (technicals + gauges).
-- Existing description/examples remain unchanged; new columns are nullable
-- so a NULL value means "use the hardcoded default from swimFilieres.ts".

ALTER TABLE swim_filieres
  ADD COLUMN IF NOT EXISTS heart_rate      text,
  ADD COLUMN IF NOT EXISTS lactate         text,
  ADD COLUMN IF NOT EXISTS effort          text,
  ADD COLUMN IF NOT EXISTS duration        text,
  ADD COLUMN IF NOT EXISTS distance        text,
  ADD COLUMN IF NOT EXISTS reps            text,
  ADD COLUMN IF NOT EXISTS intensity       text,
  ADD COLUMN IF NOT EXISTS recovery        text,
  ADD COLUMN IF NOT EXISTS work_type       text,
  ADD COLUMN IF NOT EXISTS level_intensity smallint,
  ADD COLUMN IF NOT EXISTS level_duration  smallint,
  ADD COLUMN IF NOT EXISTS level_recovery  smallint,
  ADD COLUMN IF NOT EXISTS level_lactate   smallint;

ALTER TABLE swim_filieres
  DROP CONSTRAINT IF EXISTS swim_filieres_level_intensity_check,
  DROP CONSTRAINT IF EXISTS swim_filieres_level_duration_check,
  DROP CONSTRAINT IF EXISTS swim_filieres_level_recovery_check,
  DROP CONSTRAINT IF EXISTS swim_filieres_level_lactate_check;

ALTER TABLE swim_filieres
  ADD CONSTRAINT swim_filieres_level_intensity_check
    CHECK (level_intensity IS NULL OR level_intensity BETWEEN 1 AND 5),
  ADD CONSTRAINT swim_filieres_level_duration_check
    CHECK (level_duration IS NULL OR level_duration BETWEEN 1 AND 5),
  ADD CONSTRAINT swim_filieres_level_recovery_check
    CHECK (level_recovery IS NULL OR level_recovery BETWEEN 1 AND 5),
  ADD CONSTRAINT swim_filieres_level_lactate_check
    CHECK (level_lactate IS NULL OR level_lactate BETWEEN 1 AND 5);

-- Backfill from hardcoded defaults (keeps parity with src/lib/swimFilieres.ts)
UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, '120-150'),
  lactate    = COALESCE(lactate,    '2'),
  effort     = COALESCE(effort,     '8-12'),
  duration   = COALESCE(duration,   '6-25mn'),
  distance   = COALESCE(distance,   '300-1500m'),
  reps       = COALESCE(reps,       '1-4'),
  intensity  = COALESCE(intensity,  '70-85% VMA'),
  recovery   = COALESCE(recovery,   '10-30s passive'),
  work_type  = COALESCE(work_type,  'Continu, échauffement, technique, récupération'),
  level_intensity = COALESCE(level_intensity, 2),
  level_duration  = COALESCE(level_duration,  5),
  level_recovery  = COALESCE(level_recovery,  1),
  level_lactate   = COALESCE(level_lactate,   1)
WHERE id = 'entretien-aerobie';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, '150-175'),
  lactate    = COALESCE(lactate,    '2-4'),
  effort     = COALESCE(effort,     '12-15'),
  duration   = COALESCE(duration,   '20-45mn'),
  distance   = COALESCE(distance,   '50-3000m'),
  reps       = COALESCE(reps,       '30/1'),
  intensity  = COALESCE(intensity,  '80-90% VMA'),
  recovery   = COALESCE(recovery,   '10s passive / sans'),
  work_type  = COALESCE(work_type,  'Distances continues, fartleck, interval training lent'),
  level_intensity = COALESCE(level_intensity, 2),
  level_duration  = COALESCE(level_duration,  5),
  level_recovery  = COALESCE(level_recovery,  1),
  level_lactate   = COALESCE(level_lactate,   2)
WHERE id = 'capacite-aerobie';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, '170-max'),
  lactate    = COALESCE(lactate,    '5-12'),
  effort     = COALESCE(effort,     '14-20'),
  duration   = COALESCE(duration,   '6-15mn'),
  distance   = COALESCE(distance,   '25-500m'),
  reps       = COALESCE(reps,       '20/1'),
  intensity  = COALESCE(intensity,  '90-110% VMA'),
  recovery   = COALESCE(recovery,   '10-30s passive / sans'),
  work_type  = COALESCE(work_type,  'Distances continues, interval training rapide, intermittent'),
  level_intensity = COALESCE(level_intensity, 3),
  level_duration  = COALESCE(level_duration,  4),
  level_recovery  = COALESCE(level_recovery,  2),
  level_lactate   = COALESCE(level_lactate,   3)
WHERE id = 'puissance-aerobie';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, 'max'),
  lactate    = COALESCE(lactate,    '8-max'),
  effort     = COALESCE(effort,     '16-20'),
  duration   = COALESCE(duration,   '2min30-6mn'),
  distance   = COALESCE(distance,   '50-100m'),
  reps       = COALESCE(reps,       '3x3/3'),
  intensity  = COALESCE(intensity,  '85-95% VMA lact.'),
  recovery   = COALESCE(recovery,   '10s+2mn / 3mn'),
  work_type  = COALESCE(work_type,  'Fractionné (passive et/ou active)'),
  level_intensity = COALESCE(level_intensity, 4),
  level_duration  = COALESCE(level_duration,  3),
  level_recovery  = COALESCE(level_recovery,  3),
  level_lactate   = COALESCE(level_lactate,   4)
WHERE id = 'capacite-anaerobie-lact';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, 'max'),
  lactate    = COALESCE(lactate,    '12-max'),
  effort     = COALESCE(effort,     '18-20'),
  duration   = COALESCE(duration,   '30s-3mn'),
  distance   = COALESCE(distance,   '50-200m'),
  reps       = COALESCE(reps,       '4 (10s récup)/1'),
  intensity  = COALESCE(intensity,  '90-100% VMA lact.'),
  recovery   = COALESCE(recovery,   'Complète (5-10mn)'),
  work_type  = COALESCE(work_type,  'Fractionné, simulateurs, épreuves 50-100 (active entre répét.)'),
  level_intensity = COALESCE(level_intensity, 5),
  level_duration  = COALESCE(level_duration,  2),
  level_recovery  = COALESCE(level_recovery,  5),
  level_lactate   = COALESCE(level_lactate,   5)
WHERE id = 'puissance-anaerobie-lact';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, 'N/A'),
  lactate    = COALESCE(lactate,    'N/A'),
  effort     = COALESCE(effort,     'N/A'),
  duration   = COALESCE(duration,   '15s-5mn'),
  distance   = COALESCE(distance,   '12.5-25m'),
  reps       = COALESCE(reps,       '1/4'),
  intensity  = COALESCE(intensity,  '90-100% VMA alact.'),
  recovery   = COALESCE(recovery,   '1mn'),
  work_type  = COALESCE(work_type,  'Séries répétées (passive)'),
  level_intensity = COALESCE(level_intensity, 4),
  level_duration  = COALESCE(level_duration,  1),
  level_recovery  = COALESCE(level_recovery,  2),
  level_lactate   = COALESCE(level_lactate,   1)
WHERE id = 'capacite-anaerobie-alact';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, 'N/A'),
  lactate    = COALESCE(lactate,    'N/A'),
  effort     = COALESCE(effort,     'N/A'),
  duration   = COALESCE(duration,   '7s-10min'),
  distance   = COALESCE(distance,   '12.5-12.5m'),
  reps       = COALESCE(reps,       '1/4'),
  intensity  = COALESCE(intensity,  '90-100% VMA alact.'),
  recovery   = COALESCE(recovery,   '2min30'),
  work_type  = COALESCE(work_type,  'Sprints départ, reprises de nages, virages (passive ou active)'),
  level_intensity = COALESCE(level_intensity, 5),
  level_duration  = COALESCE(level_duration,  1),
  level_recovery  = COALESCE(level_recovery,  4),
  level_lactate   = COALESCE(level_lactate,   1)
WHERE id = 'puissance-anaerobie-alact';

UPDATE swim_filieres SET
  heart_rate = COALESCE(heart_rate, 'Variable'),
  lactate    = COALESCE(lactate,    'Variable'),
  effort     = COALESCE(effort,     'Variable'),
  duration   = COALESCE(duration,   'Variable'),
  distance   = COALESCE(distance,   'Variable'),
  reps       = COALESCE(reps,       'Variable'),
  intensity  = COALESCE(intensity,  'Variable'),
  recovery   = COALESCE(recovery,   'Variable'),
  work_type  = COALESCE(work_type,  'Éducatifs, drills, coordination, coulées')
WHERE id = 'technique';
-- Technique keeps level_* NULL to render as "Variable" on gauges.

CREATE TABLE chrono_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  label TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  swimmers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chrono_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own chrono records"
  ON chrono_records FOR ALL
  USING (coach_id = auth.uid());

CREATE INDEX idx_chrono_records_coach ON chrono_records(coach_id);
CREATE INDEX idx_chrono_records_status ON chrono_records(coach_id, status);

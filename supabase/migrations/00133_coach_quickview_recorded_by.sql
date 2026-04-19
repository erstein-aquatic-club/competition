-- 2026-04-19 — Coach QuickView: attendance table + session comments + attribution columns

-- 1. Session attendance (new table — no prior attendance table existed)
CREATE TABLE IF NOT EXISTS public.session_attendance (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        INTEGER     NOT NULL REFERENCES public.dim_sessions(id) ON DELETE CASCADE,
  athlete_id        INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recorded_by       UUID        REFERENCES auth.users(id),
  status            TEXT        NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  comment           TEXT        CHECK (comment IS NULL OR char_length(comment) <= 200),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS session_attendance_athlete_idx  ON public.session_attendance(athlete_id);
CREATE INDEX IF NOT EXISTS session_attendance_session_idx  ON public.session_attendance(session_id);
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.session_attendance IS
  'Coach-recorded attendance per session per athlete. recorded_by = auth uid of the coach who entered it.';

-- 2. Session comments (new table — single-author coach_notes on dim_sessions not sufficient for multi-author QuickView)
CREATE TABLE IF NOT EXISTS public.session_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dim_session_id  INTEGER     NOT NULL REFERENCES public.dim_sessions(id) ON DELETE CASCADE,
  athlete_id      INTEGER     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_user_id  INTEGER     REFERENCES public.users(id),
  recorded_by     UUID        REFERENCES auth.users(id),
  body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_comments_session_idx   ON public.session_comments(dim_session_id);
CREATE INDEX IF NOT EXISTS session_comments_athlete_idx   ON public.session_comments(athlete_id);
ALTER TABLE public.session_comments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.session_comments IS
  'Coach-authored session comments. recorded_by = auth uid of the coach. Supplements dim_sessions.coach_notes for substitute coach flow.';

-- 3. Attribution on swim_planning_slot_overrides (per-athlete slot — substitute assigns session here)
ALTER TABLE public.swim_planning_slot_overrides
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.swim_planning_slot_overrides.recorded_by IS
  'auth uid of the coach who last set session_id on this slot. NULL = titulaire flow.';

-- 4. Attribution on swim_planning_slots (group slot — used if no per-athlete override exists)
ALTER TABLE public.swim_planning_slots
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.swim_planning_slots.recorded_by IS
  'auth uid of the coach who last set session_id on this group slot.';

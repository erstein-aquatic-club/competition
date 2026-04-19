# Coach QuickView — schema notes (2026-04-19)

## Tables confirmed

### Attendance
- **No dedicated attendance table exists.**
- Create: `public.session_attendance` (new) — cols to add: id UUID PK, session_id INTEGER → dim_sessions(id), athlete_id INTEGER → users(id), recorded_by UUID → auth.users(id), status TEXT ('present'|'absent'|'late'), comment TEXT NULL, created_at TIMESTAMPTZ
- Unique constraint: `(session_id, athlete_id)`

### Today slot (swim planning)
- `public.swim_planning_slot_overrides` — per-athlete: id UUID, athlete_id INT, week_start DATE, day_of_week SMALLINT, time_slot TEXT, filiere TEXT, session_id UUID NULL, created_at TIMESTAMPTZ
  - `session_id` here is a UUID with **no FK constraint** to any other table (orphaned or external reference)
- `public.swim_planning_slots` — group-level: id UUID, group_id INT, week_start DATE, day_of_week SMALLINT, time_slot TEXT, filiere TEXT, session_id UUID NULL, created_at TIMESTAMPTZ
- **For QuickView "today_slot"**: compute `week_start = date_trunc('week', CURRENT_DATE)::date`, `day_of_week = EXTRACT(isodow FROM CURRENT_DATE)`. Check override first, fall back to group slot.

### Traditional session assignment (SlotSessionSheet flow)
- `public.session_assignments` — id INT, assignment_type TEXT, swim_catalog_id INT → swim_sessions_catalog(id), target_user_id INT, target_group_id INT, assigned_by INT, scheduled_date DATE, status TEXT, training_slot_id UUID
- `public.training_slots` — id UUID, day_of_week SMALLINT, start_time TIME, end_time TIME, location TEXT, created_by INT, is_active BOOL, scheduled_date DATE

### Session catalog (library)
- `public.swim_sessions_catalog` — id INT (NOT uuid!), name TEXT, description TEXT, total_distance INT, created_by INT, is_archived BOOL, folder TEXT
  - **Note:** `swim_planning_slots.session_id` is UUID but `swim_sessions_catalog.id` is INTEGER — no direct FK between them. The `session_id` UUID in planning tables is self-contained (not a catalog reference).
  - For QuickView "assign session" CTA: use `session_assignments` + `swim_sessions_catalog` path (same as SlotSessionSheet).

### Swimmer sessions (completed sessions / feedback)
- `public.dim_sessions` — id INT, athlete_id INT → users(id), session_date DATE, time_slot TEXT, distance INT, duration INT, rpe INT, training_load INT, comments TEXT (athlete comment), coach_notes TEXT (existing coach note), assignment_id INT → session_assignments(id)

### Session comments (new table needed)
- **No `session_comments` table exists.** `dim_sessions.coach_notes` is the existing single-coach note field.
- Create new: `public.session_comments` for multi-author QuickView comments.

### Wellness
- `public.wellness_checks` — user_id INT, date DATE, sleep_quality SMALLINT, sleep_hours NUMERIC, fatigue SMALLINT, soreness SMALLINT, mood SMALLINT, stress SMALLINT, readiness_score SMALLINT, notes TEXT
  - **Use `readiness_score` — there is NO `overall_score` column.**

### Pain
- `public.pain_reports` — user_id INT, date DATE, body_zone TEXT (not `zone`), intensity SMALLINT
  - **Field is `body_zone`, not `zone`; date field is `date`, not `report_date`.**

### Performances (FFN)
- `public.swimmer_performances` — id INT, user_id INT, event_code TEXT, pool_length INT, time_seconds DOUBLE PRECISION, competition_date DATE, competition_name TEXT, ffn_points INT
  - **Table is `swimmer_performances`, NOT `ffn_performances`.**

### Objectives
- `public.objectives` — id UUID, athlete_id UUID, event_code TEXT, target_time_seconds NUMERIC, text TEXT, created_at TIMESTAMPTZ
  - athlete_id is UUID type, NOT the integer users.id.
  - These are swim performance targets, not general named objectives with `status/title` fields.
  - **No `status` or `title` column — the plan template's `athlete_objectives` doesn't exist.**

### Users / Profiles
- `public.users` — id INT, first_name TEXT, last_name TEXT, display_name TEXT, role TEXT, birthdate DATE (no `sex` column here!)
- `public.user_profiles` — user_id INT, display_name TEXT, birthdate DATE, group_id INT, group_label TEXT, avatar_url TEXT, sex TEXT, email TEXT
- `public.group_members` — user_id INT, group_id INT
- `public.groups` — id INT, label (check column name — likely `name` or `label`)

## RPCs reusable
- `get_swimmer_sessions(p_user_id, ...)` — returns swimmer's dim_sessions history
- `get_feedback_rates_all_athletes(...)` — global feedback rates (§148)
- Wellness aggregator: **none found** — compute inline
- Pain aggregator: **none found** — compute inline
- Load/ACWR: **none found** — compute inline from dim_sessions.training_load

## Missing tables (not in schema)
- `medical_restrictions` — **DOES NOT EXIST** → skip the `restrictions` block from the RPC
- `athlete_objectives` — **DOES NOT EXIST** → replace with inline query on `objectives` table (but different schema)
- `ffn_performances` — **DOES NOT EXIST** → use `swimmer_performances`
- `compute_load_summary()` — **DOES NOT EXIST** → inline SQL

## Gaps requiring migration (confirmed)

- [x] Create `session_attendance` table (new — no existing attendance table)
- [x] Add `recorded_by UUID` on `swim_planning_slot_overrides` (for substitute slot assignment)
- [x] Add `recorded_by UUID` on `swim_planning_slots` (for substitute slot assignment at group level)
- [x] Create `session_comments` table (new)
- [x] Create RPC `get_swimmer_quickview_briefing(p_athlete_id INTEGER)`

## Key corrections to plan template

| Plan says | Actual |
|-----------|--------|
| `<attendance_table>` | create new `session_attendance` |
| `swim_sessions` | `dim_sessions` (the actual table) |
| `<slot_attachment_table>` | `swim_planning_slot_overrides` (per-athlete) |
| `p_athlete_id BIGINT` | `INTEGER` (users.id is integer) |
| `wellness_entries.overall_score` | `wellness_checks.readiness_score` |
| `pain_reports.zone` | `pain_reports.body_zone` |
| `pain_reports.report_date` | `pain_reports.date` |
| `athlete_objectives` | `objectives` (different schema, no title/status) |
| `ffn_performances` | `swimmer_performances` |
| `compute_load_summary()` | inline SQL from `dim_sessions` |
| `medical_restrictions` | skip (table doesn't exist) |
| Next migration number | `00133` |

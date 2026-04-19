-- 2026-04-19 — Coach QuickView: SECURITY DEFINER RPC returning aggregated briefing
-- Corrections vs. plan template:
--   - p_athlete_id INTEGER (not BIGINT — users.id is integer)
--   - wellness_checks.readiness_score (not overall_score)
--   - pain_reports.body_zone / .date (not zone / report_date)
--   - swimmer_performances (not ffn_performances), competition_date (not .date)
--   - objectives.athlete_id is UUID → bridge via email
--   - No medical_restrictions table → omitted
--   - No compute_load_summary() → inline from dim_sessions
--   - today_session via session_assignments + swim_sessions_catalog (not swim_planning_slots)
--   - groups.name (not label)

CREATE OR REPLACE FUNCTION public.get_swimmer_quickview_briefing(
  p_athlete_id INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role     TEXT := app_user_role();
  v_result          JSONB;
  v_athlete_auth_id UUID;
BEGIN
  IF v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Bridge integer user ID to auth UUID for objectives table
  SELECT au.id INTO v_athlete_auth_id
  FROM auth.users au
  JOIN public.users pu ON pu.email = au.email
  WHERE pu.id = p_athlete_id
  LIMIT 1;

  SELECT jsonb_build_object(

    -- ── Profile ──────────────────────────────────────────────────────────────
    'profile', (
      SELECT jsonb_build_object(
        'id',           u.id,
        'display_name', u.display_name,
        'avatar_url',   up.avatar_url,
        'group_name',   g.name,
        'age',          EXTRACT(YEAR FROM age(u.birthdate))::int,
        'sex',          up.sex
      )
      FROM public.users u
      LEFT JOIN public.user_profiles  up ON up.user_id = u.id
      LEFT JOIN public.group_members  gm ON gm.user_id = u.id
      LEFT JOIN public.groups         g  ON g.id = gm.group_id
      WHERE u.id = p_athlete_id
      LIMIT 1
    ),

    -- ── Wellness (today) ─────────────────────────────────────────────────────
    'wellness_today', (
      SELECT jsonb_build_object(
        'readiness_score', w.readiness_score,
        'fatigue',         w.fatigue,
        'mood',            w.mood,
        'logged_at',       w.created_at
      )
      FROM public.wellness_checks w
      WHERE w.user_id = p_athlete_id
        AND w.date = CURRENT_DATE
      ORDER BY w.created_at DESC
      LIMIT 1
    ),

    -- ── Pain (last 7 days) ───────────────────────────────────────────────────
    'pain_summary', (
      SELECT jsonb_build_object(
        'zones',       COALESCE(jsonb_agg(DISTINCT pr.body_zone), '[]'::jsonb),
        'reports_7d',  COUNT(*)
      )
      FROM public.pain_reports pr
      WHERE pr.user_id = p_athlete_id
        AND pr.date > CURRENT_DATE - INTERVAL '7 days'
    ),

    -- ── Load (last 28 days inline) ───────────────────────────────────────────
    'load_summary', (
      SELECT jsonb_build_object(
        'volume_7d_km',  ROUND(COALESCE(SUM(CASE WHEN ds.session_date >= CURRENT_DATE - 6  THEN ds.distance END), 0)::numeric / 1000, 1),
        'volume_28d_km', ROUND(COALESCE(SUM(ds.distance), 0)::numeric / 1000, 1),
        'sessions_7d',   COUNT(CASE WHEN ds.session_date >= CURRENT_DATE - 6 THEN 1 END),
        'avg_rpe_7d',    ROUND(COALESCE(AVG(CASE WHEN ds.session_date >= CURRENT_DATE - 6 THEN ds.rpe END), 0)::numeric, 1)
      )
      FROM public.dim_sessions ds
      WHERE ds.athlete_id = p_athlete_id
        AND ds.session_date >= CURRENT_DATE - 27
    ),

    -- ── Objectives (performance targets, max 4 most recent) ──────────────────
    'objectives_short', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',                  o.id,
        'event_code',          o.event_code,
        'target_time_seconds', o.target_time_seconds,
        'text',                o.text
      ) ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT o.id, o.event_code, o.target_time_seconds, o.text, o.created_at
        FROM public.objectives o
        WHERE o.athlete_id = v_athlete_auth_id
        ORDER BY o.created_at DESC
        LIMIT 4
      ) o
    ),

    -- ── Recent performances (last 90 days, max 3) ────────────────────────────
    'recent_perfs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'event_code',       sp.event_code,
        'time_seconds',     sp.time_seconds,
        'competition_date', sp.competition_date,
        'competition_name', sp.competition_name,
        'pool_length',      sp.pool_length
      ) ORDER BY sp.competition_date DESC), '[]'::jsonb)
      FROM (
        SELECT sp.event_code, sp.time_seconds, sp.competition_date,
               sp.competition_name, sp.pool_length
        FROM public.swimmer_performances sp
        WHERE sp.user_id = p_athlete_id
          AND sp.competition_date > CURRENT_DATE - INTERVAL '90 days'
        ORDER BY sp.competition_date DESC
        LIMIT 3
      ) sp
    ),

    -- ── Today's session assignment ────────────────────────────────────────────
    -- Uses session_assignments (scheduled_date = today) + swim_sessions_catalog.
    -- Returns null if no session is scheduled.
    'today_session', (
      SELECT jsonb_build_object(
        'assignment_id',      sa.id,
        'catalog_id',         sa.swim_catalog_id,
        'time_slot',          sa.scheduled_slot,
        'session_name',       sc.name,
        'session_description',sc.description,
        'total_distance',     sc.total_distance
      )
      FROM public.session_assignments sa
      LEFT JOIN public.swim_sessions_catalog sc ON sc.id = sa.swim_catalog_id
      WHERE sa.scheduled_date = CURRENT_DATE
        AND sa.assignment_type = 'swim'
        AND (
          sa.target_user_id = p_athlete_id
          OR sa.target_group_id IN (
            SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = p_athlete_id
          )
        )
      ORDER BY sa.target_user_id DESC NULLS LAST
      LIMIT 1
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_swimmer_quickview_briefing(INTEGER)
  TO authenticated;

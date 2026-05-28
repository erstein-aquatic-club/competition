-- =============================================================================
-- Migration 00215 — Persist `sex` from signup metadata into user_profiles
--
-- The signup form (`src/pages/Login.tsx`) requires `sex` (M/F) and sends it
-- in `auth.signUp()` metadata, but the `handle_new_auth_user` trigger never
-- extracted it → every new account landed with `user_profiles.sex = NULL`.
--
-- Symptom (2026-05-28, athlete Ines, user_id=18): coach generation of a
-- mesocycle 50m crawl bounced on the `ProfileIncompleteScreen` gate at
-- `MesocyclePreview.tsx:393`, because the engine's KPI baremes
-- (`kpiBaremes.ts`) are sexed and require profile.sex ∈ {'M','F'}.
--
-- Fix: extract `sex` from `raw_user_meta_data`, validate against the
-- {'M','F'} domain (defensive: any other value falls back to NULL so the
-- gate triggers cleanly instead of corrupting the bareme lookup), and
-- insert it into `user_profiles.sex`. Existing rows are untouched —
-- the 4 remaining NULLs are all coaches who don't need a bilan.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    new_user_id INTEGER;
    display_name TEXT;
    raw_meta JSONB;
    user_birthdate DATE;
    user_group_id INTEGER;
    user_role TEXT;
    user_phone TEXT;
    user_sex TEXT;
    should_approve BOOLEAN;
BEGIN
    raw_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    display_name := COALESCE(
        raw_meta ->> 'display_name',
        raw_meta ->> 'full_name',
        split_part(NEW.email, '@', 1)
    );

    user_birthdate := CASE
        WHEN raw_meta ->> 'birthdate' IS NOT NULL
        THEN (raw_meta ->> 'birthdate')::date
        ELSE NULL
    END;

    user_group_id := CASE
        WHEN raw_meta ->> 'group_id' IS NOT NULL
        THEN (raw_meta ->> 'group_id')::integer
        ELSE NULL
    END;

    user_phone := raw_meta ->> 'phone';

    -- Defensive: only 'M' or 'F' are accepted by the strength engine baremes.
    -- Anything else (including missing) → NULL → ProfileIncompleteScreen gate
    -- triggers, which is the correct failure mode (asks the user/coach to fix
    -- the profile rather than silently picking a wrong bareme).
    user_sex := CASE
        WHEN raw_meta ->> 'sex' IN ('M', 'F') THEN raw_meta ->> 'sex'
        ELSE NULL
    END;

    user_role := COALESCE(raw_meta ->> 'role', 'athlete');
    should_approve := (user_role = 'athlete');

    INSERT INTO public.users (
        display_name,
        display_name_lower,
        email,
        role,
        birthdate,
        is_active
    ) VALUES (
        display_name,
        lower(display_name),
        NEW.email,
        user_role,
        user_birthdate,
        true
    )
    RETURNING id INTO new_user_id;

    INSERT INTO public.user_profiles (
        user_id,
        group_id,
        display_name,
        email,
        birthdate,
        phone,
        sex,
        is_approved,
        approved_at
    )
    VALUES (
        new_user_id,
        user_group_id,
        display_name,
        NEW.email,
        user_birthdate,
        user_phone,
        user_sex,
        should_approve,
        CASE WHEN should_approve THEN now() ELSE NULL END
    );

    IF user_group_id IS NOT NULL THEN
        INSERT INTO public.group_members (group_id, user_id)
        VALUES (user_group_id, new_user_id)
        ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;

    UPDATE auth.users
    SET
        raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('app_user_id', new_user_id)
            || jsonb_build_object('app_user_role', user_role),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

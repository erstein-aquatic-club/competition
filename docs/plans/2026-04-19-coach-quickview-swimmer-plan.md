# Coach QuickView Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hard "access denied" screen that coaches see when clicking on a non-assigned swimmer card with a read-only "dépannage mode" briefing view that allows attendance + session comment + (if slot is empty) session assignment, with full `recorded_by` attribution.

**Architecture:** New dedicated page `CoachSwimmerQuickView` behind a routing dispatch in the current `CoachSwimmerDetail`. Reads go through a single `SECURITY DEFINER` RPC that returns only aggregated/non-sensitive fields. Writes use new RLS policies that force `recorded_by = app_user_id()`. Session assignment reuses the existing `SlotSessionSheet` drawer adapted for non-assigned coaches.

**Tech Stack:** React 19 + TypeScript + Vite, Tailwind CSS 4 + shadcn/Radix, Zustand 5, React Query 5, Supabase Postgres, Vitest, RLS integration tests via local Supabase (`supabase/tests/rls/`).

**Design reference:** `docs/plans/2026-04-19-coach-quickview-swimmer-design.md` + `docs/plans/2026-04-19-coach-quickview-mockup.html`.

---

## Pre-flight: schema discovery (15 min, no commit)

Before writing migrations, verify assumptions using MCP Supabase. The design doc lists table/column names that need confirmation.

**Checks:**

1. `mcp__plugin_supabase_supabase__list_tables` → confirm presence of:
   - Attendance table (candidates: `session_attendance`, `attendance_records`, or embedded in `session_assignments` / `dim_sessions`)
   - Slot table (candidates: `slots`, `training_slots`, `swim_session_slots`, `swimmer_slots`)
   - Session comments table (or confirm `dim_sessions.comments` is the only store — `coach-comments.ts` uses `dim_sessions.comments`)
   - Swim sessions source table (the base table behind `get_swimmer_sessions` RPC)

2. For the identified tables, `mcp__plugin_supabase_supabase__execute_sql` to inspect columns:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('<candidates...>');
   ```

3. Check existing RPCs that already compute KPIs we need (to avoid duplicating logic):
   ```sql
   SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
     AND proname ~ 'swimmer|wellness|pain|load|acwr|feedback';
   ```
   Expect to find `get_swimmer_sessions` (§129), `get_feedback_rates_all_athletes` (§148 in ROADMAP), and likely wellness/pain aggregators.

4. Record findings in a note block at the top of the migration file (Task 2).

**Output:** a short memo file `docs/plans/2026-04-19-coach-quickview-schema-notes.md` listing the exact tables, columns, and RPCs that the later tasks will target. **No code change, no commit yet.**

---

## Task 0: Verify RLS test harness is available

**Files:** none — environment check only.

**Step 1:** `docker ps` — verify Docker Desktop is running. If not, **ask the user to start it** (per CLAUDE.md §Économie de tokens, never start Docker autonomously).

**Step 2:** If containers are down, run `supabase start` (single run per session). If up, skip.

**Step 3:** `npm run test:rls -- --reporter=tap --run 2>&1 | tail -20` to confirm baseline green on main.

Expected: all existing tests pass (status quo).

**No commit.**

---

## Task 1: Schema memo

**Files:**
- Create: `docs/plans/2026-04-19-coach-quickview-schema-notes.md`

**Step 1:** Write the memo with the exact findings from pre-flight. Template:

```markdown
# Coach QuickView — schema notes (2026-04-19)

## Tables confirmed
- Attendance: `<actual name>` — cols: id, session_id, athlete_id, status, created_at, ...
- Slot:       `<actual name>` — cols: id, group_id, weekday, time_slot, session_id (or attachment table name), ...
- Session:    `<actual name>` — base table used by `get_swimmer_sessions`
- Comments:   <either existing table or "store in dim_sessions.comments via existing pattern">

## RPCs reusable
- get_swimmer_sessions(p_user_id, ...) — existing
- get_feedback_rates_all_athletes(...) — existing (§148)
- Wellness aggregator: <name or "none found, compute inline">
- Pain aggregator:     <name or "none found">

## Gaps requiring migration
- [ ] Add `recorded_by UUID` on attendance table
- [ ] Add `recorded_by UUID` on swim_sessions
- [ ] Add `recorded_by UUID` on slot attachment
- [ ] Create `session_comments` table OR reuse `dim_sessions.comments` + add `coach_comments` mini-table for coach-authored lines
- [ ] Create RPC `get_swimmer_quickview_briefing(p_athlete_id bigint)`
```

**Step 2:** Commit.

```bash
git add docs/plans/2026-04-19-coach-quickview-schema-notes.md
git commit -m "docs(plans): QuickView schema discovery notes"
```

---

## Task 2: Migration — recorded_by columns + comments table

**Files:**
- Create: `supabase/migrations/00133_coach_quickview_recorded_by.sql`

Adjust table/column names to match memo from Task 1.

**Step 1:** Write the migration file. Template (substitute `<attendance_table>` etc.):

```sql
-- 2026-04-19 — Coach QuickView: attribution columns for substitute coach actions

-- 1. Attribution on attendance
ALTER TABLE public.<attendance_table>
  ADD COLUMN IF NOT EXISTS recorded_by UUID
  REFERENCES auth.users(id);

COMMENT ON COLUMN public.<attendance_table>.recorded_by IS
  'auth uid of the coach who recorded this attendance. NULL = standard flow (titulaire). Set when a substitute coach acts in QuickView.';

-- 2. Attribution on swim_sessions (for ad-hoc sessions created by substitutes)
ALTER TABLE public.swim_sessions
  ADD COLUMN IF NOT EXISTS recorded_by UUID
  REFERENCES auth.users(id);

-- 3. Attribution on slot attachment
ALTER TABLE public.<slot_attachment_table>
  ADD COLUMN IF NOT EXISTS recorded_by UUID
  REFERENCES auth.users(id);

-- 4. Session comments (if no existing table serves this)
CREATE TABLE IF NOT EXISTS public.session_comments (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES public.swim_sessions(id) ON DELETE CASCADE,
  athlete_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_user_id BIGINT NOT NULL REFERENCES public.users(id),
  recorded_by UUID REFERENCES auth.users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_comments_session_idx
  ON public.session_comments(session_id);
CREATE INDEX IF NOT EXISTS session_comments_athlete_idx
  ON public.session_comments(athlete_id);

ALTER TABLE public.session_comments ENABLE ROW LEVEL SECURITY;
```

**Step 2:** Apply via MCP:

```
mcp__plugin_supabase_supabase__apply_migration
  name: coach_quickview_recorded_by
  query: <content of SQL file>
```

**Step 3:** Verify columns exist.

```
mcp__plugin_supabase_supabase__execute_sql
  query: SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND column_name='recorded_by';
```

Expected: rows for each touched table.

**Step 4:** Commit.

```bash
git add supabase/migrations/00133_coach_quickview_recorded_by.sql
git commit -m "feat(db): recorded_by columns + session_comments for Coach QuickView"
```

---

## Task 3: Migration — RLS policies for substitute writes

**Files:**
- Create: `supabase/migrations/00134_coach_quickview_rls.sql`

**Step 1:** Write the migration. Use helpers `app_user_id()` + `app_user_role()` (CLAUDE.md). Use `is_same_club` or equivalent existing helper if multi-club boundary applies — check schema-notes memo.

```sql
-- 2026-04-19 — Coach QuickView: write policies for substitute coaches

-- ATTENDANCE: allow any coach to insert/update when recorded_by = self
DROP POLICY IF EXISTS attendance_sub_write ON public.<attendance_table>;
CREATE POLICY attendance_sub_write ON public.<attendance_table>
  FOR ALL
  TO authenticated
  USING (
    app_user_role() = 'coach'
    AND recorded_by = auth.uid()
  )
  WITH CHECK (
    app_user_role() = 'coach'
    AND recorded_by = auth.uid()
  );

-- SESSION_COMMENTS: coach insert if recorded_by = self
DROP POLICY IF EXISTS session_comments_coach_insert ON public.session_comments;
CREATE POLICY session_comments_coach_insert ON public.session_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_user_role() = 'coach'
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS session_comments_coach_select ON public.session_comments;
CREATE POLICY session_comments_coach_select ON public.session_comments
  FOR SELECT
  TO authenticated
  USING (
    app_user_role() IN ('coach', 'admin', 'comité')
  );

-- SWIM_SESSIONS: allow coach to INSERT ad-hoc session when recorded_by = self
-- (Existing policies handle titulaire case; this adds the substitute path.)
DROP POLICY IF EXISTS swim_sessions_sub_insert ON public.swim_sessions;
CREATE POLICY swim_sessions_sub_insert ON public.swim_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_user_role() = 'coach'
    AND recorded_by = auth.uid()
  );

-- SLOT ATTACHMENT: substitute may UPDATE to hook a session IFF slot currently empty
DROP POLICY IF EXISTS slot_attach_sub_update ON public.<slot_attachment_table>;
CREATE POLICY slot_attach_sub_update ON public.<slot_attachment_table>
  FOR UPDATE
  TO authenticated
  USING (
    app_user_role() = 'coach'
    AND session_id IS NULL     -- slot must be empty
  )
  WITH CHECK (
    app_user_role() = 'coach'
    AND recorded_by = auth.uid()
    AND session_id IS NOT NULL -- must be hooking a session
  );
```

**Step 2:** Apply via MCP.

**Step 3:** Commit.

```bash
git add supabase/migrations/00134_coach_quickview_rls.sql
git commit -m "feat(db): RLS policies for substitute coach writes"
```

---

## Task 4: Migration — `get_swimmer_quickview_briefing` RPC

**Files:**
- Create: `supabase/migrations/00135_get_swimmer_quickview_briefing.sql`

**Step 1:** Write the RPC. Returns a JSONB with ONLY aggregated/safe fields. Reuse existing RPCs where possible (per schema memo). Skeleton:

```sql
CREATE OR REPLACE FUNCTION public.get_swimmer_quickview_briefing(
  p_athlete_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT := app_user_role();
  v_result JSONB;
BEGIN
  -- Gate: only coaches may call (admins already have full access elsewhere)
  IF v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id', u.id, 'display_name', u.name,
        'avatar_url', p.avatar_url,
        'group_label', g.label,
        'age', EXTRACT(YEAR FROM age(p.birthdate))::int,
        'sex', p.sex
      )
      FROM public.users u
      LEFT JOIN public.user_profiles p ON p.user_id = u.id
      LEFT JOIN public.group_members gm ON gm.user_id = u.id
      LEFT JOIN public.groups g ON g.id = gm.group_id
      WHERE u.id = p_athlete_id
      LIMIT 1
    ),
    'wellness_today', (
      SELECT jsonb_build_object(
        'score', w.overall_score,
        'logged_at', w.created_at
      )
      FROM public.wellness_entries w
      WHERE w.user_id = p_athlete_id
        AND w.log_date = CURRENT_DATE
      ORDER BY w.created_at DESC
      LIMIT 1
    ),
    'pain_summary', (
      SELECT jsonb_build_object(
        'zones', array_agg(DISTINCT zone),
        'reports_7d', count(*)
      )
      FROM public.pain_reports
      WHERE user_id = p_athlete_id
        AND report_date > CURRENT_DATE - INTERVAL '7 days'
    ),
    'load_summary', (
      SELECT jsonb_build_object(
        'acwr', round(acwr::numeric, 2),
        'volume_7d_km', volume_7d_km,
        'absences_30d', absences_30d
      )
      FROM public.compute_load_summary(p_athlete_id)  -- use existing if present; else inline
    ),
    'objectives_short', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title, 'horizon', o.target_date
      ))
      FROM public.athlete_objectives o
      WHERE o.athlete_id = p_athlete_id
        AND o.status = 'active'
      LIMIT 4
    ),
    'recent_perfs', (
      SELECT jsonb_agg(row_to_json(p))
      FROM (
        SELECT p.event, p.time_seconds, p.date, p.delta_seconds
        FROM public.ffn_performances p
        WHERE p.user_id = p_athlete_id
          AND p.date > CURRENT_DATE - INTERVAL '90 days'
        ORDER BY p.date DESC
        LIMIT 3
      ) p
    ),
    'today_slot', (
      SELECT jsonb_build_object(
        'slot_id', s.id,
        'time_slot', s.time_slot,
        'session', CASE WHEN s.session_id IS NULL THEN NULL ELSE
          (SELECT jsonb_build_object(
            'id', sw.id, 'title', sw.title, 'content', sw.content,
            'note_today', sw.coach_notes
          ) FROM public.swim_sessions sw WHERE sw.id = s.session_id)
        END
      )
      FROM public.<slot_table> s
      WHERE s.athlete_id = p_athlete_id
        AND s.date = CURRENT_DATE
      LIMIT 1
    ),
    'restrictions', (
      SELECT jsonb_agg(jsonb_build_object('text', text, 'set_at', set_at))
      FROM public.medical_restrictions
      WHERE user_id = p_athlete_id AND active IS TRUE
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_swimmer_quickview_briefing(BIGINT)
  TO authenticated;
```

> **Important:** substitute concrete table/column names from the schema memo. The skeleton above uses plausible names — every reference MUST be verified before apply.

**Step 2:** Apply via MCP.

**Step 3:** Test via SQL directly:

```
mcp__plugin_supabase_supabase__execute_sql
  query: SELECT public.get_swimmer_quickview_briefing(<some_real_athlete_id>);
```

Expected: single JSONB row with the documented keys.

**Step 4:** Commit.

```bash
git add supabase/migrations/00135_get_swimmer_quickview_briefing.sql
git commit -m "feat(db): add get_swimmer_quickview_briefing RPC"
```

---

## Task 5: New API module `coach-quickview.ts`

**Files:**
- Create: `src/lib/api/coach-quickview.ts`
- Modify: `src/lib/api/index.ts` (add re-exports)
- Create: `src/lib/api/__tests__/coach-quickview.test.ts`

**Step 1:** Write the failing test first.

```typescript
// src/lib/api/__tests__/coach-quickview.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSwimmerBriefing, recordAttendanceAsSub } from '../coach-quickview';

vi.mock('../client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
  canUseSupabase: () => true,
}));

describe('coach-quickview', () => {
  it('getSwimmerBriefing calls RPC and returns typed payload', async () => {
    const { supabase } = await import('../client');
    (supabase.rpc as any).mockResolvedValue({
      data: { profile: { id: 1, display_name: 'X' }, wellness_today: null },
      error: null,
    });
    const res = await getSwimmerBriefing(42);
    expect(supabase.rpc).toHaveBeenCalledWith('get_swimmer_quickview_briefing', { p_athlete_id: 42 });
    expect(res.profile.id).toBe(1);
  });

  it('recordAttendanceAsSub sends recorded_by omitted (DB fills via policy)', async () => {
    // Contract: API never sends recorded_by explicitly; RLS policy enforces auth.uid()
    await recordAttendanceAsSub({ sessionId: 10, status: 'present', comment: 'ok' });
    // assertion on the upsert payload shape would go here
  });
});
```

**Step 2:** Run: `npm test -- src/lib/api/__tests__/coach-quickview.test.ts`. Expected: FAIL (module doesn't exist).

**Step 3:** Implement `src/lib/api/coach-quickview.ts`:

```typescript
import { supabase, canUseSupabase } from './client';

export interface SwimmerBriefing {
  profile: {
    id: number;
    display_name: string;
    avatar_url: string | null;
    group_label: string | null;
    age: number | null;
    sex: 'H' | 'F' | null;
  };
  wellness_today: { score: number; logged_at: string } | null;
  pain_summary: { zones: string[]; reports_7d: number } | null;
  load_summary: {
    acwr: number | null;
    volume_7d_km: number | null;
    absences_30d: number;
  } | null;
  objectives_short: Array<{ id: number; title: string; horizon: string | null }>;
  recent_perfs: Array<{ event: string; time_seconds: number; date: string; delta_seconds: number | null }>;
  today_slot: {
    slot_id: number;
    time_slot: string;
    session: {
      id: number;
      title: string;
      content: string;
      note_today: string | null;
    } | null;
  } | null;
  restrictions: Array<{ text: string; set_at: string }>;
}

export async function getSwimmerBriefing(athleteId: number): Promise<SwimmerBriefing | null> {
  if (!canUseSupabase()) return null;
  const { data, error } = await supabase.rpc('get_swimmer_quickview_briefing', { p_athlete_id: athleteId });
  if (error) throw error;
  return data as SwimmerBriefing;
}

export type AttendanceStatus = 'present' | 'absent' | 'late';

export async function recordAttendanceAsSub(input: {
  sessionId: number;
  athleteId: number;
  status: AttendanceStatus;
  comment?: string;
}) {
  if (!canUseSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('<attendance_table>')  // from schema memo
    .upsert({
      session_id: input.sessionId,
      athlete_id: input.athleteId,
      status: input.status,
      comment: input.comment ?? null,
      // recorded_by is NOT sent — policy sets it via auth.uid()
      // If DB needs explicit value, set recorded_by: (await supabase.auth.getUser()).data.user!.id
    });
  if (error) throw error;
}

export async function addSessionCommentAsSub(input: {
  sessionId: number;
  athleteId: number;
  body: string;
}) {
  if (!canUseSupabase()) throw new Error('Supabase not configured');
  const { data: auth } = await supabase.auth.getUser();
  const recordedBy = auth.user?.id;
  const { error } = await supabase.from('session_comments').insert({
    session_id: input.sessionId,
    athlete_id: input.athleteId,
    author_user_id: null, // or the titulaire user id if known
    recorded_by: recordedBy,
    body: input.body,
  });
  if (error) throw error;
}

export async function assignSessionToSlotAsSub(input: {
  slotId: number;
  source: 'library' | 'ad-hoc';
  sessionId?: number; // library mode
  adHoc?: { title: string; content: string; distance_m?: number; duration_min?: number }; // ad-hoc mode
}) {
  if (!canUseSupabase()) throw new Error('Supabase not configured');
  const { data: auth } = await supabase.auth.getUser();
  const recordedBy = auth.user?.id!;

  let sessionId = input.sessionId;
  if (input.source === 'ad-hoc') {
    const { data: created, error: e1 } = await supabase
      .from('swim_sessions')
      .insert({ ...input.adHoc, recorded_by: recordedBy })
      .select('id')
      .single();
    if (e1) throw e1;
    sessionId = created!.id;
  }

  const { error: e2 } = await supabase
    .from('<slot_attachment_table>')
    .update({ session_id: sessionId!, recorded_by: recordedBy })
    .eq('id', input.slotId);
  if (e2) throw e2;
}
```

**Step 4:** Add re-exports in `src/lib/api/index.ts`:

```typescript
export {
  getSwimmerBriefing,
  recordAttendanceAsSub,
  addSessionCommentAsSub,
  assignSessionToSlotAsSub,
  type SwimmerBriefing,
  type AttendanceStatus,
} from './coach-quickview';
```

**Step 5:** Run tests. `npm test -- src/lib/api/__tests__/coach-quickview.test.ts`. Expected: PASS.

**Step 6:** Commit.

```bash
git add src/lib/api/coach-quickview.ts src/lib/api/__tests__/coach-quickview.test.ts src/lib/api/index.ts
git commit -m "feat(api): add coach-quickview module for substitute coach flow"
```

---

## Task 6: Rename current detail page → FullView, add dispatcher

**Files:**
- Rename: `src/pages/coach/CoachSwimmerDetail.tsx` → `src/pages/coach/CoachSwimmerFullView.tsx`
- Create: `src/pages/coach/CoachSwimmerDetail.tsx` (new, thin dispatcher)
- Modify: `src/pages/Coach.tsx` (lazy import path unchanged — still `CoachSwimmerDetail`)

**Step 1:** `git mv src/pages/coach/CoachSwimmerDetail.tsx src/pages/coach/CoachSwimmerFullView.tsx`

**Step 2:** Inside the renamed file, rename the exported component: `export default function CoachSwimmerFullView(...)`.

**Step 3:** Drop the `hasAccess` block inside `CoachSwimmerFullView.tsx` (lines ~160-170) — the dispatcher now owns that check.

**Step 4:** Create the new `CoachSwimmerDetail.tsx` dispatcher:

```typescript
import { useRoute } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useMySwimmerIds } from '@/hooks/useMySwimmerIds';
import { lazyWithRetry } from '@/lib/lazy';
import { Suspense } from 'react';

const CoachSwimmerFullView = lazyWithRetry(() => import('./CoachSwimmerFullView'));
const CoachSwimmerQuickView = lazyWithRetry(() => import('./CoachSwimmerQuickView'));

type Props = { athleteId?: number | null; athleteName?: string | null; onBack?: () => void };

export default function CoachSwimmerDetail(props: Props = {}) {
  const [, params] = useRoute('/coach/swimmer/:id');
  const { selectedAthleteId, role } = useAuth();
  const athleteId = props.athleteId ?? (params?.id ? Number(params.id) : selectedAthleteId);
  const { swimmerIds } = useMySwimmerIds();
  const hasAccess = swimmerIds === null || (athleteId != null && swimmerIds.has(athleteId));

  const Inner = role === 'coach' && !hasAccess ? CoachSwimmerQuickView : CoachSwimmerFullView;
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Chargement…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}
```

**Step 5:** Create placeholder `CoachSwimmerQuickView.tsx` so the import resolves:

```typescript
export default function CoachSwimmerQuickView() {
  return <div className="p-4">QuickView (work in progress)</div>;
}
```

**Step 6:** `npx tsc --noEmit` — expected: PASS.

**Step 7:** `npm test` — expected: all passing.

**Step 8:** Commit.

```bash
git add src/pages/coach/
git commit -m "refactor(coach): split SwimmerDetail into dispatcher + FullView"
```

---

## Task 7: Shared KPI sub-components

**Files:**
- Create: `src/components/coach/swimmer-kpis/SwimmerFormBadge.tsx`
- Create: `src/components/coach/swimmer-kpis/PainIndicator.tsx`
- Create: `src/components/coach/swimmer-kpis/LoadMini.tsx`
- Create: `src/components/coach/swimmer-kpis/ObjectiveChips.tsx`
- Create: `src/components/coach/swimmer-kpis/__tests__/*.test.tsx` (one per component)

Each component is a pure view — no data fetching — that takes props matching the `SwimmerBriefing` subfields.

**Step 1 (per component):** Write failing rendering test (render with nominal / empty / alert state, assert DOM).

**Step 2 (per component):** Implement per mockup HTML (`docs/plans/2026-04-19-coach-quickview-mockup.html`). Keep ≤ 60 LOC each. Use existing project icons (Lucide), palette (shadcn), radius `rounded-2xl`.

**Step 3:** Run tests, all PASS.

**Step 4:** Commit.

```bash
git add src/components/coach/swimmer-kpis/
git commit -m "feat(coach): shared KPI sub-components for swimmer views"
```

---

## Task 8: Flesh out `CoachSwimmerQuickView` — layout + static blocks

**Files:**
- Modify: `src/pages/coach/CoachSwimmerQuickView.tsx`
- Create: `src/pages/coach/__tests__/CoachSwimmerQuickView.test.tsx`

**Step 1:** Write a smoke test: rendering with a mock briefing, assert ribbon "Mode dépannage" present, blocks present in order.

**Step 2:** Implement the full layout matching the mockup: header (back + breadcrumb + identity card), amber ribbon, briefing block (uses `SwimmerFormBadge` + `PainIndicator`), load (`LoadMini`), `ObjectiveChips`, recent perfs rail, session-today block (pass-through for now — Task 9 handles the 3 states), sticky footer placeholder.

- Uses `useQuery(['coach-quickview-briefing', athleteId], () => getSwimmerBriefing(athleteId), { staleTime: 2 * 60 * 1000 })`
- Loading skeleton + error state (toast + retry)

**Step 3:** `npm test -- src/pages/coach/__tests__/CoachSwimmerQuickView.test.tsx` — PASS.

**Step 4:** Verify visually: `npm run dev`, log in as a coach non-assigned, click a swimmer card outside their list. The amber ribbon + layout should match the nominal variant of the mockup.

**Step 5:** Commit.

```bash
git add src/pages/coach/CoachSwimmerQuickView.tsx src/pages/coach/__tests__/CoachSwimmerQuickView.test.tsx
git commit -m "feat(coach): QuickView layout with briefing/load/objectives/perfs"
```

---

## Task 9: Session-today block — 3 states

**Files:**
- Modify: `src/pages/coach/CoachSwimmerQuickView.tsx`
- Modify: test file — add 3 cases (session present, slot empty, no slot)

**Step 1:** Add 3 failing test cases.

**Step 2:** Implement conditional rendering per mockup:
- `briefing.today_slot === null` → "Pas de séance planifiée" message, no buttons, footer hidden
- `briefing.today_slot && briefing.today_slot.session === null` → dashed border primary block + "Assigner une séance" CTA (wired in Task 12) + footer locked message
- `briefing.today_slot.session !== null` → full session block (title, content, titulaire note) + sticky footer with Attendance/Comment buttons

**Step 3:** Run tests — PASS.

**Step 4:** Commit.

```bash
git add src/pages/coach/
git commit -m "feat(coach): QuickView session-today block with 3 states"
```

---

## Task 10: Attendance modal

**Files:**
- Create: `src/pages/coach/QuickViewAttendanceDialog.tsx`
- Modify: `src/pages/coach/CoachSwimmerQuickView.tsx` (wire button)
- Create: `src/pages/coach/__tests__/QuickViewAttendanceDialog.test.tsx`

**Step 1:** Write failing test — dialog opens, radio group, submit calls `recordAttendanceAsSub` with payload.

**Step 2:** Implement with shadcn `Dialog`: radio group (Présent/Absent/Retard), optional comment textarea (max 200), submit button with loading state. Shows existing attendance row warning if it already exists (second query) — confirm before overwrite.

**Step 3:** Wire into QuickView sticky footer "Présence" button.

**Step 4:** Tests — PASS.

**Step 5:** Manual: open QuickView, click Présence, submit, check DB via `mcp__plugin_supabase_supabase__execute_sql` that row has correct `recorded_by`.

**Step 6:** Commit.

```bash
git add src/pages/coach/
git commit -m "feat(coach): QuickView attendance dialog"
```

---

## Task 11: Session comment modal

**Files:**
- Create: `src/pages/coach/QuickViewCommentDialog.tsx`
- Modify: `src/pages/coach/CoachSwimmerQuickView.tsx`
- Create: test file

**Step 1:** Failing test.

**Step 2:** Implement: textarea max 500 char + live counter + submit calls `addSessionCommentAsSub`.

**Step 3:** Wire button.

**Step 4:** Tests — PASS.

**Step 5:** Manual verify DB row has `recorded_by` set.

**Step 6:** Commit.

```bash
git commit -m "feat(coach): QuickView session comment dialog"
```

---

## Task 12: Assign session drawer

**Files:**
- Create: `src/pages/coach/QuickViewAssignDrawer.tsx`
- Modify: `src/pages/coach/CoachSwimmerQuickView.tsx` (wire CTA)
- Create: test file

The goal is to reuse as much as possible from the existing 1443-LOC `SlotSessionSheet.tsx`. Approach:

**Step 1:** Read `SlotSessionSheet.tsx` in depth. Identify the inner "pick session" UI and extract it into a reusable presentational component if not already.

**Step 2:** Create `QuickViewAssignDrawer` using shadcn `Sheet`: two tabs (Bibliothèque / Nouvelle) matching mockup variant 4.
- Bibliothèque: search input + list of unassigned sessions (reuse existing filtered query)
- Nouvelle: minimal form (title required, content textarea, optional distance / duration)
- Footer CTA "Assigner au créneau <hh:mm>" calls `assignSessionToSlotAsSub({ slotId, source, sessionId?, adHoc? })`
- On success: `queryClient.invalidateQueries(['coach-quickview-briefing', athleteId])` + toast

**Step 3:** Wire CTA from QuickView session-today block (empty-slot state).

**Step 4:** Tests (mock API, assert drawer opens/closes, both tabs work, submission calls API with right payload).

**Step 5:** Manual: create an empty slot on a non-assigned swimmer (via DB for now), open QuickView, assign from library → verify DB hook-up + `recorded_by` + block flips to "session present" state without page reload.

**Step 6:** Commit.

```bash
git commit -m "feat(coach): QuickView assign-session drawer (library + ad-hoc)"
```

---

## Task 13: RLS integration tests

**Files:**
- Create: `supabase/tests/rls/coach-quickview.test.ts`

**Step 1:** Ensure Docker is running (Task 0 re-check). `supabase start` if needed.

**Step 2:** Write the test file. Use existing harness in `supabase/tests/rls/`. Read `docs/rls-testing.md` if needed (only if an existing pattern doesn't already cover what we need — **do not read by default**, per CLAUDE.md token budget).

Cases (one `test()` block per scenario):

```typescript
import { test, expect } from 'vitest';
import { withCoach, withAthlete, seedSwimmerWithSlot } from './harness';

test('substitute coach can read briefing via RPC', async () => {
  const { athleteId } = await seedSwimmerWithSlot({ assignToCoachA: true });
  await withCoach('coachB', async (sql) => {
    const r = await sql`SELECT public.get_swimmer_quickview_briefing(${athleteId})`;
    expect(r[0]).toBeDefined();
  });
});

test('substitute cannot SELECT wellness_entries directly', async () => {
  const { athleteId } = await seedSwimmerWithSlot({ assignToCoachA: true });
  await withCoach('coachB', async (sql) => {
    const r = await sql`SELECT * FROM wellness_entries WHERE user_id = ${athleteId}`;
    expect(r.length).toBe(0); // RLS filter returns empty
  });
});

test('substitute can insert attendance with recorded_by = self', async () => { ... });
test('substitute cannot insert attendance with recorded_by = other', async () => { ... });
test('substitute can insert session_comment with recorded_by = self', async () => { ... });
test('substitute cannot insert into athlete_objectives', async () => { ... });
test('substitute cannot insert into athlete_interviews', async () => { ... });
test('substitute can INSERT swim_sessions + UPDATE empty slot', async () => { ... });
test('substitute cannot UPDATE slot that already has a session', async () => { ... });
test('substitute cannot create a new slot', async () => { ... });
```

**Step 3:** Run: `npm run test:rls -- coach-quickview --run`. All PASS.

**Step 4:** Commit.

```bash
git add supabase/tests/rls/coach-quickview.test.ts
git commit -m "test(rls): coverage for Coach QuickView substitute flow"
```

---

## Task 14: Attribution display on FullView (for titulaire)

**Files:**
- Modify: `src/pages/coach/CoachSwimmerFullView.tsx` — attendance + comment rows
- Modify: any existing component showing attendance/comments (check `SwimmerFeedbackTab.tsx`, `SwimmerSlotsTab.tsx`)

**Step 1:** Identify where attendance + comment rows are rendered.

**Step 2:** Add a subtle gray badge when `row.recorded_by` is set AND differs from the titulaire's id:
```tsx
{row.recorded_by && row.recorded_by !== titulaireAuthUid && (
  <Badge variant="outline" className="text-[10px] text-muted-foreground ml-1.5">
    saisi par {subCoachName} • dépannage
  </Badge>
)}
```

**Step 3:** Same treatment on the slot session block: "Séance assignée par Coach X (dépannage)".

**Step 4:** Repeat for swimmer-side views: `src/pages/Dashboard.tsx` / `SwimmerHome.tsx` — wherever the athlete sees a coach comment.

**Step 5:** Visual test manually. Commit.

```bash
git commit -m "feat(coach): display substitute attribution on titulaire and athlete views"
```

---

## Task 15: Documentation workflow (CLAUDE.md, ROADMAP, implementation-log, FEATURES_STATUS)

Per CLAUDE.md § "Workflow de documentation obligatoire".

**Files:**
- Modify: `docs/implementation-log.md` (add §150 entry)
- Modify: `docs/ROADMAP.md` (add chantier entry + update "Dernière mise à jour")
- Modify: `docs/FEATURES_STATUS.md` (add row for Coach QuickView feature ✅)
- Modify: `docs/claude/files-map.md` (add new files with `wc -l`-measured sizes)
- Modify: `CLAUDE.md` (§ Chantiers: update "Dernière entrée en date" to §150; § Hubs: no change — QuickView is not a hub)

**Step 1:** Measure sizes: `wc -l <all new files>`. Record exact numbers.

**Step 2:** Write implementation-log entry with: context, changes, files modified, tests, decisions, limits.

**Step 3:** Update ROADMAP + FEATURES_STATUS + CLAUDE.md + files-map per rules.

**Step 4:** Commit.

```bash
git add docs/ CLAUDE.md
git commit -m "docs: log Coach QuickView (§150) + update features status"
```

---

## Task 16: Final verification

**Step 1:** `npx tsc --noEmit` — PASS.

**Step 2:** `npm test` — all green.

**Step 3:** `npm run test:rls` — all green.

**Step 4:** Manual end-to-end scenario using two browsers (coach-A titulaire + coach-B substitute):
1. Coach-B opens a swimmer owned by coach-A → sees QuickView with ribbon
2. Slot empty → assigns a session from library → block flips to "present" state
3. Records attendance + comment
4. Coach-A reloads the swimmer fiche → sees attribution badges on both the session, the attendance row, and the comment
5. Swimmer logs in → sees the comment with "(remplaçant)" tag

**Step 5:** If any defect: open new task(s), fix, commit separately.

**Step 6:** Final commit (if any doc delta after manual pass):

```bash
git commit -m "chore(coach): QuickView final polish after manual E2E"
```

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Schema assumptions wrong (table/column names) | Task 0 pre-flight discovery memo — concrete names captured before any migration |
| RLS policy allows more than intended | Task 13 RLS tests cover 10 cases, failure blocks merge |
| RPC leaks sensitive fields in jsonb | RPC whitelists fields explicitly (no `SELECT *`) — review in Task 4 |
| Existing `SlotSessionSheet` too coupled to reuse | Task 12 extraction fallback: rebuild minimal drawer from scratch (~150 LOC) |
| Performance: briefing RPC > 300ms | Task 4 includes `EXPLAIN ANALYZE` check before commit; fall back to parallel sub-queries client-side if needed |
| Titulaire sees 2 attendance rows after substitute overwrite | Use UPSERT, not INSERT (Task 10); enforce unique `(session_id, athlete_id)` at DB level |

---

## Out of scope (reminder — do not implement)

- "Request access" CTA to titulaire
- Push notification to titulaire
- Activity badge on titulaire's fiche
- History of substitute viewers
- Mobile-specific layout (responsive native suffices)
- Creating a NEW slot (only attaching to existing empty slots)

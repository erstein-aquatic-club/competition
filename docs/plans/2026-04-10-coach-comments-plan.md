# Coach Comments Notification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a swimmer writes a text comment in their feedback, notify all coaches via push notification and display recent comments on the coach home page with a dedicated comments screen.

**Architecture:** A PostgreSQL trigger on `dim_sessions` INSERT/UPDATE (when `comments` is non-empty) creates a notification targeting all coaches, reusing the existing push pipeline. A new `coach_comment_reads` table tracks read state. A new `CoachCommentsScreen` component displays the full comments inbox, and the coach home page gets a compact "Commentaires" section showing the last 48h of unread comments.

**Tech Stack:** PostgreSQL triggers, Supabase RLS, React 19, React Query, Tailwind CSS 4, Lucide icons, Shadcn components.

**Design doc:** `docs/plans/2026-04-10-coach-comments-design.md`

---

### Task 1: Database Migration — Push Trigger + Read Tracking Table

**Files:**
- Create: `supabase/migrations/00072_coach_comment_notifications.sql`

**Step 1: Write the migration SQL**

This migration creates:
1. The `coach_comment_reads` table for tracking which comments a coach has seen
2. A trigger function `auto_notify_swimmer_comment()` on `dim_sessions` that fires on INSERT or UPDATE when `comments` changes to a non-empty value
3. The trigger itself

```sql
-- 00072_coach_comment_notifications.sql
-- Auto-notify coaches when a swimmer writes a text comment in their feedback.
-- Reuses the existing notifications → notification_targets → push-send pipeline.

-- ============================================================================
-- 1. COACH COMMENT READS — track which session comments a coach has read
-- ============================================================================

CREATE TABLE coach_comment_reads (
  coach_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id integer NOT NULL REFERENCES dim_sessions(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, session_id)
);

CREATE INDEX idx_coach_comment_reads_coach ON coach_comment_reads(coach_user_id);

-- RLS
ALTER TABLE coach_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can read own reads"
  ON coach_comment_reads FOR SELECT
  USING (coach_user_id IN (
    SELECT id FROM users WHERE auth_uid = auth.uid()
  ));

CREATE POLICY "Coaches can insert own reads"
  ON coach_comment_reads FOR INSERT
  WITH CHECK (coach_user_id IN (
    SELECT id FROM users WHERE auth_uid = auth.uid()
  ));

-- ============================================================================
-- 2. AUTO-NOTIFY COACHES ON SWIMMER COMMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_notify_swimmer_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  swimmer_name TEXT;
  comment_preview TEXT;
  notif_id INTEGER;
  coach RECORD;
BEGIN
  -- Only fire when comments is set to a non-empty value
  IF NEW.comments IS NULL OR trim(NEW.comments) = '' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if comments actually changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.comments IS NOT DISTINCT FROM NEW.comments THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Get swimmer display name
  swimmer_name := COALESCE(NEW.athlete_name, 'Nageur');

  -- Truncate comment to 100 chars for push body
  comment_preview := left(trim(NEW.comments), 100);
  IF length(trim(NEW.comments)) > 100 THEN
    comment_preview := comment_preview || '...';
  END IF;

  -- Create notification
  INSERT INTO notifications (title, body, type, metadata)
  VALUES (
    'Commentaire de ' || swimmer_name,
    comment_preview,
    'message',
    jsonb_build_object('url', '#/coach?section=comments', 'session_id', NEW.id)
  )
  RETURNING id INTO notif_id;

  -- Target all coaches
  FOR coach IN
    SELECT id FROM users WHERE role = 'coach'
  LOOP
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (notif_id, coach.id);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_notify_swimmer_comment
  AFTER INSERT OR UPDATE ON dim_sessions
  FOR EACH ROW
  EXECUTE FUNCTION auto_notify_swimmer_comment();
```

**Step 2: Apply migration via Supabase MCP**

Run: Use `mcp__plugin_supabase_supabase__apply_migration` with name `coach_comment_notifications` and the SQL above.

**Step 3: Verify migration applied**

Run: Use `mcp__plugin_supabase_supabase__list_migrations` and confirm `00072_coach_comment_notifications` appears.

**Step 4: Commit**

```bash
git add supabase/migrations/00072_coach_comment_notifications.sql
git commit -m "feat(db): add coach comment push trigger + coach_comment_reads table"
```

---

### Task 2: API Functions — Fetch Recent Comments + Mark Read

**Files:**
- Create: `src/lib/api/coach-comments.ts`
- Modify: `src/lib/api/index.ts` (add re-exports)
- Modify: `src/lib/api.ts` (add facade methods)

**Step 1: Create the coach-comments API module**

Create `src/lib/api/coach-comments.ts`:

```typescript
/**
 * API Coach Comments — fetch swimmer comments + mark as read
 */

import { supabase, canUseSupabase, safeInt } from './client';

export interface SwimmerComment {
  session_id: number;
  athlete_id: number | null;
  athlete_name: string;
  avatar_url: string | null;
  session_date: string;
  slot: string;
  comments: string;
  effort: number | null;
  feeling: number | null;
  performance: number | null;
  engagement: number | null;
  created_at: string;
  is_read: boolean;
}

/**
 * Fetch swimmer comments with read status for the current coach.
 * @param coachUserId - The coach's users.id
 * @param options.since - ISO date string, only return comments after this date (optional)
 * @param options.limit - Max results (default 20)
 * @param options.offset - Pagination offset (default 0)
 */
export async function getSwimmerComments(
  coachUserId: number,
  options?: { since?: string; limit?: number; offset?: number },
): Promise<{ comments: SwimmerComment[]; total: number }> {
  if (!canUseSupabase()) {
    return { comments: [], total: 0 };
  }

  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  // Query dim_sessions with non-empty comments, LEFT JOIN coach_comment_reads
  let query = supabase
    .from('dim_sessions')
    .select(`
      id,
      athlete_id,
      athlete_name,
      session_date,
      time_slot,
      comments,
      rpe,
      fatigue,
      performance,
      engagement,
      created_at
    `, { count: 'exact' })
    .not('comments', 'is', null)
    .neq('comments', '')
    .order('created_at', { ascending: false });

  if (options?.since) {
    query = query.gte('created_at', options.since);
  }

  const { data: sessions, count, error } = await query
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  // Fetch read status for this coach
  const sessionIds = (sessions ?? []).map((s: any) => s.id);
  let readSet = new Set<number>();
  if (sessionIds.length > 0) {
    const { data: reads } = await supabase
      .from('coach_comment_reads')
      .select('session_id')
      .eq('coach_user_id', coachUserId)
      .in('session_id', sessionIds);
    readSet = new Set((reads ?? []).map((r: any) => r.session_id));
  }

  // Fetch avatar URLs for athletes
  const athleteIds = [...new Set((sessions ?? []).map((s: any) => s.athlete_id).filter(Boolean))];
  let avatarMap = new Map<number, string | null>();
  if (athleteIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, avatar_url')
      .in('user_id', athleteIds);
    for (const p of profiles ?? []) {
      avatarMap.set(p.user_id, p.avatar_url);
    }
  }

  // Normalize scales from 1-10 (DB) to 1-5 (display)
  const normalize = (v: number | null): number | null => {
    if (v == null || !Number.isFinite(v)) return null;
    return Math.round((v + 5) / 2 * 10) / 10;
  };

  const comments: SwimmerComment[] = (sessions ?? []).map((s: any) => ({
    session_id: safeInt(s.id, 0),
    athlete_id: s.athlete_id ?? null,
    athlete_name: s.athlete_name ?? 'Nageur',
    avatar_url: avatarMap.get(s.athlete_id) ?? null,
    session_date: s.session_date,
    slot: s.time_slot ?? '',
    comments: s.comments,
    effort: normalize(s.rpe),
    feeling: normalize(s.fatigue),
    performance: normalize(s.performance),
    engagement: normalize(s.engagement),
    created_at: s.created_at,
    is_read: readSet.has(s.id),
  }));

  return { comments, total: count ?? 0 };
}

/**
 * Mark comments as read for a coach.
 */
export async function markCommentsRead(
  coachUserId: number,
  sessionIds: number[],
): Promise<void> {
  if (!canUseSupabase() || sessionIds.length === 0) return;

  const rows = sessionIds.map((sid) => ({
    coach_user_id: coachUserId,
    session_id: sid,
  }));

  const { error } = await supabase
    .from('coach_comment_reads')
    .upsert(rows, { onConflict: 'coach_user_id,session_id' });

  if (error) throw new Error(error.message);
}

/**
 * Count unread comments in the last 48h for badge display.
 */
export async function countUnreadComments48h(coachUserId: number): Promise<number> {
  if (!canUseSupabase()) return 0;

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { count: totalCount, error: totalError } = await supabase
    .from('dim_sessions')
    .select('id', { count: 'exact', head: true })
    .not('comments', 'is', null)
    .neq('comments', '')
    .gte('created_at', since);

  if (totalError) throw new Error(totalError.message);

  const { count: readCount, error: readError } = await supabase
    .from('coach_comment_reads')
    .select('session_id', { count: 'exact', head: true })
    .eq('coach_user_id', coachUserId);

  if (readError) throw new Error(readError.message);

  // Simple approximation — for accuracy we'd need a join,
  // but this is a badge count, not mission-critical
  // Better approach: count sessions NOT IN reads
  const { data: recentSessions } = await supabase
    .from('dim_sessions')
    .select('id')
    .not('comments', 'is', null)
    .neq('comments', '')
    .gte('created_at', since);

  const recentIds = (recentSessions ?? []).map((s: any) => s.id);
  if (recentIds.length === 0) return 0;

  const { data: reads } = await supabase
    .from('coach_comment_reads')
    .select('session_id')
    .eq('coach_user_id', coachUserId)
    .in('session_id', recentIds);

  const readSet = new Set((reads ?? []).map((r: any) => r.session_id));
  return recentIds.filter((id: number) => !readSet.has(id)).length;
}
```

**Step 2: Add re-exports in `src/lib/api/index.ts`**

Add at the end of the re-exports section:

```typescript
// Coach comments
export {
  getSwimmerComments,
  markCommentsRead,
  countUnreadComments48h,
  type SwimmerComment,
} from './coach-comments';
```

**Step 3: Add facade methods in `src/lib/api.ts`**

Import and wire the new functions into the `api` object. Find the existing method pattern and add:

```typescript
import {
  getSwimmerComments,
  markCommentsRead,
  countUnreadComments48h,
} from './api/coach-comments';

// Inside the api object:
getSwimmerComments,
markCommentsRead,
countUnreadComments48h,
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors (pre-existing errors may exist in stories/tests).

**Step 5: Commit**

```bash
git add src/lib/api/coach-comments.ts src/lib/api/index.ts src/lib/api.ts
git commit -m "feat(api): add coach-comments API (getSwimmerComments, markRead, countUnread)"
```

---

### Task 3: CoachCommentsScreen — Full Comments Inbox

**Files:**
- Create: `src/pages/coach/CoachCommentsScreen.tsx`

**Step 1: Create the comments screen component**

Use `/frontend-design` skill for the visual design, implementing the card pattern from the design doc:
- Border-left colored by worst indicator
- Avatar + name + relative time
- Session date + slot + 4 indicator badges (reuse `indicatorColor` pattern from `SwimmerFeedbackTab.tsx:23-29`)
- Full comment text
- Unread dot (violet)
- Click navigates to athlete detail (feedback tab)

The component receives these props:

```typescript
interface Props {
  onBack: () => void;
  onOpenAthlete: (athlete: { id: number | null; display_name: string }) => void;
}
```

Key behaviors:
- Uses `useQuery` with key `["coach-comments"]` to fetch via `api.getSwimmerComments(coachUserId)`
- On mount, marks visible comments as read via `api.markCommentsRead()` (mutation that invalidates the badge query)
- "Charger plus" button increments limit by 20
- Empty state: "Aucun commentaire de nageur" centered
- Header with back button + title "Commentaires" + unread badge count

**Step 2: Get coach user ID**

The coach's `users.id` is needed. Check how `useAuth` exposes it. The pattern used elsewhere:

```typescript
const { data: coachRow } = useQuery({
  queryKey: ["coach-user-id"],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("auth_uid", user.id)
      .single();
    return data?.id ?? null;
  },
  staleTime: Infinity,
});
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/pages/coach/CoachCommentsScreen.tsx
git commit -m "feat(coach): add CoachCommentsScreen inbox for swimmer comments"
```

---

### Task 4: Wire CoachCommentsScreen into Coach Router

**Files:**
- Modify: `src/pages/Coach.tsx`

**Step 1: Add "comments" to CoachSection type**

Change line 30:

```typescript
// Before:
type CoachSection = "home" | "week" | "swimmers" | "library" | "athlete" | "groups" | "competitions" | "comms" | "chrono";

// After:
type CoachSection = "home" | "week" | "swimmers" | "library" | "athlete" | "groups" | "competitions" | "comms" | "chrono" | "comments";
```

**Step 2: Add lazy import for CoachCommentsScreen**

After the other lazy imports (around line 26):

```typescript
const CoachCommentsScreen = lazy(() => import("./coach/CoachCommentsScreen"));
```

**Step 3: Add the section rendering block**

After the chrono section block (around line 714), add:

```typescript
{activeSection === "comments" ? (
  <Suspense fallback={<PageSkeleton />}>
    <CoachCommentsScreen
      onBack={() => setActiveSection("home")}
      onOpenAthlete={handleOpenAthlete}
    />
  </Suspense>
) : null}
```

**Step 4: Verify TypeScript compiles + dev server renders**

Run: `npx tsc --noEmit`
Run: `npm run dev` — navigate to `#/coach?section=comments` and verify the screen loads.

**Step 5: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach): wire CoachCommentsScreen into coach router (section=comments)"
```

---

### Task 5: Add Comments Badge Section to Coach Home

**Files:**
- Modify: `src/pages/Coach.tsx` (CoachHome component)

**Step 1: Add the badge query**

Inside `CoachHome`, add a query for recent comments count. We need the coach's `users.id`. Add:

```typescript
import { MessageSquareText } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Inside CoachHome:
const { data: coachUserId } = useQuery({
  queryKey: ["coach-user-id"],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("users").select("id").eq("auth_uid", user.id).single();
    return data?.id ?? null;
  },
  staleTime: Infinity,
});

const { data: recentComments } = useQuery({
  queryKey: ["coach-comments-recent-48h", coachUserId],
  queryFn: async () => {
    if (!coachUserId) return { comments: [], unreadCount: 0 };
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = await api.getSwimmerComments(coachUserId, { since, limit: 3 });
    const unreadCount = result.comments.filter((c) => !c.is_read).length;
    return { comments: result.comments.slice(0, 3), unreadCount };
  },
  enabled: !!coachUserId,
  staleTime: 2 * 60 * 1000,
});
```

**Step 2: Add the comments section in the JSX**

Between Section C (Alertes) and Section D (Accès rapides), add:

```tsx
{/* ── Section C-bis: Commentaires nageurs (48h) ── */}
{(recentComments?.comments?.length ?? 0) > 0 && (
  <section className="space-y-2.5">
    <SectionLabel>Commentaires</SectionLabel>

    <button
      type="button"
      onClick={() => onNavigate("comments")}
      className="w-full rounded-2xl border border-violet-200 bg-violet-50/70 p-3 text-left transition-colors active:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/25"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
            <MessageSquareText className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-violet-900 dark:text-violet-200">
            Commentaires nageurs
          </span>
        </div>
        {(recentComments?.unreadCount ?? 0) > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
            {recentComments!.unreadCount}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {recentComments!.comments.map((c) => (
          <div
            key={c.session_id}
            className="flex items-start gap-2 rounded-xl bg-white/70 dark:bg-black/20 px-3 py-2"
          >
            {!c.is_read && (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground truncate">
                  {c.athlete_name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatRelativeTime(c.created_at)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                {c.comments}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 text-center mt-2">
        Voir tous les commentaires
      </p>
    </button>
  </section>
)}
```

**Step 3: Add the `formatRelativeTime` helper**

Add this helper function near the top of the file (after the existing helpers):

```typescript
function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}
```

**Step 4: Pass `onNavigate` prop for "comments"**

Already works — `onNavigate` accepts any `CoachSection`, and we added `"comments"` to the type in Task 4.

**Step 5: Verify TypeScript compiles + visual check**

Run: `npx tsc --noEmit`
Run: `npm run dev` — verify the violet section appears on coach home when comments exist in last 48h.

**Step 6: Commit**

```bash
git add src/pages/Coach.tsx
git commit -m "feat(coach): add swimmer comments badge section on coach home (48h window)"
```

---

### Task 6: Auto-Mark Read on Comments Screen Open

**Files:**
- Modify: `src/pages/coach/CoachCommentsScreen.tsx`

**Step 1: Add mark-read side effect**

When the comments screen loads and displays comments, automatically mark visible ones as read:

```typescript
const queryClient = useQueryClient();

const markReadMutation = useMutation({
  mutationFn: (sessionIds: number[]) => api.markCommentsRead(coachUserId!, sessionIds),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["coach-comments-recent-48h"] });
  },
});

// After comments are loaded, mark unread ones as read
useEffect(() => {
  if (!coachUserId || !comments.length) return;
  const unreadIds = comments
    .filter((c) => !c.is_read)
    .map((c) => c.session_id);
  if (unreadIds.length > 0) {
    markReadMutation.mutate(unreadIds);
  }
}, [comments, coachUserId]);
```

**Step 2: Verify + Commit**

Run: `npx tsc --noEmit`

```bash
git add src/pages/coach/CoachCommentsScreen.tsx
git commit -m "feat(coach): auto-mark comments as read when comments screen is opened"
```

---

### Task 7: Update Documentation

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/FEATURES_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

**Step 1: Add implementation log entry**

Add a new section `§98 — Commentaires nageurs coach + push notification` in `docs/implementation-log.md` documenting:
- Context: swimmers can leave text feedback but coaches weren't notified
- Changes: DB trigger for auto-push, `coach_comment_reads` table, `CoachCommentsScreen`, badge on coach home
- Files modified/created
- Decisions: 48h window for home badge, violet color theme, reuse existing push pipeline

**Step 2: Update FEATURES_STATUS.md**

Add a row for "Commentaires nageurs → notification coach" with status ✅.

**Step 3: Update ROADMAP.md**

Add chantier #61 (or next number): "Commentaires nageurs sur home coach + push" — Statut: Fait (§98)

**Step 4: Update CLAUDE.md**

Add the new files to the "Fichiers clés" table:
- `src/lib/api/coach-comments.ts` — API commentaires nageurs (fetch, mark read, count)
- `src/pages/coach/CoachCommentsScreen.tsx` — Ecran inbox commentaires coach

Update the chantier table with the new entry.

**Step 5: Commit**

```bash
git add docs/implementation-log.md docs/FEATURES_STATUS.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs: add coach comments feature to implementation log, roadmap, and status"
```

---

## Task Dependency Graph

```
Task 1 (DB migration) ─────┐
                            ├──→ Task 2 (API functions) ──→ Task 3 (Comments Screen) ──→ Task 4 (Router wiring)
                            │                                                              │
                            │                                                              ├──→ Task 5 (Home badge)
                            │                                                              │
                            │                                                              ├──→ Task 6 (Auto mark read)
                            │                                                              │
                            └──────────────────────────────────────────────────────────────→ Task 7 (Documentation)
```

Tasks 5 and 6 can run in parallel after Task 4.

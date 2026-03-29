# Business Journey Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 13 validated business journey blockers across swimmer, coach, and admin personas.

**Architecture:** 4 parallel streams touching non-overlapping files. Each stream runs in an isolated worktree. UI components designed via /frontend-design for visual consistency.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Shadcn/Radix UI, React Query 5, Zustand 5, Supabase (PostgreSQL + Edge Functions + Workbox PWA), Vitest

---

## Stream 1 — Data Resilience (Points 1, 17)

### Task 1.1: Incremental workout save to localStorage

**Goal:** After each logged set in WorkoutRunner, persist the full run state to localStorage so a page refresh doesn't lose data.

**Files:**
- Modify: `src/hooks/useStrengthState.ts` — already persists `screenMode`, `session`, `runId`, `runLogs` to localStorage (lines 110-136). The mechanism EXISTS but only triggers on state changes from the parent. Need to ensure `activeRunLogs` is updated after EACH set log.
- Modify: `src/components/strength/WorkoutRunner.tsx` — after `setLogs(...)` (the internal log state update that happens when a set is completed), call `onLogSets(updatedLogs)` which propagates to parent → triggers localStorage save.
- Modify: `src/pages/Strength.tsx` — ensure the `onLogSets` callback updates `activeRunLogs` in state (which triggers useStrengthState's localStorage persist effect).

**Approach:**
1. In WorkoutRunner, find where `logs` state is updated after set completion. Ensure `onLogSets?.(newLogs)` is called there.
2. In Strength.tsx, the `onLogSets` handler should `setActiveRunLogs(newLogs)` — this triggers the useStrengthState effect at line 110-136 which persists to localStorage.
3. Add a recovery banner: on mount, if `useStrengthState` restores a focus session from localStorage, show a toast "Séance en cours récupérée" so the swimmer knows.
4. On SessionSummary close (line 712-718), clear localStorage via `clearActiveRunState()`.

**Verification:**
- `npx tsc --noEmit`
- Manual: Start a workout → log 2 sets → refresh page → verify session resumes with 2 sets logged

**Commit:** `feat(strength): persist workout logs incrementally to localStorage for crash recovery`

---

### Task 1.2: Offline mode — detection banner + stale-while-revalidate

**Goal:** Show a banner when offline, serve cached data for read-only, queue critical mutations.

**Files:**
- Create: `src/hooks/useOnlineStatus.ts` — hook using `navigator.onLine` + `online`/`offline` events
- Create: `src/components/shared/OfflineBanner.tsx` — fixed banner "Hors connexion — données en lecture seule"
- Modify: `src/components/layout/AppLayout.tsx` — render OfflineBanner above main content
- Modify: `vite.config.ts` — Workbox already configured (lines 17-57) with `NetworkFirst` for Supabase API (cacheName: 'supabase-api'). This already provides stale-while-revalidate. Adjust `networkTimeoutSeconds` from 10 to 5 for faster offline fallback.
- Create: `src/lib/offlineQueue.ts` — simple queue: `enqueue(mutation)` saves to localStorage `eac-offline-queue`, `flush()` replays when back online, `getQueueSize()` for badge display.
- Modify: `src/pages/Dashboard.tsx` — wrap `mutation.mutate()` (line 208) in offline check: if offline, enqueue instead of calling API, show toast "Séance sauvegardée hors-ligne, sera synchronisée au retour du réseau".

**Approach:**
1. useOnlineStatus hook: simple `useState(navigator.onLine)` + event listeners
2. OfflineBanner: fixed top bar, amber bg, auto-hides when online returns
3. offlineQueue: localStorage-backed array of `{ type: 'syncSession', payload: {...}, timestamp }`. On online event, flush queue sequentially.
4. Workbox config already handles caching — just reduce timeout for faster offline.

**Verification:**
- `npx tsc --noEmit`
- Manual: Go offline in DevTools → navigate app → verify banner appears and cached data loads
- Manual: Submit session offline → go online → verify sync happens

**Commits:**
- `feat: add useOnlineStatus hook and OfflineBanner component`
- `feat: add offline mutation queue with localStorage persistence`
- `feat: integrate offline banner and queue into Dashboard`

---

## Stream 2 — Auth & Admin (Points 3, 4, 5, 12)

### Task 2.1: Extend approval permissions to coach and comité

**Files:**
- Modify: `supabase/functions/admin-user/index.ts` — line 34-37, add `"approve_user"` and `"reject_user"` to ROLE_PERMISSIONS for `coach` and `comite`:
```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["create_coach", "update_role", "update_password", "disable_user", "approve_user", "reject_user"],
  coach: ["create_coach", "update_password", "approve_user", "reject_user"],
  comite: ["approve_user", "reject_user"],
};
```
- Add handlers `handleApproveUser` and `handleRejectUser` in the edge function (similar to existing patterns). `handleApproveUser` sets `is_approved=true`, `approved_by=callerId`, `approved_at=now()`. `handleRejectUser` deletes the user via auth.admin.deleteUser.
- Create migration: `supabase/migrations/NEXT_approve_permissions.sql` — no schema change needed (is_approved, approved_by, approved_at already exist)

**Commit:** `feat(auth): allow coach and comité to approve/reject new users`

### Task 2.2: PendingApprovals shared component + coach/comité integration

**Files:**
- Create: `src/components/shared/PendingApprovals.tsx` — extract from Admin.tsx the pending approvals list. Props: `{ compact?: boolean }`. Shows badge with count, list of pending users with Approve/Reject buttons.
- Modify: `src/pages/Admin.tsx` — replace inline pending approvals with `<PendingApprovals />`
- Modify: `src/pages/coach/Coach.tsx` — in the home section (around line 83), add `<PendingApprovals compact />` as a banner card if count > 0
- Modify: `src/pages/Comite.tsx` — add `<PendingApprovals />` section
- Modify: `src/lib/api/users.ts` — add `getPendingUsers()` function and `approveUser(userId)` / `rejectUser(userId)` that call the edge function

**Commit:** `feat(auth): add PendingApprovals component visible to coach/comité/admin`

### Task 2.3: "Awaiting approval" page for unapproved coaches

**Files:**
- Create: `src/pages/AwaitingApproval.tsx` — full-screen page with EAC logo, message, logout button. Use /frontend-design for the visual.
- Modify: `src/components/layout/AppLayout.tsx` — in the route guard, if `role === "coach" && !isApproved`, render `<AwaitingApproval />` instead of redirect to `/`

**Commit:** `feat(auth): show awaiting-approval page instead of silent redirect`

### Task 2.4: Add RecordsAdmin to admin navigation

**Files:**
- Modify: `src/components/layout/navItems.ts` — add entry for admin role: `{ label: "Records", path: "/records-admin", icon: Trophy }`

**Commit:** `fix(admin): add RecordsAdmin page to admin navigation`

### Task 2.5: Audit trail — migration + logging + UI

**Files:**
- Create: `supabase/migrations/NEXT_admin_audit_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES public.users(id),
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'change_role', 'disable', 'create_coach')),
  target_user_id INTEGER REFERENCES public.users(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created ON public.admin_audit_log(created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and coaches can view audit log" ON public.admin_audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text::int AND role IN ('admin', 'coach', 'comite'))
);
```
- Modify: `supabase/functions/admin-user/index.ts` — after each successful action, insert into `admin_audit_log`
- Create: `src/lib/api/audit.ts` — `getAuditLog(limit, offset)` query
- Modify: `src/pages/Admin.tsx` — add "Historique" tab with chronological list (actor name, action badge, target name, date)

**Commit:** `feat(admin): add audit trail for admin actions`

---

## Stream 3 — Coach UX (Points 7, 10, 16)

### Task 3.1: Planning Wizard for first-time setup

**Goal:** When a coach opens Planning tab for a swimmer with no cycles, no objectives, and no custom slots, show a guided 3-step wizard.

**Files:**
- Create: `src/components/coach/PlanningWizard.tsx` — 3-step wizard:
  - Step 1: Create macro-cycle (name, start/end dates, competition select)
  - Step 2: Create 1-3 objectives (chrono or text, simplified form)
  - Step 3: Customize slots (show group slots, toggle to personalize)
  - Final: "Terminer" button → calls all APIs sequentially → refreshes data → hides wizard
- Modify: `src/pages/coach/CoachSwimmerDetail.tsx` — in the Planning TabsContent (line 304-346), add detection logic:
```tsx
const showWizard = !cycles?.length && !objectives?.length && !hasCustomSlots;
```
  If `showWizard`, render `<PlanningWizard />` instead of the 3 collapsibles.
- Use /frontend-design for the wizard UI (stepper visual, transitions between steps).

**Dependencies:** Needs `api.createTrainingCycle`, `api.createObjective`, `api.initSwimmerSlots` — all already exist.

**Commits:**
- `feat(coach): add PlanningWizard component for first-time swimmer setup`
- `feat(coach): wire PlanningWizard into CoachSwimmerDetail Planning tab`

### Task 3.2: Notification history log

**Files:**
- Create: `supabase/migrations/NEXT_notification_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.notification_log (
  id BIGSERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES public.users(id),
  title TEXT NOT NULL,
  body TEXT,
  target_type TEXT NOT NULL CHECK (target_type IN ('group', 'user', 'all')),
  target_ids INTEGER[] DEFAULT '{}',
  recipient_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_log_sender ON public.notification_log(sender_id, created_at DESC);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches can view their notification history" ON public.notification_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text::int AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches can insert notification log" ON public.notification_log FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::text::int AND role IN ('admin', 'coach'))
);
```
- Modify: `src/lib/api/notifications.ts` — in the send function, after successful send, insert into `notification_log`
- Create: `src/lib/api/notificationLog.ts` — `getNotificationLog(limit, offset)` query
- Modify: `src/pages/coach/CoachComms.tsx` — add 3rd tab "Historique" showing chronological list (date, title, badge group/user, recipient count)

**Commits:**
- `feat(coach): add notification_log table migration`
- `feat(coach): log sent notifications and add history tab in CoachComms`

### Task 3.3: Coach notes on swimmer sessions

**Files:**
- Create: `supabase/migrations/NEXT_coach_notes.sql`:
```sql
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS coach_notes TEXT;
```
- Modify: `src/lib/api/swim.ts` — add `updateSessionCoachNotes(sessionId, notes)` function
- Modify: `src/pages/coach/SwimmerFeedbackTab.tsx` — add a "Note" button icon on each session row. On click → open Popover with Textarea + Save button → call `updateSessionCoachNotes`.
- Modify: `src/pages/Dashboard.tsx` — when rendering a session that has `coach_notes`, display a small card below with coach icon + text.

**Commits:**
- `feat: add coach_notes column to sessions table`
- `feat(coach): add coach notes popover in SwimmerFeedbackTab`
- `feat(dashboard): display coach notes on swimmer session cards`

---

## Stream 4 — Swimmer UX (Points 2, 6, 11, 15)

### Task 4.1: Exit button in focus mode

**Files:**
- Modify: `src/components/strength/WorkoutRunner.tsx` — add a sticky header bar at the top with "← Quitter" button. On click → show AlertDialog "Quitter la séance ? Votre progression est sauvegardée." → if confirmed, call `onExitFocus()` (prop already exists, line 148).
- Modify: `src/pages/Strength.tsx` — ensure `onExitFocus` sets `screenMode("list")` without clearing the run (so InProgressCard can resume it).

**Commit:** `feat(strength): add exit button with confirmation in focus mode`

### Task 4.2: 1RM fallback sheet before launch

**Files:**
- Create: `src/components/strength/OneRmGate.tsx` — sheet that lists exercises missing 1RM. For each: exercise name + input (kg). Two buttons: "Sauvegarder et continuer" (saves all 1RMs via `api.update1RM()` then launches focus) and "Passer en poids libre" (sets a flag to hide %1RM for this session, launches focus).
- Modify: `src/pages/Strength.tsx` — in `handleLaunchFocus`, before entering focus mode, check if any session items use `percent_1rm > 0` and the corresponding exercise has no 1RM in `oneRMs`. If so, show OneRmGate instead of launching directly.

**Commits:**
- `feat(strength): add OneRmGate sheet for missing 1RM before launch`
- `feat(strength): integrate OneRmGate into handleLaunchFocus flow`

### Task 4.3: Make swimmer objectives editable

**Files:**
- Modify: `src/components/profile/SwimmerObjectivesView.tsx` — the `openEdit` function already exists (line 127-139) and is wired to personal objectives via `onClick={() => openEdit(obj)}` (line 292). The form sheet handles both create and edit modes. Verify the `updateMutation` calls `api.updateObjective(editingObj.id, input)`.
- Check: `src/lib/api/objectives.ts` — `updateObjective` exists (line 44-53). ✅
- Check: The form sheet submit handler must branch on `editingObj !== null` to call update vs create.

**If already working:** This may already be functional. Read the submit handler to verify. If it works, just verify and commit a test.

**If NOT working:** Wire the submit handler to call `updateObjective` when `editingObj` is set.

**Commit:** `fix(objectives): ensure swimmer personal objectives are editable`

### Task 4.4: Distinguish empty slots vs no assignment in Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx` — currently shows 2 slots (AM/PM) per day. Need to cross-reference with `trainingSlots` data.
- Add query: `useQuery({ queryKey: ["my-training-slots"], queryFn: () => api.getTrainingSlotsForMyGroup() })` — or use existing slots data if available.
- In the day cell render:
  - If slot exists AND assignment exists → show session card (current behavior)
  - If slot exists BUT no assignment → show dashed card "Créneau prévu — pas de séance" in muted style
  - If no slot → show nothing (remove the empty placeholder)
- This requires knowing which group the swimmer belongs to, then fetching that group's training slots.

**Commit:** `feat(dashboard): distinguish slot-without-session from no-slot in calendar`

---

## Execution Order — Agent Teams

```
┌──────────────────────────────────────────────────────────────────┐
│ T0: All 4 streams start in parallel (separate worktrees)        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stream 1 (Sonnet)         Stream 2 (Sonnet)                    │
│  1.1 → 1.2                 2.1 → 2.2 → 2.3 → 2.4 → 2.5        │
│  ~40 min                   ~50 min                               │
│                                                                  │
│  Stream 3 (Sonnet)         Stream 4 (Sonnet)                    │
│  3.1 → 3.2 → 3.3          4.1 → 4.2 → 4.3 → 4.4              │
│  ~45 min                   ~35 min                               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ T1: Merge all streams into main                                 │
│ T2: Deploy edge function changes (supabase functions deploy)    │
│ T3: Apply migrations (supabase db push)                         │
│ T4: QA agent — tsc + vitest + dev server smoke test             │
└──────────────────────────────────────────────────────────────────┘
```

**Zero file conflicts:** Each stream touches completely independent files.

**Migration ordering:** Streams 2 and 3 create migrations. Number them sequentially at merge time.

**Edge function deploy:** Stream 2 modifies `admin-user`. Deploy after merge.

**UI/UX:** Tasks 2.3 (awaiting approval page), 3.1 (planning wizard), and 1.2 (offline banner) require /frontend-design invocation by the implementing agent.

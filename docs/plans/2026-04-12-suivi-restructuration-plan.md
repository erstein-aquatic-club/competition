# Suivi Restructuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the swimmer "Mon suivi" page from a tab-based layout into a rich hub with 3 drill-down sub-routes (Semaine, Saison, Progression).

**Architecture:** Hub page at `/#/suivi` with 3 preview cards navigating to `/#/suivi/semaine`, `/#/suivi/saison`, `/#/suivi/progression`. Each sub-route is a dedicated page with sticky header + back button. The existing `AthletePerformanceHub` standalone mode is replaced; coach mode is preserved unchanged.

**Tech Stack:** React 19, TypeScript, Wouter (hash routing), React Query 5, Tailwind CSS 4, Shadcn/Radix, Framer Motion

**Design doc:** `docs/plans/2026-04-12-suivi-restructuration-design.md`

---

### Task 1: Add sub-routes in App.tsx

**Files:**
- Modify: `src/App.tsx:102-103` (lazy imports) and `src/App.tsx:303` (route)

**Step 1: Add lazy imports for new pages**

After line 102 (`const Suivi = ...`), add:

```tsx
const SuiviSemaine = lazyWithRetry(() => import("@/pages/SuiviSemaine"));
const SuiviSaison = lazyWithRetry(() => import("@/pages/SuiviSaison"));
const SuiviProgression = lazyWithRetry(() => import("@/pages/SuiviProgression"));
```

**Step 2: Add routes before the `/suivi` route**

In the `<Switch>` block, replace the single `/suivi` route (line 303) with:

```tsx
<Route path="/suivi/semaine" component={SuiviSemaine} />
<Route path="/suivi/saison" component={SuiviSaison} />
<Route path="/suivi/progression" component={SuiviProgression} />
<Route path="/suivi" component={Suivi} />
```

Order matters: Wouter matches first match, so sub-routes must come before the parent.

**Step 3: Update the `/progress` redirect**

Change line 286 from:
```tsx
<Route path="/progress">{() => { window.location.hash = "#/suivi?tab=progression"; return null; }}</Route>
```
to:
```tsx
<Route path="/progress">{() => { window.location.hash = "#/suivi/progression"; return null; }}</Route>
```

**Step 4: Update notification routing**

In `src/lib/notificationRouting.ts`, update references:
- `/suivi?tab=entretiens` → `/suivi/saison`
- `/suivi?tab=objectifs` → `/suivi/saison`

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: May fail (new pages don't exist yet). That's ok — they're created in tasks 2-5.

**Step 6: Commit**

```bash
git add src/App.tsx src/lib/notificationRouting.ts
git commit -m "feat(suivi): add sub-routes for semaine/saison/progression drill-down"
```

---

### Task 2: Create SuiviProgression page (simplest, validates routing)

**Files:**
- Create: `src/pages/SuiviProgression.tsx`

**Step 1: Create the page**

```tsx
import { lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const LazyProgressContent = lazy(() =>
  import("@/pages/Progress").then((mod) => ({ default: mod.ProgressContent }))
);

export default function SuiviProgression() {
  const [, navigate] = useLocation();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg pb-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 mb-1 text-xs"
          onClick={() => navigate("/suivi")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Mon suivi
        </Button>
        <PageHeader
          title="Ma progression"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
      </div>
      <div className="pt-2">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-12 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          }
        >
          <LazyProgressContent />
        </Suspense>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS (or pre-existing errors only)

**Step 3: Test in browser**

Run: `npm run dev`
Navigate to `/#/suivi/progression` — should show Progress content with back button.

**Step 4: Commit**

```bash
git add src/pages/SuiviProgression.tsx
git commit -m "feat(suivi): add SuiviProgression drill-down page"
```

---

### Task 3: Create SuiviSemaine page (weekly timeline with missed sessions)

**Files:**
- Create: `src/pages/SuiviSemaine.tsx`

This is the view that mixes logged feedback and missed sessions, with FeedbackDrawer integration and absence signaling.

**Step 1: Create the page**

Key data flow:
1. Get current week's Monday from state (navigable with ◀ ▶)
2. Fetch `swimmerSlots` for the athlete → gives expected sessions per day-of-week
3. Call `resolveSwimmerAssignmentsBatch(userId, weekDates)` → gives assignments per date
4. Fetch `sessions` (ressentis) for the athlete → filter to current week
5. Fetch `plannedAbsences` for the athlete → filter to current week
6. Fetch today's wellness via `getWellnessForDate`
7. Merge into a unified list: for each slot on each day, determine if it's logged/missed/absent
8. Render grouped by day

The component needs:
- `WeekNavigator` inline (◀ dates ▶)
- Wellness CTA banner (if not logged today)
- Day groups with `SessionCard` items
- FeedbackDrawer integration (opened with `PlannedSession` pre-filled)
- Absence signaling (tap → `setPlannedAbsence(date, reason)` → toast)

**Important types from existing code:**

```tsx
// From FeedbackDrawer.tsx
type PlannedSession = {
  id: string;
  iso: string;
  slotKey: "AM" | "PM";
  title: string;
  km: number | null;
  details: string[];
  assignmentId?: number;
  isEmpty: boolean;
  slotTime?: string;
  slotLocation?: string;
  assignmentSource?: 'individual' | 'subgroup' | 'group' | 'none';
  alternatives?: Array<{ assignmentId: number; title: string; km: number | null; subgroupName: string }>;
  swimmerSlotId?: string;
};
```

The page should be a single file ~300-400 lines. Key sections:
- Helper: `getWeekDates(mondayIso: string): string[]` → 7 ISO date strings
- Helper: `getMondayOfWeek(date: Date): string` → ISO string of Monday
- Helper: `classifySlot(...)` → 'logged' | 'missed' | 'absent'
- Component: inline day separator with day name + date
- Component: logged session card (reuse indicator colors from SwimmerFeedbackTab)
- Component: missed session card (dashed border, "Saisir" tap opens FeedbackDrawer, "Absent" button)
- Component: absent session card (compact, muted, with undo button)

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Test in browser**

Navigate to `/#/suivi/semaine`:
- Verify week navigation works
- Verify logged sessions show with colored indicators
- Verify missed sessions show with dashed border
- Verify tap on missed session opens FeedbackDrawer
- Verify "Absent" button marks absence with toast
- Verify absent card shows with undo button

**Step 4: Commit**

```bash
git add src/pages/SuiviSemaine.tsx
git commit -m "feat(suivi): add SuiviSemaine with mixed feedback/missed sessions timeline"
```

---

### Task 4: Create SuiviSaison page (unified season timeline)

**Files:**
- Create: `src/pages/SuiviSaison.tsx`

This is the most complex view. It combines cycles, weeks, competitions, interviews, and objectives into a single chronological timeline.

**Step 1: Create the page**

Key data flow:
1. Fetch objectives via `getObjectives()`
2. Fetch training cycles via `getTrainingCycles({ athleteId })`
3. For each cycle, fetch training weeks via `getTrainingWeeks(cycleId)`
4. Fetch competitions via `getCompetitions()` + `getMyCompetitionIds(athleteId)`
5. Fetch interviews via `getMyInterviews()` (athlete's own)
6. Fetch swimmer slots via `getSwimmerSlots(athleteId)`
7. Build a unified timeline: merge all items sorted chronologically
8. Group weeks under their parent cycle

The page structure:
- Sticky header with back button + "Ma saison" + J-X badge
- Objectives section (horizontal scroll of ObjectiveCard compacts)
- Timeline section with 3 item types:
  - **CycleWeekCard**: week row with colored rail, summary, expandable to day view
  - **CompetitionEventCard**: gradient primary card with name, date, J-X, link
  - **InterviewEventCard**: bordered card with status, "À compléter" badge if needed

For the week expand (day view), reuse the swimmer slots + resolved assignments to show each day's planned sessions (natation + muscu).

**Architecture notes:**
- Reuse `weekTypeColor()` and `weekTypeTextColor()` from `src/lib/weekTypeColor.ts`
- Reuse `ObjectiveCard` from `src/components/shared/ObjectiveCard.tsx`
- Reuse `AthleteSeasonPlanning` logic (cycles, weeks, competitions) but restructure the rendering
- The day-expand view resolves slots for each day of the week using `resolveSwimmerAssignmentsBatch`

The page should be ~500-600 lines. Key sub-components (inline):
- `ObjectivesStrip`: horizontal scroll of compact ObjectiveCards
- `CycleHeader`: cycle name + progress badge
- `WeekRow`: compact week with rail + summary + chevron
- `WeekDayExpand`: expanded day view with slot cards
- `CompetitionEvent`: intercalated competition card
- `InterviewEvent`: intercalated interview card

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Test in browser**

Navigate to `/#/suivi/saison`:
- Verify objectives strip shows at top with horizontal scroll
- Verify cycles display with colored week rails
- Verify week expand shows day-by-day slots
- Verify competitions intercalate at correct chronological position
- Verify interviews intercalate with status badges
- Verify J-X badge in header shows next competition countdown

**Step 4: Commit**

```bash
git add src/pages/SuiviSaison.tsx
git commit -m "feat(suivi): add SuiviSaison with unified natation/muscu timeline"
```

---

### Task 5: Redesign Suivi hub page with rich preview cards

**Files:**
- Modify: `src/pages/Suivi.tsx` (rewrite)

**Step 1: Rewrite Suivi.tsx as hub**

Replace the current `AthletePerformanceHub` embedding with 3 rich preview cards.

Key data fetched at hub level:
1. Profile + groups (existing)
2. Sessions (ressentis) for current week → count logged vs expected
3. Swimmer slots → count expected sessions this week
4. Wellness for today → show readiness or CTA
5. Training cycles → current cycle progress
6. Competitions → next competition J-X
7. Objectives → count + achieved
8. Interviews → next upcoming

Each card is a `<button>` or `<Link>` that navigates to the sub-route.

**Card "Ma semaine":**
- Header: Calendar icon + "Ma semaine" + badge "X/Y séances"
- Body: last 2-3 sessions with indicator dots, warning if missing feedback
- Tap → `navigate("/suivi/semaine")`

**Card "Ma saison":**
- Header: Map icon + "Ma saison" + badge "J-X" next competition
- Body: current cycle progress bar, frequency summary, next interview
- Tap → `navigate("/suivi/saison")`

**Card "Ma progression":**
- Header: TrendingUp icon + "Ma progression"
- Body: readiness summary, volume totals (distance + tonnage)
- Tap → `navigate("/suivi/progression")`

The page should be ~250-350 lines.

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Test in browser**

Navigate to `/#/suivi`:
- Verify 3 cards display with relevant KPIs
- Verify tap on each card navigates to correct sub-route
- Verify back buttons work from each sub-route
- Verify deep links work (`/#/suivi/saison` directly)

**Step 4: Commit**

```bash
git add src/pages/Suivi.tsx
git commit -m "feat(suivi): redesign hub page with rich preview cards"
```

---

### Task 6: Clean up AthletePerformanceHub standalone mode

**Files:**
- Modify: `src/components/profile/AthletePerformanceHub.tsx`

**Step 1: Remove standalone mode**

The `standalone` prop and its associated 3-tab layout are no longer needed. The hub and sub-routes handle this. Keep the coach-facing 4-tab layout intact.

- Remove the `standalone` prop from the `Props` interface
- Remove `resolveStandaloneTab()` function
- Remove the `{standalone ? (...) : (...)}` ternary — keep only the coach branch
- Remove the `{standalone && <SwimmerObjectivesView embedded />}` line
- Remove the standalone-specific header logic
- Clean up unused imports (`Calendar`, `MapIcon`, `TrendingUp`, `LazyProgressContent` etc.)

**Step 2: Update coach usage**

Check `src/pages/coach/CoachSwimmerDetail.tsx` still works — it uses `AthletePerformanceHub` in non-standalone mode. No changes needed there.

**Step 3: Verify build**

Run: `npx tsc --noEmit`

**Step 4: Test in browser**

- Navigate to a coach swimmer detail page — verify the 4-tab hub still works
- Navigate to `/#/suivi` — verify the new hub renders (not the old tabs)

**Step 5: Commit**

```bash
git add src/components/profile/AthletePerformanceHub.tsx
git commit -m "refactor(suivi): remove standalone mode from AthletePerformanceHub"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `CLAUDE.md` — update Suivi entry in fichiers clés
- Modify: `docs/FEATURES_STATUS.md` — update Suivi feature status
- Modify: `docs/implementation-log.md` — add implementation entry
- Modify: `docs/ROADMAP.md` — add/update chantier entry

**Step 1: Update CLAUDE.md**

Add new files to the "Fichiers clés" table:
```
| `src/pages/SuiviSemaine.tsx` | Vue semaine drill-down (ressentis + séances manquées) | ~350 lignes |
| `src/pages/SuiviSaison.tsx` | Vue saison drill-down (timeline unifiée natation/muscu) | ~550 lignes |
| `src/pages/SuiviProgression.tsx` | Vue progression drill-down (wrapper Progress) | ~50 lignes |
```

Update the existing Suivi.tsx entry:
```
| `src/pages/Suivi.tsx` | Hub Mon suivi (3 cartes aperçu → drill-down) | ~300 lignes |
```

**Step 2: Update docs/FEATURES_STATUS.md**

Update the Suivi feature entry to reflect the new hub + drill-down architecture.

**Step 3: Add implementation-log.md entry**

Add a new section documenting:
- Context: restructuration from tabs to hub + drill-down
- Changes: new pages, modified routing, removed standalone mode
- Files modified/created
- Design decisions

**Step 4: Update docs/ROADMAP.md**

Add chantier 67 (or next available number):
```
| 67 | Restructuration vue "Mon suivi" (hub + drill-down) | Haute | Fait (§103) |
```

**Step 5: Commit**

```bash
git add CLAUDE.md docs/FEATURES_STATUS.md docs/implementation-log.md docs/ROADMAP.md
git commit -m "docs: update documentation for Suivi restructuration (§103)"
```

---

## Execution Order & Dependencies

```
Task 1 (routes) ─────────────────────────────────┐
Task 2 (SuiviProgression) ── depends on Task 1   │
Task 3 (SuiviSemaine) ── depends on Task 1       │── can run 2,3,4 in parallel after 1
Task 4 (SuiviSaison) ── depends on Task 1        │
Task 5 (Hub redesign) ── depends on Tasks 2,3,4 ─┘
Task 6 (Cleanup) ── depends on Task 5
Task 7 (Docs) ── depends on Task 6
```

Tasks 2, 3, 4 are independent and can be parallelized after Task 1.

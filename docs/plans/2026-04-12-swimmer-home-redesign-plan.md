# Swimmer Home Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a new Home page for swimmers, reorganize the bottom dock navigation (5 tabs: Natation/Muscu/Home/Suivi/Profil), migrate wellness from Dashboard to Home, integrate Progress into Suivi, and lighten Profile.

**Architecture:** The new Home page (`src/pages/SwimmerHome.tsx`) is a scrollable page with 6 sections (wellness, today's sessions, next competition, coach messages, quick access). The dock in `navItems.ts` is reordered. Dashboard becomes Natation (route `/natation`). Suivi gets a 3rd tab "Progression" absorbing Progress. Profile loses its quick-access grid and messages card.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Wouter (hash routing), React Query 5, Zustand, existing Shadcn components.

**Design doc:** `docs/plans/2026-04-12-swimmer-home-redesign-design.md`

---

### Task 1: Update dock navigation (navItems.ts)

**Files:**
- Modify: `src/components/layout/navItems.ts:39-52`

**Step 1: Update athlete nav items**

Change the athlete section of `getNavItemsForRole` to the new 5-tab structure:

```ts
const athleteItems: NavItem[] = [
  { href: "/natation", icon: Waves, label: "Natation" },
];

if (FEATURES.strength) {
  athleteItems.push({ href: "/strength", icon: Dumbbell, label: "Muscu" });
}

athleteItems.push({ href: "/", icon: Home, label: "Home" });
athleteItems.push({ href: "/suivi", icon: Target, label: "Suivi" });
athleteItems.push({ href: "/profile", icon: User, label: "Profil" });
```

Note: `Home` icon is already imported at line 1. Order is Natation / Muscu / Home (centre) / Suivi / Profil.

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors

**Step 3: Commit**

```
feat(nav): reorganize swimmer dock — Natation/Muscu/Home/Suivi/Profil
```

---

### Task 2: Update routing in App.tsx

**Files:**
- Modify: `src/App.tsx:92-304`

**Step 1: Add SwimmerHome lazy import**

After the existing lazy imports (~line 114), add:

```ts
const SwimmerHome = lazyWithRetry(() => import("@/pages/SwimmerHome"));
```

**Step 2: Update routes in AppRouter**

Change the routes section:

- Route `/` for athletes now renders `<SwimmerHome />` instead of `<Dashboard />`
- Add route `/natation` pointing to `<Dashboard />`
- Route `/progress` becomes a redirect to `/suivi?tab=progression`

Replace line 283:
```ts
<Route path="/">{role === "coach" || role === "admin" ? <Redirect to="/coach" /> : <SwimmerHome />}</Route>
```

Add after the `/` route:
```ts
<Route path="/natation" component={Dashboard} />
```

Replace line 284 (`/progress` route):
```ts
<Route path="/progress">{() => { window.location.hash = "#/suivi?tab=progression"; return null; }}</Route>
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: error about missing `SwimmerHome` module (expected — we create it in Task 3)

**Step 4: Commit**

```
feat(routing): add /natation route, SwimmerHome at /, redirect /progress
```

---

### Task 3: Create SwimmerHome page — scaffold + header

**Files:**
- Create: `src/pages/SwimmerHome.tsx`

**Step 1: Create the page with Section A (header)**

```tsx
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function SwimmerHome() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [, navigate] = useLocation();

  const { data: profile } = useQuery({
    queryKey: ["profile", user, userId],
    queryFn: () => api.getProfile({ displayName: user, userId }),
    enabled: !!user,
  });

  const firstName = (profile?.display_name || user || "").split(" ")[0];
  const today = format(new Date(), "EEEE d MMMM", { locale: fr });

  return (
    <div className="mx-auto max-w-lg px-4 pb-24">
      {/* Section A — Header */}
      <div className="flex items-center justify-between pt-4 pb-3">
        <div>
          <h1 className="text-xl font-semibold">Bonjour {firstName}</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </div>
        <button onClick={() => navigate("/profile")} className="shrink-0">
          <Avatar className="h-8 w-8 ring-2 ring-primary/20">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {firstName?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>

      {/* Sections B-F added in subsequent tasks */}
    </div>
  );
}
```

**Step 2: Verify build + dev server**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run dev` and open `http://localhost:8080/#/` — should see "Bonjour {prénom}" header.

**Step 3: Commit**

```
feat(home): create SwimmerHome page with greeting header
```

---

### Task 4: SwimmerHome — Section B (Wellness)

**Files:**
- Modify: `src/pages/SwimmerHome.tsx`
- Reference: `src/components/wellness/WellnessBanner.tsx`, `src/components/wellness/WellnessForm.tsx`

**Step 1: Add wellness section**

Import the existing WellnessBanner and WellnessForm components. Add state for the wellness sheet. Render the WellnessBanner below the header, and the WellnessForm in a Sheet.

The WellnessBanner already handles both states (filled/not filled) and the ReadinessGauge. We reuse it as-is.

Check `WellnessBanner.tsx` props to understand the interface, then integrate:

```tsx
import { WellnessBanner } from "@/components/wellness/WellnessBanner";
import { WellnessForm } from "@/components/wellness/WellnessForm";
```

Add inside the component after the header:
```tsx
{/* Section B — Wellness du jour */}
<WellnessBanner
  userId={userId ?? 0}
  onOpenForm={() => setWellnessOpen(true)}
/>
{wellnessOpen && (
  <WellnessForm
    userId={userId ?? 0}
    open={wellnessOpen}
    onClose={() => setWellnessOpen(false)}
  />
)}
```

Add state: `const [wellnessOpen, setWellnessOpen] = useState(false);`

Note: Check the actual WellnessBanner/WellnessForm prop signatures by reading the files. Adapt as needed.

**Step 2: Auto-open wellness via deep link**

Check if `?wellness=open` is in the hash and auto-open:

```tsx
useEffect(() => {
  const hash = window.location.hash;
  if (hash.includes("wellness=open")) {
    setWellnessOpen(true);
    // Clean the URL
    window.location.hash = "#/";
  }
}, []);
```

**Step 3: Verify in browser**

Open `http://localhost:8080/#/` — wellness banner should appear. If not yet filled today, the CTA "Remplir" should be visible.

**Step 4: Commit**

```
feat(home): add wellness section with WellnessBanner + WellnessForm
```

---

### Task 5: SwimmerHome — Section C (Today's sessions)

**Files:**
- Modify: `src/pages/SwimmerHome.tsx`
- Reference: `src/pages/Dashboard.tsx` (session/assignment fetching logic), `src/components/dashboard/FeedbackDrawer.tsx`

**Step 1: Add today's sessions data fetching**

Study how Dashboard.tsx fetches assignments and sessions for the current day:
- `api.getAssignments(...)` for the current month
- `api.getSessions(userId, ...)` for existing logs
- Swimmer slots from `api.getSwimmerSlots(userId)`

Extract the minimum needed for today only. Fetch:
- Assignments for today's date
- Sessions for today's date
- Swimmer slots for today's weekday

**Step 2: Render session cards**

For each slot (AM/PM or swimmer-slot), render a compact card:
- Slot label (Matin/Soir) + type icon (Waves for nage, Dumbbell for muscu)
- Session title from assignment (or "Entraînement libre")
- Distance prévue (if available from assignment)
- Status indicator: green check (logged), orange clock (pending), grey (off)
- Tap handler opens FeedbackDrawer

If no sessions today: render "Jour de repos" message.

**Step 3: Integrate FeedbackDrawer**

Import FeedbackDrawer from `@/components/dashboard/FeedbackDrawer`. It needs:
- `selectedDate`, `selectedSlot` (or equivalent)
- Session data, assignment data
- Save/update callbacks

The exact props depend on the current FeedbackDrawer interface. Read it and wire up.

**Step 4: Verify in browser**

Open Home — today's sessions should appear. Tap one → FeedbackDrawer should open.

**Step 5: Commit**

```
feat(home): add today's sessions section with FeedbackDrawer integration
```

---

### Task 6: SwimmerHome — Section D (Next competition)

**Files:**
- Modify: `src/pages/SwimmerHome.tsx`

**Step 1: Fetch upcoming competitions**

Use the same pattern as Dashboard/Progress:

```tsx
const { data: competitions = [] } = useQuery({
  queryKey: ["competitions-swimmer", userId],
  queryFn: () => api.getSwimmerCompetitions(userId!),
  enabled: !!userId,
});
```

Filter to next 30 days, pick the nearest one.

**Step 2: Render competition card**

If a competition is found:
- Card with competition name, location
- "J-X" badge (countdown days)
- Checklist progress: fetch `api.getCompetitionChecklist(compId)` → "X/Y"
- Race count from `api.getCompetitionRaces(compId)`
- Tap → `navigate(\`/competition/${comp.id}\`)`

If no competition within 30 days: don't render the section.

**Step 3: Verify in browser**

Check with a test user who has an upcoming competition.

**Step 4: Commit**

```
feat(home): add next competition section with countdown and progress
```

---

### Task 7: SwimmerHome — Section E (Coach messages) + Section F (Quick access)

**Files:**
- Modify: `src/pages/SwimmerHome.tsx`

**Step 1: Add coach messages section**

```tsx
const { data: notifications = [] } = useQuery({
  queryKey: ["notifications", userId],
  queryFn: () => api.notifications_list(userId!),
  enabled: !!userId,
});
const unreadCount = notifications.filter((n) => !n.read_at).length;
const latestUnread = notifications.find((n) => !n.read_at);
```

Render conditionally (only if `unreadCount > 0`):
- Card with violet/indigo theme
- Badge "X nouveaux"
- Latest message preview (1 line, truncated)
- Tap → `navigate("/profile?section=messages")` (keep existing messages view for now)

**Step 2: Add quick access grid**

4-column grid with 4 tiles:

```tsx
const quickLinks = [
  { icon: Trophy, label: "Records", href: "/records" },
  { icon: Crown, label: "Club", href: "/hall-of-fame" },
  { icon: FileText, label: "Notes", href: "/swim-notes" },
  { icon: BarChart3, label: "Rapport", href: `/report/${userId}/${format(new Date(), "yyyy-MM")}` },
];
```

Each tile: icon in a colored circle + label below. Tap navigates.

**Step 3: Verify in browser**

Check messages appear when unread. Check all 4 quick-access tiles navigate correctly.

**Step 4: Commit**

```
feat(home): add coach messages + quick access grid sections
```

---

### Task 8: Remove wellness from Dashboard (Natation)

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Step 1: Remove WellnessBanner and WellnessForm**

- Remove imports of `WellnessBanner` and `WellnessForm`
- Remove the `wellnessOpen` state and related handlers
- Remove the `<WellnessBanner>` and `<WellnessForm>` JSX from the render
- Keep everything else (CalendarHeader, CalendarGrid, FeedbackDrawer, challenges, etc.)

**Step 2: Update header**

Change the header from "Accueil" to "Natation" (or keep "Accueil" if preferred — check with the Waves icon context).

**Step 3: Verify in browser**

Navigate to `/#/natation` — calendar should work normally without the wellness banner.

**Step 4: Commit**

```
refactor(natation): remove wellness from Dashboard (migrated to Home)
```

---

### Task 9: Lighten Profile page

**Files:**
- Modify: `src/pages/Profile.tsx`

**Step 1: Remove quick-access grid and messages card from Profile home**

In the Profile component's "home" section:
- Remove the "Accès rapides" 2-column grid (Records, Mon suivi, Club, Rapport mensuel tiles)
- Remove the "Maintenant" messages card
- Keep: Hero (avatar, name, role, group), Badges grid, Neurotype, "Mon compte" section, Logout

**Step 2: Keep Messages section accessible**

The `SwimmerMessagesView` internal section (`activeSection === "messages"`) should stay functional for now. The Home links to `profile?section=messages`. This ensures backward compatibility.

**Step 3: Verify in browser**

Navigate to `/#/profile` — should show avatar, badges, neurotype, account settings. No more quick-access grid.

**Step 4: Commit**

```
refactor(profile): remove quick-access grid and messages card (moved to Home)
```

---

### Task 10: Integrate Progress into Suivi as "Progression" tab

**Files:**
- Modify: `src/pages/Suivi.tsx`
- Modify: `src/components/profile/AthletePerformanceHub.tsx` (or create wrapper)
- Reference: `src/pages/Progress.tsx`

**Step 1: Study AthletePerformanceHub tabs**

Read `src/components/profile/AthletePerformanceHub.tsx` to understand how tabs are defined. The current tabs are likely: Ressentis, Entretiens, Planif.

**Step 2: Rename tabs to 3 horizons**

Update tab labels:
- "Ressentis" → "Semaine" (same content for V1)
- Group "Entretiens" + "Planif" → "Saison" (merge into one tab)
- Add "Progression" tab → lazy-load the Progress page content

**Step 3: Embed Progress content**

Extract the main content of `Progress.tsx` into a reusable component (e.g., `ProgressContent`) that can be rendered inside the Suivi tab. Or import the Progress component directly and render it within the tab panel.

**Step 4: Update tab URL mapping**

Ensure `?tab=progression` activates the new Progression tab. Update `readTabFromHash()` in Suivi.tsx and any tab-to-URL sync logic.

**Step 5: Verify in browser**

- `/#/suivi` → default tab "Semaine" with ressentis
- `/#/suivi?tab=saison` → entretiens + planif content
- `/#/suivi?tab=progression` → full Progress stats
- `/#/progress` → redirects to `/#/suivi?tab=progression`

**Step 6: Commit**

```
feat(suivi): add 3-horizon tabs (Semaine/Saison/Progression) absorbing Progress
```

---

### Task 11: Frontend design pass — SwimmerHome styling

**Files:**
- Modify: `src/pages/SwimmerHome.tsx`

> **REQUIRED:** Use the `/frontend-design` skill for this task.

**Step 1: Apply the frontend-design skill to SwimmerHome**

The page needs a cohesive, polished aesthetic that feels native and app-like:
- Wellness card: soft gradient background (blue-to-cyan when not filled, green tint when filled)
- Session cards: subtle elevation, colored left border (blue for nage, amber for muscu), status badges
- Competition card: warm amber/gold tones, bold J-X countdown
- Messages card: violet/indigo theme matching coach color
- Quick access: rounded icon circles with muted color tints, small labels
- Smooth stagger animations on section mount (framer-motion fadeIn/slideUp)
- Dark mode support throughout

**Step 2: Verify in browser (light + dark mode)**

Test both themes. Ensure all sections look polished on mobile (375px width).

**Step 3: Commit**

```
style(home): polish SwimmerHome with cohesive mobile-first design
```

---

### Task 12: Final verification + documentation

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `docs/FEATURES_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

**Step 1: Full navigation test**

Verify all routes work:
- `/#/` → SwimmerHome
- `/#/natation` → Calendar (ex-Dashboard)
- `/#/strength` → Muscu
- `/#/suivi` → Suivi with 3 tabs
- `/#/suivi?tab=progression` → Progress content
- `/#/progress` → redirects to suivi?tab=progression
- `/#/profile` → Lightened Profile
- `/#/profile?section=messages` → Messages still work
- `?wellness=open` → Home with wellness form open
- All quick-access links work

**Step 2: Run tests**

Run: `npm test`
Expected: existing tests pass (some may need route updates)

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Update documentation**

- `docs/implementation-log.md` — add entry for this refonte
- `docs/ROADMAP.md` — mark chantier as "Fait"
- `docs/FEATURES_STATUS.md` — update swimmer Home status
- `CLAUDE.md` — add SwimmerHome.tsx to key files table

**Step 5: Commit**

```
docs: update implementation log, roadmap, and features status for swimmer home redesign
```

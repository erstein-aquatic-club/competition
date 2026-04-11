# Admin = Coach Masterview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make admin use the coach interface as primary view, with admin-only pages accessible from Profile.

**Architecture:** 4 small, independent changes: nav items, home redirect, Profile admin links, coach filter dropdown. No new API endpoints needed — `getAllAssignments()` and coaches query already exist.

**Tech Stack:** React, TypeScript, Wouter, Tanstack Query, Shadcn/Radix UI

---

### Task 1: Admin nav items → coach nav items

**Files:**
- Modify: `src/components/layout/navItems.ts:12-18`

**Step 1: Update admin nav items**

Replace the admin block (lines 12-18) to return the same 5 items as coach:

```typescript
if (normalizedRole === "admin") {
  return [
    { href: "/coach?section=week", icon: CalendarDays, label: "Semaine" },
    { href: "/coach?section=swimmers", icon: Users, label: "Nageurs" },
    { href: "/coach?section=library", icon: Library, label: "Biblio" },
    { href: "/coach", icon: Home, label: "Home" },
    { href: "/coach?section=chrono", icon: Timer, label: "Chrono" },
  ];
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/components/layout/navItems.ts
git commit -m "feat(admin): use coach nav items for admin role"
```

---

### Task 2: Admin home redirect → `/coach`

**Files:**
- Modify: `src/App.tsx:283`

**Step 1: Update home route redirect**

Change line 283 from:
```tsx
<Route path="/">{role === "coach" ? <Redirect to="/coach" /> : <Dashboard />}</Route>
```
to:
```tsx
<Route path="/">{role === "coach" || role === "admin" ? <Redirect to="/coach" /> : <Dashboard />}</Route>
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(admin): redirect admin home to coach dashboard"
```

---

### Task 3: Add admin links in Profile page

**Files:**
- Modify: `src/pages/Profile.tsx`

**Step 1: Add imports**

Add `Settings, Users as UsersIcon, Trophy as TrophyIcon` to the lucide-react import if not already present. `Settings` and `Users` are needed. Check existing imports — `Trophy` is already imported, `Settings` is not, `Users` is not. Add them:

At the top import line (line 17), add `Settings` and `Users` to the lucide-react import.

**Step 2: Add admin section in the Profile home view**

After the "Accès rapides" card block (after line 749, the closing of the `showRecords` conditional), and before the BadgesGrid (line 751), add:

```tsx
{role === "admin" ? (
  <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="text-base uppercase tracking-[0.08em]">Administration</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <ProfileActionRow
        icon={Settings}
        title="Gestion des comptes"
        description="Utilisateurs, rôles, activation"
        onClick={() => navigate("/admin")}
      />
      <ProfileActionRow
        icon={UsersIcon}
        title="Comité"
        description="Validation heures, approbations"
        onClick={() => navigate("/comite")}
      />
      <ProfileActionRow
        icon={TrophyIcon}
        title="Records Admin"
        description="Import FFN, paramètres sync"
        onClick={() => navigate("/records-admin")}
      />
    </CardContent>
  </Card>
) : null}
```

Note: Check which icon names are available — `Users` may conflict with existing import. Use aliased imports like `UsersIcon` if needed. `Trophy` is already imported as `Trophy` — may need aliasing too.

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Manual test**

1. Login as admin
2. Go to Profile page
3. Verify "Administration" card appears with 3 links
4. Click each link — verify navigation works

**Step 5: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "feat(admin): add admin links section in Profile page"
```

---

### Task 4: Coach filter dropdown on Nageurs page (admin only)

**Files:**
- Modify: `src/pages/Coach.tsx` (pass extra props)
- Modify: `src/pages/coach/CoachSwimmersOverview.tsx` (add filter UI)

**Step 1: Fetch coaches list and assignments in Coach.tsx**

In `src/pages/Coach.tsx`, after the existing `useMySwimmerIds` + `myAthletes` block (around line 582-586), add a query to fetch all assignments and coaches list (admin only):

```typescript
const isAdmin = role === "admin";

const { data: allAssignments = [] } = useQuery({
  queryKey: ["all-assignments"],
  queryFn: () => api.getAllAssignments(),
  enabled: isAdmin,
});

const { data: coachesList = [] } = useQuery<{ id: number; display_name: string }[]>({
  queryKey: ["coaches-list"],
  queryFn: async () => {
    const { data } = await supabase
      .from("users")
      .select("id, display_name")
      .in("role", ["coach", "admin"]);
    return (data ?? []) as { id: number; display_name: string }[];
  },
  enabled: isAdmin,
});
```

Import `supabase` from `@/lib/supabase` if not already imported in Coach.tsx.

**Step 2: Pass new props to CoachSwimmersOverview**

Update the CoachSwimmersOverview call (around line 762) to pass:

```tsx
<CoachSwimmersOverview
  athletes={myAthletes}
  athletesLoading={athletesLoading}
  onOpenAthlete={handleOpenAthlete}
  isAdmin={isAdmin}
  coachesList={coachesList}
  allAssignments={allAssignments}
/>
```

**Step 3: Update CoachSwimmersOverview Props and add filter**

In `src/pages/coach/CoachSwimmersOverview.tsx`:

Add to the Props interface:
```typescript
interface Props {
  athletes: AthleteSummary[];
  athletesLoading: boolean;
  onBack?: () => void;
  onOpenAthlete: (athlete: AthleteSummary) => void;
  isAdmin?: boolean;
  coachesList?: { id: number; display_name: string }[];
  allAssignments?: { swimmer_id: number; coach_id: number }[];
}
```

Add state for coach filter:
```typescript
const [coachFilter, setCoachFilter] = useState<number | null>(null);
```

Add import for `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`.

Add filtering logic after the existing `groupFilter` handling in the `sortedAthletes` useMemo (around line 291):

```typescript
// After group filter, apply coach filter (admin only)
if (coachFilter !== null && allAssignments) {
  const swimmerIdsForCoach = new Set(
    allAssignments.filter((a) => a.coach_id === coachFilter).map((a) => a.swimmer_id)
  );
  list = list.filter((a) => a.id != null && swimmerIdsForCoach.has(a.id));
}
```

Add the filter UI in the header area (alongside the existing group filter), visible only for admin:

```tsx
{isAdmin && coachesList && coachesList.length > 0 ? (
  <Select
    value={coachFilter === null ? "all" : String(coachFilter)}
    onValueChange={(v) => setCoachFilter(v === "all" ? null : Number(v))}
  >
    <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
      <SelectValue placeholder="Coach" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Tous les coachs</SelectItem>
      {coachesList.map((c) => (
        <SelectItem key={c.id} value={String(c.id)}>
          {c.display_name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
) : null}
```

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 5: Manual test**

1. Login as admin
2. Navigate to Nageurs section
3. Verify all swimmers visible by default
4. Select a coach from dropdown — verify only their swimmers appear
5. Select "Tous les coachs" — verify all swimmers reappear

**Step 6: Commit**

```bash
git add src/pages/Coach.tsx src/pages/coach/CoachSwimmersOverview.tsx
git commit -m "feat(admin): add coach filter dropdown on swimmers page"
```

---

### Task 5: Final verification and documentation

**Step 1: Full type check**

Run: `npx tsc --noEmit`

**Step 2: Run tests**

Run: `npm test`

**Step 3: Manual end-to-end test**

1. Login as admin → redirected to `/coach`
2. Bottom nav shows 5 coach items
3. Coach home shows all swimmers
4. Nageurs page has coach filter dropdown
5. Profile page has "Administration" section with 3 links
6. Each admin link works (Gestion comptes, Comité, Records Admin)
7. Login as coach → same behavior as before (no filter dropdown)

**Step 4: Update documentation**

Update `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, and `CLAUDE.md` per the workflow.

**Step 5: Commit docs**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: add admin coach masterview implementation log"
```

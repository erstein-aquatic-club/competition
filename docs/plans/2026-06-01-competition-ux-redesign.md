# Refonte UX Compétitions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the cramped competition side-sheet with a full-screen, mobile-first competition detail (3 tabs: Nageurs · Paramètres · Jour J), redesign the "Échéances" timeline into a hero + scannable cards, and make the coach-hub tile live (next competition + J-X, deep-link to its detail).

**Architecture:** A new full-screen `CompetitionDetail` orchestrates the liveffn fetch/parse once and shares it between the Nageurs tab (engaged-swimmer suggestion) and the Jour J tab (the §361 enriched listing, refactored from a Sheet into an embeddable panel). Routing gains an optional `competitionId` for 1-tap deep-links from the hub. Two pure selectors (`nextCompetition`, `suggestedParticipants`) are TDD'd; the heavy UI goes through `/frontend-design` and is verified by tsc/lint (live Supabase paths can't run locally).

**Tech Stack:** React 19 + TS, React Query, Wouter hash routing, Tailwind/Radix (shadcn), `node:test`. Design doc: `docs/plans/2026-06-01-competition-ux-redesign-design.md`. Builds on §361 (liveffn startlist).

**Key prior-art (read before starting):**
- `src/pages/coach/CoachCompetitionsScreen.tsx` (823 LOC) — `CompetitionFormSheet` (~L94-454, the form to retire into the Paramètres tab), `EventsTimeline` (~L495-697, the rail to replace), `DeadlineEvent` type (~L458-468), main component (~L705-821, `editingComp`/`startlistComp` state, `getCompetitions`/`getAthletes` queries, `allEvents` useMemo).
- `src/components/coach/CompetitionStartlist.tsx` (571 LOC) — Sheet `{ competition, open, onOpenChange }`; body to extract into a panel. Imports: `parseStartlist`, `startlistKey`/`autoMatch`, `buildStartlistRows`/`bySwimmer`/`chronological`, `fetchStartlistHtml`, `getAthletes`, `getSwimmerPerformances`, `getObjectivesByCompetition`, `updateCompetition`, `supabase` (from `@/lib/supabase`), `formatTime`/`strokeFromCode`/`STROKE_COLORS`.
- `src/pages/coach/coachRouteState.ts` — `CoachRouteState`, `parseCoachHashLocation`, `buildCoachHash` (add `competitionId`).
- `src/pages/Coach.tsx` — tile at L467 (`onNavigate("competitions")`); section render at L1296-1302 (`<CoachCompetitionsScreen onBack=... />`); `routeState`/`setRouteState` (L1000-1025); `onNavigate={(section) => setRouteState({ section })}` (L1229).
- `src/lib/api/competitions.ts` — `getCompetitions/createCompetition/updateCompetition/deleteCompetition/getCompetitionAssignments/setCompetitionAssignments`.
- `src/pages/coach/competitionTimeline.ts` — `getTimelineEventEndDate`, `isTimelineEventPast` (reuse).

**Conventions:** runner is `node:test` (`*.test.ts`), NEVER vitest in a `*.test.ts` (pretest guard fails the build). Hooks ALWAYS before any early return (this repo has a React #310 history — §316/§326). Commit only your own files (shared multi-terminal checkout — never `git add -A`). No DB/RLS change → no `test:rls`. UI tasks: invoke the `frontend-design` skill (global CLAUDE.md mandate); match existing coach-screen tokens (text-muted-foreground, tabular-nums, STROKE_COLORS, semantic dark-mode tokens, no hex).

---

## Task 1: Pure selector `nextCompetition` (TDD)

**Files:**
- Create: `src/lib/competitions/competitionSelectors.ts`
- Create: `src/lib/competitions/competitionSelectors.test.ts`

**Step 1: Failing test**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCompetition } from "./competitionSelectors.ts";

const C = (id: string, date: string, end_date?: string) => ({ id, name: id, date, end_date: end_date ?? null });

test("returns the soonest competition whose end date is today or later", () => {
  const comps = [C("past", "2026-05-01"), C("next", "2026-06-10"), C("later", "2026-07-01")];
  assert.equal(nextCompetition(comps, "2026-06-01")?.id, "next");
});
test("an ongoing multi-day competition (started, not finished) is 'next'", () => {
  const comps = [C("ongoing", "2026-05-30", "2026-06-02"), C("later", "2026-07-01")];
  assert.equal(nextCompetition(comps, "2026-06-01")?.id, "ongoing");
});
test("returns null when all competitions are fully past", () => {
  assert.equal(nextCompetition([C("a", "2026-01-01"), C("b", "2026-02-01")], "2026-06-01"), null);
});
test("returns null on empty input", () => {
  assert.equal(nextCompetition([], "2026-06-01"), null);
});
```

**Step 2: Run → FAIL.** `node --test --experimental-test-module-mocks --import tsx "src/lib/competitions/competitionSelectors.test.ts"`

**Step 3: Implement**
```ts
export interface CompetitionLike { id: string; name: string; date: string; end_date?: string | null }

/** The soonest competition not yet finished (end_date — or date — >= today). null if none. */
export function nextCompetition<T extends CompetitionLike>(competitions: T[], todayIso: string): T | null {
  const upcoming = competitions
    .filter((c) => (c.end_date ?? c.date) >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}
```

**Step 4: Run → PASS. Step 5: Commit**
```bash
git add src/lib/competitions/competitionSelectors.ts src/lib/competitions/competitionSelectors.test.ts
git commit -m "feat(comp-ux): nextCompetition selector for hero + hub tile"
```

---

## Task 2: Pure helper `suggestedParticipants` (TDD)

**Files:**
- Create: `src/lib/liveffn/suggestParticipants.ts`
- Create: `src/lib/liveffn/suggestParticipants.test.ts`

**Step 1: Failing test**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestedParticipants } from "./suggestParticipants.ts";

test("returns matched liveffn user ids not yet assigned", () => {
  assert.deepEqual(suggestedParticipants([7, 9, 12], [9]).sort(), [7, 12]);
});
test("ignores nulls (unmatched startlist lines) and de-dupes", () => {
  assert.deepEqual(suggestedParticipants([7, null, 7, 9], [9]), [7]);
});
test("empty when every matched swimmer is already assigned", () => {
  assert.deepEqual(suggestedParticipants([7, 9], [7, 9]), []);
});
```

**Step 2: Run → FAIL. Step 3: Implement**
```ts
/** Matched liveffn user ids (nulls = unmatched lines) not yet in the assigned set; de-duped. */
export function suggestedParticipants(matchedUserIds: Array<number | null>, assignedUserIds: number[]): number[] {
  const assigned = new Set(assignedUserIds);
  const out = new Set<number>();
  for (const id of matchedUserIds) if (id != null && !assigned.has(id)) out.add(id);
  return [...out];
}
```

**Step 4: Run → PASS. Step 5: Commit**
```bash
git add src/lib/liveffn/suggestParticipants.ts src/lib/liveffn/suggestParticipants.test.ts
git commit -m "feat(comp-ux): suggestedParticipants diff (liveffn engaged vs assigned)"
```

---

## Task 3: Routing — `competitionId` deep-link (TDD)

**Files:**
- Modify: `src/pages/coach/coachRouteState.ts`
- Create: `src/pages/coach/coachRouteState.test.ts` (if none exists; else append)

**Step 1: Failing test** (`coachRouteState.test.ts`)
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoachHashLocation, buildCoachHash } from "./coachRouteState.ts";

test("parses competitionId only for the competitions section", () => {
  assert.equal(parseCoachHashLocation("#/coach?section=competitions&competitionId=abc").competitionId, "abc");
  assert.equal(parseCoachHashLocation("#/coach?section=home&competitionId=abc").competitionId, undefined);
});
test("round-trips competitionId in the hash", () => {
  const hash = buildCoachHash({ section: "competitions", competitionId: "abc" });
  assert.match(hash, /section=competitions/);
  assert.match(hash, /competitionId=abc/);
});
test("drops competitionId when leaving the competitions section", () => {
  const hash = buildCoachHash({ section: "home" }, "#/coach?section=competitions&competitionId=abc");
  assert.doesNotMatch(hash, /competitionId/);
});
```

**Step 2: Run → FAIL.**

**Step 3: Implement** in `coachRouteState.ts`:
- Add `competitionId?: string` to `CoachRouteState`.
- In `parseCoachHashLocation`, after computing `section`, add to the returned object:
  `competitionId: section === "competitions" && params.get("competitionId") ? params.get("competitionId")! : undefined,`
- In `buildCoachHash`, add a block mirroring the `weekDate` pattern:
  ```ts
  if (nextState.section === "competitions" && nextState.competitionId) {
    params.set("competitionId", nextState.competitionId);
  } else {
    params.delete("competitionId");
  }
  ```

**Step 4: Run → PASS. Step 5: Commit**
```bash
git add src/pages/coach/coachRouteState.ts src/pages/coach/coachRouteState.test.ts
git commit -m "feat(comp-ux): coachRouteState competitionId deep-link param"
```

---

## Task 4: Refactor `CompetitionStartlist` → embeddable `CompetitionStartlistPanel`

> **UI task → invoke the `frontend-design` skill.** Goal: extract the Sheet body so the Jour J tab can embed it, with NO behaviour change.

**Files:**
- Modify: `src/components/coach/CompetitionStartlist.tsx`

**Step 1:** Split the component:
- `export function CompetitionStartlistPanel({ competition }: { competition: Competition })` — everything currently inside `<SheetContent>` (the URL field, generate, matching dropdowns, two-view toggle, rows, states). All hooks stay ABOVE any early return (preserve #310 safety). Remove the outer `Sheet`/`SheetContent`/`SheetHeader` chrome and the `open`/`onOpenChange` props from the panel; the panel renders into a normal flex container (the tab body) — `className` for spacing, no fixed width.
- Keep a thin backward-compat default export `CompetitionStartlist({ competition, open, onOpenChange })` that wraps `<Sheet open onOpenChange><SheetContent…><CompetitionStartlistPanel competition=… /></SheetContent></Sheet>` ONLY IF still referenced; otherwise delete the Sheet wrapper and update the one caller in `CoachCompetitionsScreen` in Task 6. Prefer deleting the wrapper (YAGNI) and exporting `CompetitionStartlistPanel` as the primary.

**Step 2: Verify** `npx tsc --noEmit` → 0. The panel must expose, via an optional callback prop, the matched user ids so the Nageurs tab can suggest: add `onMatchedIdsChange?: (ids: Array<number | null>) => void` and call it (in a `useEffect`) whenever the computed `matches` change. (Used by Task 5's Nageurs tab. Keep it optional so the panel works standalone.)

**Step 3: Commit**
```bash
git add src/components/coach/CompetitionStartlist.tsx
git commit -m "refactor(comp-ux): extract CompetitionStartlistPanel (embeddable Jour J)"
```

---

## Task 5: `CompetitionDetail` full-screen, 3 tabs

> **UI task → invoke `frontend-design`.** This is the centerpiece. Mobile-first, full-screen.

**Files:**
- Create: `src/components/coach/competition/CompetitionDetail.tsx`

**Props:** `{ competition: Competition; initialTab?: "nageurs" | "parametres" | "jourj"; onBack: () => void; onDeleted?: () => void }`.

**Layout:** full-screen container (not a Sheet). Sticky header: back chevron, competition name, dates + lieu + `J-X` (reuse `daysUntil`/`formatDateFr` from CoachCompetitionsScreen — extract them to a shared util `src/pages/coach/competitionTimeline.ts` if cleaner, or duplicate the tiny helpers). A **segmented control** (3 tabs) under the header. Tab state via `useState(initialTab ?? "nageurs")`.

**Shared liveffn data:** lift the parse/match once here OR let the Jour J panel own it and report matched ids up via `onMatchedIdsChange` (Task 4). Recommended: render `CompetitionStartlistPanel` in the Jour J tab and capture `matchedIds` in `CompetitionDetail` state; pass `matchedIds` to the Nageurs tab for the suggestion. (Panel is always mounted only when Jour J tab is active — so to have the suggestion available in Nageurs without opening Jour J, instead lift a lightweight fetch: see note below.)
> **Wiring note:** to avoid forcing the coach to open Jour J before the Nageurs suggestion appears, `CompetitionDetail` may itself run a cheap query (only if `competition.liveffn_startlist_url` is set): `fetchStartlistHtml`→`parseStartlist`→`autoMatch(swimmers, athletes, competition.startlist_athlete_map ?? {})` → matched ids, shared to both tabs. Reuse `getAthletes` (already cached `["athletes"]`). Guard the query with `enabled: !!competition.liveffn_startlist_url`. The Jour J panel can read the same cached query (same queryKey) to avoid double fetch.

**Tabs:**
1. **Nageurs**: `getCompetitionAssignments(competition.id)` → assigned ids; `getAthletes()` → candidates. UI: search input, group quick-add chips (reuse the group→members logic from the old form L343-362), a scrollable checkbox list with avatars + group label + a live count. Persist with `setCompetitionAssignments(competition.id, ids)` (mutation, invalidate `["competition-assignments", id]`). **Suggestion banner**: compute `suggestedParticipants(matchedIds, assignedIds)`; if non-empty, show « **{n} nageurs engagés détectés — les ajouter ?** » with the names + a one-tap "Ajouter" that unions them into assignments. Hidden when empty or no liveffn URL.
2. **Paramètres**: the old form fields (name, start/end date, location, notes) + the **liveffn URL** field (moved from the panel — but the panel still has its own URL field; to avoid two URL inputs, REMOVE the URL field from `CompetitionStartlistPanel` and keep it only here, OR keep it only in the panel and link from Paramètres. Decision: keep the URL field in **Paramètres** as the single source; the Jour J panel reads `competition.liveffn_startlist_url` and, if absent, shows "Ajoute le lien dans l'onglet Paramètres". Update Task 4: the panel's URL input becomes read-only/removed). Save via `updateCompetition`. Delete competition (AlertDialog) → `deleteCompetition` then `onDeleted?.()`.
3. **Jour J**: `<CompetitionStartlistPanel competition={competition} onMatchedIdsChange={setMatchedIds} />`. If no URL: empty-state pointing to Paramètres.

**Hooks discipline:** ALL `useState`/`useQuery`/`useMutation`/`useMemo`/`useEffect` at the top, before any conditional return. Tabs switch by conditional RENDER, not early return.

**Step — Verify:** `npx tsc --noEmit` → 0; `npm run lint` → no new errors (no rules-of-hooks). No runtime test (Supabase paths can't run locally).

**Step — Commit**
```bash
git add src/components/coach/competition/CompetitionDetail.tsx src/components/coach/CompetitionStartlist.tsx
git commit -m "feat(comp-ux): full-screen CompetitionDetail (Nageurs / Paramètres / Jour J)"
```

---

## Task 6: Redesign timeline (hero + cards) + wire detail in `CoachCompetitionsScreen`

> **UI task → invoke `frontend-design`.**

**Files:**
- Modify: `src/pages/coach/CoachCompetitionsScreen.tsx`

**Changes:**
1. Accept a new prop `initialCompetitionId?: string | null` + `onOpenCompetition?: (id: string | null) => void` (to sync the route). Add state `const [detailComp, setDetailComp] = useState<Competition | null>(null)` and `const [detailTab, setDetailTab] = useState<"nageurs"|"parametres"|"jourj">("nageurs")`. On mount / when `initialCompetitionId` changes and competitions are loaded, open the matching competition's detail.
2. **When `detailComp` is set**, render `<CompetitionDetail competition={detailComp} initialTab={detailTab} onBack={() => { setDetailComp(null); onOpenCompetition?.(null); }} onDeleted={() => { setDetailComp(null); onOpenCompetition?.(null); queryClient.invalidateQueries({queryKey:["competitions"]}); }} />` INSTEAD of the timeline (full-screen takeover).
3. **Hero**: above the list, compute `nextCompetition(competitions, todayIso)`. If present, a prominent card: name, `J-X` (big), dates, location, assigned-swimmer count (`getCompetitionAssignments` count — or lazy), and a primary button "Jour J" → opens detail with `detailTab="jourj"`. Tapping the hero body → detail (`"nageurs"`).
4. **Cards list**: replace `EventsTimeline`'s rail with scannable cards. Keep the unified `allEvents` (competitions + interviews + cycle ends), grouped/sorted; each event = a tactile card with type color/icon (reuse `DOT_ACTIVE`/`BADGE_COLORS` palettes), `J-X` badge, date label, subtitle. Competition cards → open detail on tap; interview/cycle cards stay non-interactive (as today). Keep the past-collapse affordance.
5. Replace the old `CompetitionFormSheet` edit path: clicking a competition now opens `CompetitionDetail` (not the Sheet). **Creation**: keep a minimal create flow — reuse a slimmed `CompetitionFormSheet` for "Nouvelle compétition" (name + dates + location only; drop the athlete-assignment block from creation), then on success open the new competition's detail. (Athlete assignment now lives in the Nageurs tab.) Remove the now-unused `startlistComp` state + the old `CompetitionStartlist` Sheet usage.
6. Call `onOpenCompetition?.(id)` whenever a detail opens/closes so Coach.tsx can reflect it in the hash.

**Step — Verify:** `npx tsc --noEmit` → 0; `npm run lint` → clean. Manual reasoning (no local Supabase).

**Step — Commit**
```bash
git add src/pages/coach/CoachCompetitionsScreen.tsx
git commit -m "feat(comp-ux): hero + scannable cards timeline, open full-screen detail"
```

---

## Task 7: Coach hub — live tile + deep-link wiring

> **UI task → invoke `frontend-design`** for the tile visual.

**Files:**
- Modify: `src/pages/Coach.tsx`

**Changes:**
1. **Routing thread-through**: extend `CoachRouteState` usage — `onNavigate` already does `setRouteState({ section })`. Add a way to navigate WITH a competitionId. In the competitions render block (L1296-1302), pass:
   ```tsx
   <CoachCompetitionsScreen
     onBack={() => setRouteState({ section: "home" })}
     initialCompetitionId={routeState.competitionId ?? null}
     onOpenCompetition={(id) => setRouteState({ section: "competitions", competitionId: id ?? undefined })}
   />
   ```
2. **Live tile**: the Échéances tile (L467) currently is a static `onNavigate("competitions")`. Make the coach home aware of the next competition: add a `getCompetitions` query in the home component (`CoachHome`/the component owning the tiles, near L220), compute `nextCompetition(comps, todayIso)`. Render the Échéances tile to show, when a next competition exists, its name + `J-X` badge; tapping it → `setRouteState({ section: "competitions", competitionId: next.id })` (deep-link straight to detail). When none, fall back to the plain tile (`onNavigate("competitions")`). The tile builder is a `useMemo` (L476 deps) — thread `nextCompetition` + a navigate-with-id callback through props from the Coach component to the home tiles component (it receives `onNavigate`; add `onOpenCompetition?: (id: string) => void`).
   > Keep it cohesive: the live tile shows compact text + a J-X chip in the existing tile style; don't break the grid.

**Step — Verify:** `npx tsc --noEmit` → 0; `npm run lint` → clean.

**Step — Commit**
```bash
git add src/pages/Coach.tsx
git commit -m "feat(comp-ux): live Échéances hub tile + competition deep-link"
```

---

## Task 8: Full gate

**Step 1:** `npm test` → node:test + vitest all green (new selector/route tests included).
**Step 2:** `npx tsc --noEmit` → 0.
**Step 3:** `npm run lint` → 0 errors.
Fix any red before docs. No `test:rls` (no DB/RLS change).

---

## Task 9: Documentation (mandatory)

**Files:** `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md`.

- Determine the next free `§` (check `docs/implementation-log.md` top — another terminal may have advanced past §361). Use that number.
- **implementation-log.md**: new entry — context (coach UX redesign), changes (full-screen `CompetitionDetail` 3 tabs, hero+cards timeline, live hub tile, `competitionId` route, `CompetitionStartlistPanel` refactor, 2 pure selectors), files, tests, decisions (liés-avec-suggestion; URL field single-source in Paramètres), limits (live verif post-deploy on github.io).
- **ROADMAP.md** + **FEATURES_STATUS.md**: prepend the running `*Dernière mise à jour*` line; mark the Compétitions UX feature ✅.
- **CLAUDE.md**: update "Dernier § livré" (≤15 words); add `CompetitionDetail` to "Hubs & orchestrateurs critiques" if ≥150 LOC / architectural.
- **files-map.md**: add `src/components/coach/competition/CompetitionDetail.tsx`, `src/lib/competitions/competitionSelectors.ts`, `src/lib/liveffn/suggestParticipants.ts` with measured `wc -l`; update `CompetitionStartlist.tsx` size if it changed >30%.
- Run `graphify update .`.

**Commit**
```bash
git add docs CLAUDE.md
git commit -m "docs(§NNN): refonte UX module compétitions"
```

---

## Out of scope (future)
- Notifying/sharing the Jour J to swimmers.
- Offline cache of the parsed listing (weak-network robustness — §361 future note).
- Data-model changes (reuses competition_assignments + §361 columns).

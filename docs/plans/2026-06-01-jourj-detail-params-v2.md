# Jour J détail nageur + Paramètres v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a competition `pool_length` (bassin) field + a re-laid-out Paramètres tab, and make each Jour J race row tap open a bottom sheet showing the swimmer's best-season + best-all-time (with dates) for that event and the `PaceMatrixInline` pace table for their objective.

**Architecture:** Reuses existing infra end-to-end — `PaceMatrixInline` (the pace table, already used by `ObjectiveDetailSheet`), `parseObjectiveForPace` (event_code+pool → stroke/distance/pool), `findBestPerformance` (best time + date). Two pure helpers (`currentSeasonStart`, `bestForEvent`) are TDD'd. The bottom sheet reads data already loaded in `CompetitionStartlistPanel` (`perfsByUser`/`objectivesByUser`) — no extra fetch; the matched `userId` is threaded onto each `StartlistRow`.

**Tech Stack:** React 19 + TS, React Query, Tailwind/Radix (shadcn `Sheet side="bottom"`), `node:test`. Builds on §361/§362. Design doc: `docs/plans/2026-06-01-jourj-detail-params-v2-design.md`.

**Key prior-art (read before starting):**
- `src/components/coach/pace/PaceMatrixInline.tsx` — `export default PaceMatrixInline({ targetTimeMs, targetDistance, stroke, targetPoolSize, swimmerSex, compact? })`.
- `src/lib/objective-pace-link.ts` — `parseObjectiveForPace(event_code, pool_length) → { stroke, distance, pool_size } | null` (compact code `^(\d+)(NL|DOS|BR|PAP|QN)$`).
- `src/components/shared/ObjectiveDetailSheet.tsx:41-86` — reference wiring of `parseObjectiveForPace` + `PaceMatrixInline` (`targetTimeMs = target_time_seconds*1000`, `swimmerSex={null}`).
- `src/lib/objectiveHelpers.ts:164-182` — `findBestPerformance(perfs, compactEventCode, poolLength?) → { time, date } | null` (matches perfs' raw FFN `event_code` via EVENT_CODE_TO_NAMES; returns lowest time + date; all-time, no window).
- `src/lib/liveffn/buildStartlistRows.ts` — `StartlistRow` (L20-37) + `buildStartlistRows` (L118-164): has `matches` (startlistKey→userId|null), builds rows with `bestPerf`/`objectiveTarget`/`eventCode`. `perfsByUser`/`objectivesByUser` keyed by numeric userId.
- `src/components/coach/CompetitionStartlist.tsx` — `CompetitionStartlistPanel`; `RaceRow` (~L123-198) renders a race; the panel holds `matches`, `perfsByUser`, `objectivesByUser`, `competition`.
- `src/components/coach/competition/CompetitionDetail.tsx` — the Paramètres tab (name/dates/location/notes/liveffn URL/delete) to re-lay-out + add bassin.
- `src/lib/api/competitions.ts` + `src/lib/api/types.ts:511` — `Competition`/`CompetitionInput`, `updateCompetition`.

**Conventions:** `node:test` only (no vitest in `*.test.ts`). Hooks above early returns (#310 history). Commit only your own files (shared multi-terminal checkout — never `git add -A`; foreign WIP exists). Migrations via Supabase MCP (`apply_migration`, project `fscnobivsgornxdwqwlk`) — MCP already authenticated this session. No RLS change → no `test:rls`. UI tasks invoke `frontend-design`; match coach-screen tokens (semantic dark-mode, tabular-nums, STROKE_COLORS, no hex).

---

## Task 1: Migration + types — `competitions.pool_length`

**Files:**
- Create: `supabase/migrations/00XXX_competition_pool_length.sql` (run `ls supabase/migrations | tail -3` to get the next number — likely 00223+; verify, another terminal may have added migrations).
- Modify: `src/lib/api/types.ts` (`Competition`, `CompetitionInput`).

**Step 1: SQL**
```sql
-- 00XXX_competition_pool_length.sql
-- Bassin (25/50 m) of a competition — contextualises Jour J pace tables + times.
alter table public.competitions add column if not exists pool_length integer;
comment on column public.competitions.pool_length is 'Bassin de la compétition en mètres (25 ou 50), nullable.';
```
**Step 2:** Apply via `mcp__plugin_supabase_supabase__apply_migration` (name `00XXX_competition_pool_length`). Verify via `execute_sql`: `select column_name from information_schema.columns where table_name='competitions' and column_name='pool_length';` → 1 row.
**Step 3:** Add `pool_length?: number | null;` to BOTH `Competition` and `CompetitionInput` in `types.ts`.
**Step 4:** `npx tsc --noEmit` → 0.
**Step 5: Commit**
```bash
git add supabase/migrations/00XXX_competition_pool_length.sql src/lib/api/types.ts
git commit -m "feat(jourj): competitions.pool_length (bassin) + types"
```

---

## Task 2: Pure helpers `currentSeasonStart` + `bestForEvent` (TDD)

**Files:**
- Create: `src/lib/competitions/seasonBest.ts`
- Create: `src/lib/competitions/seasonBest.test.ts`

**Step 1: Failing test**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSeasonStart, bestForEvent } from "./seasonBest.ts";

test("currentSeasonStart: Sept→Aug FFN season boundary", () => {
  assert.equal(currentSeasonStart("2026-06-01"), "2025-09-01"); // before Sept → previous year
  assert.equal(currentSeasonStart("2026-09-01"), "2026-09-01"); // Sept 1 → this year
  assert.equal(currentSeasonStart("2026-10-15"), "2026-09-01");
  assert.equal(currentSeasonStart("2026-01-10"), "2025-09-01");
});

const P = (event_code: string, time: number, date: string) => ({ event_code, time_seconds: time, competition_date: date, pool_length: 50 });

test("bestForEvent: all-time best for the event (lowest time) + date", () => {
  const perfs = [P("50 NL", 24.1, "2024-12-01"), P("50 NL", 23.6, "2025-11-01"), P("100 NL", 52.0, "2026-01-01")];
  assert.deepEqual(bestForEvent(perfs, "50NL"), { time: 23.6, date: "2025-11-01" });
});
test("bestForEvent with fromDate filters the window (season best)", () => {
  const perfs = [P("50 NL", 23.6, "2025-03-01"), P("50 NL", 24.0, "2025-11-01")];
  assert.deepEqual(bestForEvent(perfs, "50NL", { fromDate: "2025-09-01" }), { time: 24.0, date: "2025-11-01" });
});
test("bestForEvent returns null when no perf matches the event", () => {
  assert.equal(bestForEvent([P("100 Dos", 60, "2026-01-01")], "50NL"), null);
});
```

**Step 2: Run → FAIL.** `node --test --experimental-test-module-mocks --import tsx "src/lib/competitions/seasonBest.test.ts"`

**Step 3: Implement** (reuse `findBestPerformance`, no logic duplication):
```ts
import { findBestPerformance } from "../objectiveHelpers";

/** First day (YYYY-09-01) of the current FFN season (Sept→Aug). */
export function currentSeasonStart(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const seasonYear = month >= 9 ? year : year - 1;
  return `${seasonYear}-09-01`;
}

type Perf = { event_code: string; pool_length?: number | null; time_seconds?: number | null; competition_date?: string | null };

/** Best perf for a compact event code, optionally within a date window (>= fromDate). */
export function bestForEvent(
  perfs: Perf[],
  eventCode: string,
  opts?: { fromDate?: string },
): { time: number; date: string | null } | null {
  const scoped = opts?.fromDate
    ? perfs.filter((p) => (p.competition_date ?? "") >= opts.fromDate!)
    : perfs;
  return findBestPerformance(scoped, eventCode);
}
```

**Step 4: Run → PASS. Step 5: Commit**
```bash
git add src/lib/competitions/seasonBest.ts src/lib/competitions/seasonBest.test.ts
git commit -m "feat(jourj): currentSeasonStart + bestForEvent (season vs all-time)"
```

---

## Task 3: Thread `userId` onto `StartlistRow` (TDD)

**Files:**
- Modify: `src/lib/liveffn/buildStartlistRows.ts`
- Modify: `src/lib/liveffn/buildStartlistRows.test.ts`

**Step 1: Add a failing assertion** to an existing/new test: a matched race row exposes the numeric `userId`; an unlinked row has `userId: null`.
```ts
test("row carries the matched numeric userId (null when unlinked)", () => {
  const swimmers = [{ lastName: "WAGNER", firstName: "Francois", birthYear: 1999,
    races: [{ rawEvent: "50 Nage Libre Messieurs", heat: 1, lane: 4, entryTimeSeconds: 23.64, entryTimeDisplay: "23.64", day: "Dimanche 24 Mai", time: "10h59" }] }];
  const rows = buildStartlistRows({ swimmers, matches: { "wagner-francois-1999": 7 }, athleteName: { 7: "F W" }, perfsByUser: {}, objectivesByUser: {} });
  assert.equal(rows[0].userId, 7);
});
```

**Step 2: Run → FAIL** (userId undefined).
**Step 3: Implement** — add `userId: number | null;` to the `StartlistRow` interface, and in `buildStartlistRows` set `userId: matches[startlistKey(...)] ?? null` on each row (the matched id is already computed for `linked`/`swimmerName` — reuse it, don't recompute).
**Step 4: Run → PASS** (+ the existing suite still green: `node --test … buildStartlistRows.test.ts`).
**Step 5: Commit**
```bash
git add src/lib/liveffn/buildStartlistRows.ts src/lib/liveffn/buildStartlistRows.test.ts
git commit -m "feat(jourj): expose matched userId on StartlistRow"
```

---

## Task 4: Paramètres tab v2 (re-layout + bassin)

> **UI task → invoke `frontend-design`.** Mobile-first, cohesive with the app.

**Files:**
- Modify: `src/components/coach/competition/CompetitionDetail.tsx` (the Paramètres tab only).

**Changes:**
1. Re-lay-out the Paramètres tab into 3 visually-separated sections (cards / `border-t` dividers, `uppercase tracking-wider text-muted-foreground` section labels): **Infos** (name, start/end dates, location, **bassin**, notes), **Liste de départ** (liveffn URL field — keep the existing validation), **Zone danger** (delete button + AlertDialog).
2. **Bassin field**: a segmented control with 3 options — `25 m` / `50 m` / `—` (aucun) — bound to a `poolLength` state (`number | null`, seeded from `competition.pool_length ?? null`). Use the same segmented-control style as the tabs/view-toggle already in this file.
3. Include `pool_length: poolLength` in the `updateCompetition(competition.id, { …, pool_length })` save payload. Keep name-non-empty + date<=end validation. Toast on save.
4. Keep all hooks above any early return. No behaviour change to Nageurs/Jour J tabs.

**Step — Verify:** `npx tsc --noEmit` → 0; `npm run lint` → clean (no rules-of-hooks). No runtime test.
**Step — Commit**
```bash
git add src/components/coach/competition/CompetitionDetail.tsx
git commit -m "feat(jourj): Paramètres tab v2 (sectioned layout + bassin 25/50)"
```

---

## Task 5: Jour J — swimmer race bottom sheet (`SwimmerRaceSheet`)

> **UI task → invoke `frontend-design`.** Bottom sheet, mobile-first, reuse `PaceMatrixInline`.

**Files:**
- Create: `src/components/coach/competition/SwimmerRaceSheet.tsx`
- Modify: `src/components/coach/CompetitionStartlist.tsx` (make `RaceRow` tappable, manage open state, pass data).

### `SwimmerRaceSheet.tsx`
Props:
```ts
{
  open: boolean;
  onOpenChange: (b: boolean) => void;
  row: StartlistRow | null;                 // has swimmerName, eventCode, eventLabel, day, time, heat, lane, bestPerf, userId
  perfs: Array<{ event_code: string; pool_length?: number|null; time_seconds?: number|null; competition_date?: string|null }>;
  objectives: Array<{ event_code?: string|null; pool_length?: number|null; target_time_seconds?: number|null }>;
  competitionPoolLength: number | null;     // competition.pool_length
}
```
Render a `<Sheet open onOpenChange><SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">…</SheetContent></Sheet>`:
- **Header**: `row.swimmerName` · `row.eventLabel` · `row.day` `row.time` · `série {row.heat} · couloir {row.lane}`.
- **Temps** (only when `row.eventCode`): compute with the Task-2 helpers + the existing `formatTime`/`timeAgo` already in CompetitionStartlist (or import `formatTime` from objectiveHelpers):
  - `seasonBest = bestForEvent(perfs, row.eventCode, { fromDate: currentSeasonStart(new Date().toISOString().slice(0,10)) })`
  - `allTimeBest = bestForEvent(perfs, row.eventCode)`
  - Two stat rows: « Meilleur temps saison » → `formatTime(seasonBest.time)` + date (or « — »), « Best all-time » → `formatTime(allTimeBest.time)` + date (or « — »). `tabular-nums`.
- **Tableau d'allures**: find the objective for this event: `const obj = objectives.find(o => o.event_code === row.eventCode && o.target_time_seconds != null)`. If `obj`:
  - `const parsed = parseObjectiveForPace(row.eventCode, competitionPoolLength ?? obj.pool_length)` (competition bassin wins, fallback objective pool).
  - `const targetTimeMs = obj.target_time_seconds * 1000`.
  - if `parsed && targetTimeMs`: `<PaceMatrixInline targetTimeMs={targetTimeMs} targetDistance={parsed.distance} stroke={parsed.stroke} targetPoolSize={parsed.pool_size} swimmerSex={null} />`.
  - else (no objective / unparseable): a muted note « Aucun objectif positionné pour cette épreuve ».
- All hooks (if any `useMemo`) above returns; the component may early-return `null` when `!row` — but put that AFTER hooks (or guard the hooks with `row?.` and keep them unconditional). Prefer: keep hooks unconditional, render nothing inside when `!row`.

### Wire into `CompetitionStartlist.tsx`
- Add panel state: `const [sheetRow, setSheetRow] = useState<StartlistRow | null>(null);` (hook at top, above returns).
- In `RaceRow`, when `row.userId != null`, wrap the row in a tappable `<button>` (large target, `hover`/active) calling an `onOpen?.(row)` prop; unlinked rows stay non-interactive. Thread an `onOpen` prop from the panel into the row renderer.
- Render once at panel level: `<SwimmerRaceSheet open={!!sheetRow} onOpenChange={(o) => !o && setSheetRow(null)} row={sheetRow} perfs={sheetRow?.userId != null ? (perfsByUser[sheetRow.userId] ?? []) : []} objectives={sheetRow?.userId != null ? (objectivesByUser[sheetRow.userId] ?? []) : []} competitionPoolLength={competition.pool_length ?? null} />`. (`perfsByUser`/`objectivesByUser` are already in panel scope — confirm their variable names by reading the file; adapt.)
- A subtle affordance (e.g. a chevron) on linked rows to signal tappability.

**Step — Verify:** `npx tsc --noEmit` → 0; `npm run lint` → clean (no rules-of-hooks; #310 — all hooks above returns in both the sheet and the panel). No runtime test (Supabase + edge unavailable locally).
**Step — Commit**
```bash
git add src/components/coach/competition/SwimmerRaceSheet.tsx src/components/coach/CompetitionStartlist.tsx
git commit -m "feat(jourj): swimmer race bottom sheet (season/all-time best + pace table)"
```

---

## Task 6: Full gate
**Step 1:** `npm test` → node:test + vitest all green (new seasonBest + buildStartlistRows tests included).
**Step 2:** `npx tsc --noEmit` → 0.
**Step 3:** `npm run lint` → 0 errors.
No `test:rls` (no RLS change).

---

## Task 7: Documentation (next free §)
**Files:** `docs/implementation-log.md`, `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `CLAUDE.md`, `docs/claude/files-map.md`.
- Determine next free `§` (check log top — §362 is the latest known; another terminal may have advanced).
- **implementation-log.md**: new entry — context (terrain François), changes (mig `pool_length`/bassin, Paramètres v2 sectioned, Jour J row→bottom sheet with season+all-time best + PaceMatrixInline, `currentSeasonStart`/`bestForEvent`, `userId` on StartlistRow, fix #1 Échéances tile already shipped), files, tests, decisions (season vs all-time; competition bassin drives pace pool; reuse PaceMatrixInline), limits (swimmerSex null; live verif post-deploy).
- **ROADMAP.md** + **FEATURES_STATUS.md**: prepend running line; mark ✅.
- **CLAUDE.md**: "Dernier § livré" (≤15 words). 
- **files-map.md**: add `src/components/coach/competition/SwimmerRaceSheet.tsx`, `src/lib/competitions/seasonBest.ts` with measured `wc -l`; update `CompetitionStartlist.tsx`/`CompetitionDetail.tsx` sizes if >30%.
- `graphify update .`.

**Commit**
```bash
git add docs CLAUDE.md
git commit -m "docs(§NNN): Jour J détail nageur + Paramètres v2 (bassin)"
```

---

## Out of scope (future)
- Real `swimmerSex` for the pace matrix (not exposed in AthleteSummary).
- Per-pool best times (25 vs 50) — deferred for season vs all-time.
- Sharing the Jour J to swimmers.

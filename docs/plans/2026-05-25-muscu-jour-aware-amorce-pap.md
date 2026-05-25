# Muscu *jour-aware* : amorce SNC (PAP) + transfert de force — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the strength mesocycle generator weekday-aware so the swimmer picks *which days* she trains, Monday/Thursday sessions become CNS-priming PAP doses (heavy-short + explosive) that don't compromise the pool sprint that follows, the off-pool day carries a force-biased development stimulus, no muscu lands on Saturday, the cycle can start mid-week (this Thursday) with a partial first week, and a global freshness cap keeps power transferable to the water.

**Architecture:** The pure TS engine (`mesocycleEngine.ts`) becomes the single source of truth for **per-session `weekday` + `role`** (today it only emits ordinal `sessionNumber`, and the apply RPC derives weekdays from a hardcoded `[0,2,4]` array). Each chosen weekday is classified `amorce_pap` (Mon/Thu = pool-big days), `developpement` (off-pool day, force-biased), or `mobilite_corrective` (safety override wins). The apply RPC (new migration) reads `session.weekday` directly, supports a mid-week start with a partial first week, and names sessions by role. The two generation screens swap the "séances/semaine" number for a weekday checkbox row + a start-date picker (via `/frontend-design`).

**Tech Stack:** React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter (hash routing) + Supabase (PostgreSQL, SECURITY DEFINER RPC). Tests: `node:test` (`npm test`). Migrations via MCP Supabase (`mcp__plugin_supabase_supabase__apply_migration`, project `fscnobivsgornxdwqwlk`).

**Design doc:** `docs/plans/2026-05-25-muscu-jour-aware-amorce-pap-design.md` (read it first — has the audit context & validated Q&A decisions).

**Conventions locked:**
- Weekday integers **0=Lun … 6=Dim** (matches RPC `00181`). **Saturday=5 is never selectable.**
- Default primer days = `{0 (Lun), 3 (Jeu)}` ∩ chosen weekdays (override-able in preview).
- `ENGINE_VERSION` bumps `1.0.0` → **`1.1.0`** (logic change).
- Safety override (douleur ≥3 / dysfonction → mobility) **beats** role: such a session stays `mobilite_corrective`, never PAP.

**Before starting:** create an isolated branch/worktree (`@superpowers:using-git-worktrees`). Do **not** push or deploy. Commit frequently.

---

## Phase 0 — Pre-flight (no code)

### Task 0.1: Confirm test runner & baseline green
**Step 1:** Run `npx tsc --noEmit` → Expected: exits 0.
**Step 2:** Run `npm test` → Expected: full suite green (baseline; note count).
**Step 3:** No commit. If red at baseline, STOP and report (do not build on a red tree).

---

## Phase 1 — Types (engine contract)

### Task 1.1: Add `SessionRole`, session `weekday`/`role`, and input `weekdays`/`primerWeekdays`
**Files:**
- Modify: `src/lib/strength/mesocycleEngine.types.ts`

**Step 1: Add the role type** (near the top, after the imports block, ~line 21):
```ts
/**
 * Rôle de dimensionnement d'une séance (§ jour-aware) — découple le chargement
 * du cycle de la semaine.
 *  - `amorce_pap`        : jour gros-bassin (Lun/Jeu) → PAP (lourd court +
 *    explosif), volume minimal, SNC activé sans fatigue → potentialise le sprint.
 *  - `developpement`     : jour off-bassin → porte la périodisation, biaisé force.
 *  - `mobilite_corrective` : override sécurité (douleur intense / dysfonction).
 */
export type SessionRole = 'amorce_pap' | 'developpement' | 'mobilite_corrective';
```

**Step 2: Extend `MesocycleSession`** (in the interface ~line 164):
```ts
export interface MesocycleSession {
  sessionNumber: number;
  /** Jour de la semaine où la séance est posée (0=Lun … 6=Dim). § jour-aware. */
  weekday: number;
  /** Rôle de dimensionnement (PAP / développement / correctif). § jour-aware. */
  role: SessionRole;
  buckets: StrengthBucket[];
  exercises: MesocycleExercise[];
}
```

**Step 3: Extend `MesocycleInput`** (in the interface ~line 322, alongside `sessionsPerWeek`):
```ts
  /** Nombre de séances par semaine (= weekdays.length, conservé pour la math de volume). */
  sessionsPerWeek: number;
  /**
   * Jours de muscu cochés par le nageur (0=Lun … 6=Dim), triés, sans samedi (5).
   * § jour-aware — remplace le « nombre de séances/semaine » comme entrée UI.
   */
  weekdays: number[];
  /**
   * Sous-ensemble de `weekdays` traité en amorce PAP (gros bassins).
   * Défaut applicatif : {0 (Lun), 3 (Jeu)} ∩ weekdays.
   */
  primerWeekdays: number[];
```

**Step 4:** Run `npx tsc --noEmit` → Expected: FAILS in `mesocycleEngine.ts` (buildSession doesn't set `weekday`/`role`) and in callers that build `MesocycleInput` without `weekdays`. This proves the contract changed. Do not fix yet.

**Step 5: Commit**
```bash
git add src/lib/strength/mesocycleEngine.types.ts
git commit -m "feat(muscu): add SessionRole + weekday/role to session, weekdays/primerWeekdays to input"
```

---

## Phase 2 — Engine logic (TDD, the heart)

> All tests go in `src/lib/strength/__tests__/mesocycleEngine.test.ts` (existing helpers: `makeAssessment`, `makeAthlete`, `makeMeasurement`). You'll need a `makeInput()` helper + a small exercise catalog. Add them once (Task 2.0), reuse after.

### Task 2.0: Test fixtures for full-pipeline tests
**Files:**
- Modify: `src/lib/strength/__tests__/mesocycleEngine.test.ts`

**Step 1:** Add a minimal catalog + input builder + a 50-free `inter_competition` template near the other helpers:
```ts
import { generateMesocycle } from '../mesocycleEngine.ts';
import type { CatalogExercise, MesocycleInput } from '../mesocycleEngine.types.ts';

function ex(id: number, bucket: CatalogExercise['bucket'], isCore: boolean,
           forcePct: number | null): CatalogExercise {
  return {
    id, nomExercice: `ex-${id}`, bucket, level: null, contraindicationZones: [],
    strokePrehabAffinity: [], isCore, illustrationGif: null,
    nbSeriesEndurance: 2, nbRepsEndurance: 12, pourcentageCharge1rmEndurance: 40,
    recupSeriesEndurance: 45,
    nbSeriesForce: 4, nbRepsForce: 5, pourcentageCharge1rmForce: forcePct,
    recupSeriesForce: 180,
  };
}

// Pliométrie/balistique = force% 0 ; force lestée = 85.
const CATALOG: CatalogExercise[] = [
  ex(1, 'upper_strength', true, 85),
  ex(2, 'upper_strength', false, 80),
  ex(3, 'lower_strength', true, 85),
  ex(4, 'lower_power', true, 0),      // box jump (explosif)
  ex(5, 'upper_power', true, 0),      // med-ball throw (explosif)
  ex(6, 'mobility', false, null),
  ex(7, 'mobility', false, null),
];

// 50-free inter_competition (00194:45-48) : maintien→puissance→affutage→pic, [5,8].
const TPL_50_INTER: StrengthPeriodizationTemplate = {
  id: 'freestyle_50_inter_competition',
  event_group: 'freestyle_50',
  kind: 'inter_competition',
  label: '50 m',
  max_week_count: 8,
  structure: {
    bucket_emphasis: { lower_strength: 0.85, lower_power: 0.9, upper_strength: 1.0, upper_power: 0.5, mobility: 0.3 },
    phases: [
      { cycle: 'maintien', min_weeks: 1, nominal_weeks: 2, max_weeks: 3 },
      { cycle: 'puissance', min_weeks: 2, nominal_weeks: 2, max_weeks: 3 },
      { cycle: 'affutage', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
    ],
  },
} as unknown as StrengthPeriodizationTemplate;

function makeInput(overrides: Partial<MesocycleInput> = {}): MesocycleInput {
  const weekdays = overrides.weekdays ?? [0, 1, 3]; // Lun, Mar, Jeu
  return {
    assessment: makeAssessment(),
    kpiMeasurements: [],
    athlete: makeAthlete({ sex: 'F', ageBand: 'adulte' }),
    template: TPL_50_INTER,
    targetWeekCount: 7,
    sessionsPerWeek: weekdays.length,
    weekdays,
    primerWeekdays: overrides.primerWeekdays ?? weekdays.filter((d) => d === 0 || d === 3),
    exerciseCatalog: CATALOG,
    ...overrides,
  };
}
```
> Verify the real `StrengthPeriodizationTemplate` / `PeriodizationStructure` field names in `src/lib/api/types.ts` before finalizing this fixture (adjust `bucket_emphasis`/`phases` keys if they differ).

**Step 2:** Run `npx tsc --noEmit` on the test file path (or `npm test -- mesocycleEngine`) → Expected: still FAILS (engine not updated). No commit yet (fixtures land with first real test).

### Task 2.1: `generateMesocycle` assigns one session per chosen weekday, sorted
**Step 1: Failing test**
```ts
describe('jour-aware — weekday assignment', () => {
  it('emits one session per chosen weekday, in ascending weekday order', () => {
    const meso = generateMesocycle(makeInput({ weekdays: [3, 0, 1] }));
    const w1 = meso.weeks.find((w) => w.weekNumber === 1)!;
    // full week (start = Monday) has all 3, sorted 0,1,3
    assert.deepEqual(w1.sessions.map((s) => s.weekday), [0, 1, 3]);
    assert.equal(meso.sessionsPerWeek, 3);
  });
});
```
**Step 2:** Run `npm test -- mesocycleEngine` → Expected: FAIL.
**Step 3: Implement** in `mesocycleEngine.ts` — `buildWeek` (line 643) must drive sessions from `input.weekdays` (sorted), not from `distributeSessionSlots` count alone. Thread `weekdays` + `primerWeekdays` from `generateMesocycle` into `buildWeek`/`buildSession`. Each emitted session gets `.weekday` from the sorted list and `.role` (Task 2.2).
**Step 4:** Run `npm test -- mesocycleEngine` → Expected: PASS.
**Step 5: Commit** (`feat(muscu): engine emits one session per chosen weekday, sorted`).

### Task 2.2: Role classification (amorce_pap / developpement / mobilite_corrective)
**Step 1: Failing test**
```ts
describe('jour-aware — role classification', () => {
  it('Lun & Jeu are amorce_pap, off-pool day is developpement', () => {
    const meso = generateMesocycle(makeInput({ weekdays: [0, 1, 3], primerWeekdays: [0, 3] }));
    const w1 = meso.weeks.find((w) => w.weekNumber === 1)!;
    const byDay = Object.fromEntries(w1.sessions.map((s) => [s.weekday, s.role]));
    assert.equal(byDay[0], 'amorce_pap');
    assert.equal(byDay[3], 'amorce_pap');
    assert.equal(byDay[1], 'developpement');
  });

  it('safety override (intense pain) forces mobilite_corrective even on a primer day', () => {
    const input = makeInput({
      weekdays: [0, 1, 3], primerWeekdays: [0, 3],
      assessment: makeAssessment({
        questionnaire: { ...greatQuestionnaire, pain: [{ body_zone: 'shoulder', intensity: 3 }] },
      }),
    });
    const w1 = generateMesocycle(input).weeks[0];
    assert.ok(w1.sessions.every((s) => s.role === 'mobilite_corrective'));
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** a `classifyRole(weekday, primerWeekdays, isMobilityOverride)` helper; call it in `buildSession`. If the existing mobility-override path makes `primary === 'mobility'`, role = `mobilite_corrective` (wins). Else `primerWeekdays.includes(weekday) ? 'amorce_pap' : 'developpement'`.
**Step 4:** Run → PASS.
**Step 5: Commit** (`feat(muscu): classify session role by weekday + safety override`).

### Task 2.3: `amorce_pap` loading = heavy-short potentiator + explosive (PAP)
**Step 1: Failing test**
```ts
describe('jour-aware — PAP loading', () => {
  it('amorce_pap = 1 heavy strength (low reps, high %) + 1 explosive (0% max velocity), low volume', () => {
    const meso = generateMesocycle(makeInput({ weekdays: [0, 1, 3], primerWeekdays: [0, 3] }));
    const mon = meso.weeks[0].sessions.find((s) => s.weekday === 0)!;
    const main = mon.exercises.filter((e) => e.bucket !== 'mobility');
    // exactly 2 main items: a heavy potentiator + an explosive one
    assert.equal(main.length, 2);
    const heavy = main.find((e) => (e.intensityPct1rm ?? 0) >= 80)!;
    const explosive = main.find((e) => (e.intensityPct1rm ?? 0) === 0)!;
    assert.ok(heavy && explosive, 'has heavy + explosive');
    assert.ok(heavy.reps <= 3 && heavy.sets <= 2, 'potentiator is short');
    // total volume capped (warmup<=1 + 2 main)
    assert.ok(mon.exercises.length <= 3, 'PAP day is low-volume for freshness');
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** a `buildPapSession(weekday, selected, focusBuckets)`:
- pick 1 core exo from the top **strength** focus bucket (`upper_strength`/`lower_strength`) → potentiator: `sets=2, reps=2, intensityPct1rm = clampHigh(catalog force %), restSeconds=180, intention="Potentiateur lourd — explosivité, pas de fatigue."`
- pick 1 core exo from the top **power** focus bucket (`lower_power`/`upper_power`) → explosive: `sets=2, reps=3, intensityPct1rm = catalog force % (0 for plyo), restSeconds=150, intention="Explosif — vitesse maximale, potentialise le sprint."`
- 1 mobility warmup (existing `MOBILITY_WARMUP_COUNT` reduced to 1 for PAP).
- Route `buildSession` to `buildPapSession` when `role === 'amorce_pap'`.
- If a strength or power focus bucket is missing, degrade gracefully (use whatever focus buckets exist; if only one, single main item — never throw).
**Step 4:** Run → PASS.
**Step 5: Commit** (`feat(muscu): PAP loading for amorce days (heavy-short + explosive)`).

### Task 2.4: `developpement` loading substitutes `force_max` for `maintien` weeks when force-biased
**Step 1: Failing test**
```ts
describe('jour-aware — development force bias', () => {
  it('on a maintien week, the development day loads force_max for a detrained sprinter', () => {
    const meso = generateMesocycle(makeInput({ weekdays: [0, 1, 3] }));
    // 7w inter_competition → W1..3 = maintien; development day = Tue (weekday 1)
    const w1 = meso.weeks.find((w) => w.weekNumber === 1)!;
    assert.equal(w1.cycle, 'maintien');
    const dev = w1.sessions.find((s) => s.weekday === 1)!;
    const heavy = dev.exercises.find((e) => e.bucket !== 'mobility')!;
    // force_max reads catalog *_force (e.g. sets 4, reps 5, 85%), NOT maintien (sets~2)
    assert.ok(heavy.sets >= 3, 'development day builds force, not maintains');
    assert.ok((heavy.intensityPct1rm ?? 0) >= 80);
  });

  it('puissance/affutage/pic weeks are unchanged on the development day', () => {
    const meso = generateMesocycle(makeInput({ weekdays: [0, 1, 3] }));
    const wPow = meso.weeks.find((w) => w.cycle === 'puissance')!;
    const dev = wPow.sessions.find((s) => s.weekday === 1)!;
    const main = dev.exercises.find((e) => e.bucket !== 'mobility')!;
    // puissance modulation = force% - 15 (engine line 890) → 70 for an 85 exo
    assert.ok((main.intensityPct1rm ?? 0) < 85);
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement**
- Add `deriveDistanceKey(eventGroup)` (mirror of `deriveStrokeKey`) → `'50'|'100'|...`.
- `forceBiasRequired(input, bucketScores)` = distance is `'50'|'100'` **OR** `max(lower_strength, upper_strength score) < 60` (null counts as low). *(Threshold tunable — flag for coach.)*
- In `buildSession` for `role === 'developpement'`, compute `effectiveCycle = (cycle === 'maintien' && forceBias) ? 'force_max' : cycle` and pass it to `toMesocycleExercise`. Primers and mobility unaffected.
**Step 4:** Run → PASS.
**Step 5: Commit** (`feat(muscu): development day substitutes force_max for maintien when force-biased`).

### Task 2.5: Bump `ENGINE_VERSION` + keep determinism/back-compat green
**Step 1:** Edit `mesocycleEngine.ts:550` → `export const ENGINE_VERSION = '1.1.0';`.
**Step 2:** Run full `npm test` → Expected: PASS (fix any pre-existing engine test that built `MesocycleInput` without `weekdays`/`primerWeekdays` — add them via the new defaults).
**Step 3:** Run `npx tsc --noEmit` → Expected: 0 (engine + types coherent; callers fixed in Phase 3-4).
**Step 4: Commit** (`chore(muscu): bump ENGINE_VERSION to 1.1.0`).

---

## Phase 3 — API wrapper + apply RPC

### Task 3.1: Serialize `weekday` + `role`; pass `p_weekdays` + `p_start_date`
**Files:**
- Modify: `src/lib/api/strength-mesocycles.ts`
- Test: `src/lib/api/__tests__/strength-mesocycles.test.ts`

**Step 1: Failing test** (assert serialization carries weekday/role and applyMesocycle builds the new RPC params — follow the file's existing mock style):
```ts
it('serializeWeek carries session.weekday and session.role', () => {
  // build a tiny GeneratedMesocycle with one week/one session, assert the
  // serialized payload has session_number, weekday, role, buckets, exercises.
});
```
**Step 2:** Run `npm test -- strength-mesocycles` → FAIL.
**Step 3: Implement**
- `serializeSession` (line 61): add `weekday: s.weekday, role: s.role`.
- `applyMesocycle` (line 111): change signature to `applyMesocycle(input, generated, startDate)`. In the RPC params, add `p_weekdays: input.weekdays`, `p_start_date: toDateString(startDate)`, and set `p_start_week_monday` = Monday of `startDate` (add a `mondayOf(date)` helper). Keep `p_sessions_per_week: input.weekdays.length`.
**Step 4:** Run → PASS. Then `npx tsc --noEmit` → fix `MesocycleGeneration`/`MesocyclePreview` call sites in Phase 4.
**Step 5: Commit** (`feat(muscu): serialize weekday/role + pass p_weekdays/p_start_date to apply RPC`).

### Task 3.2: New migration — RPC reads `session.weekday`, partial first week, role naming
**Files:**
- Create: `supabase/migrations/00200_mesocycle_weekday_aware_apply.sql`

**Step 1:** Write `CREATE OR REPLACE FUNCTION apply_strength_mesocycle(...)` based on `00181` (copy its body) with these diffs:
- **Params:** add `p_weekdays integer[]`, `p_start_date date`. Keep `p_start_week_monday` (= Monday of start). Keep `p_sessions_per_week` (stored on `strength_mesocycles`).
- **Drop** the `v_days := CASE p_sessions_per_week …` block (lines 98-106).
- **Day source:** replace `v_day_of_week := v_days[v_session_number];` (line 190) with `v_day_of_week := (v_session->>'weekday')::int;`.
- **Partial first week:** compute `v_session_date := v_week_start + v_day_of_week;` and `IF v_session_date < p_start_date THEN CONTINUE; END IF;` (skips days before the mid-week start in week 1, harmless after).
- **Role-aware name:** read `v_role := v_session->>'role';`. Prefix `v_session_name` with `'Amorce SNC · '` when `v_role = 'amorce_pap'`; `'Mobilité corrective'` stays for `mobilite_corrective`.
- Keep auth, supersede, snapshot, items, slot/week overrides, notification **unchanged**. Keep `1..7` guard but validate against `array_length(p_weekdays,1)`.
- Wrap in `BEGIN; … COMMIT;`. No backfill needed.

**Step 2: Apply via MCP** (same session, per CLAUDE.md): `mcp__plugin_supabase_supabase__apply_migration` on project `fscnobivsgornxdwqwlk`, name `00200_mesocycle_weekday_aware_apply`.
**Step 3: Smoke-verify** via `mcp__plugin_supabase_supabase__execute_sql`: `SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname='apply_strength_mesocycle';` → Expected: includes `p_weekdays integer[]` and `p_start_date date`.
**Step 4:** `npm run build` → Expected: 0 (no client break).
**Step 5: Commit** (`feat(muscu): weekday-aware apply RPC with partial first week + role naming (mig 00200)`).

> **RLS note:** this changes a **function body**, not a policy or RLS-enabled table — per CLAUDE.md, `npm run test:rls` is **not required**. (Optional manual apply→`strength_planning_slot_overrides` sanity if Docker already up.)

---

## Phase 4 — Generation UI (weekday picker + start-date picker)

> **MANDATORY:** UI work goes through `/frontend-design` (project rule). Give it the contract below; do not hand-write JSX in this plan.

### Task 4.1: Weekday checkbox row + start-date picker on `MesocycleGeneration.tsx`
**Files:** Modify `src/pages/MesocycleGeneration.tsx`

**Contract for `/frontend-design`:**
- Replace the `sessionsPerWeek` numeric control with a **7-day toggle row** Lun…Dim. **Samedi (index 5) disabled** with a hint "pas de muscu le samedi". State: `weekdays: number[]` (0=Lun…6=Dim). Default: `[0, 1, 3]` (Lun/Mar/Jeu) or carry `assessment.sessions_per_week` → preselect that many sensible days.
- Add a **start-date picker** (shadcn date picker), default = next chosen training day ≥ today. Replaces the hardcoded `startMonday` (lines 300-305).
- `canSubmit` (line 323): require `weekdays.length >= 1` and a valid start date; drop the `sessionsPerWeek 1..7` clause (keep week-range check lines 329-330).
- Payload (lines 345-353): emit `weekdays`, `startDate` (ISO) instead of `sessionsPerWeek` + `startWeekMonday`. Keep `athleteId`, `stroke`, `distance`, `kind`, `targetWeekCount`.
- **Guard:** if `weekdays` contains no off-pool day (only Lun/Jeu) AND force-bias would apply, show an inline warning "aucun jour de développement force — coche un jour off-bassin (Mar/Mer/Ven)".

**Verify:** `npx tsc --noEmit` 0; manual: picking Lun/Mar/Jeu + a Thursday start produces the right payload (log it).
**Commit** (`feat(muscu): weekday picker + start-date picker on generation screen`).

### Task 4.2: Preview consumes `weekdays`/`startDate`, shows role + day per session
**Files:** Modify `src/pages/MesocyclePreview.tsx`

**Contract for `/frontend-design`:**
- Read `weekdays`/`startDate` from payload; build `MesocycleInput` with `weekdays` + `primerWeekdays` (default `{0,3} ∩ weekdays`), `sessionsPerWeek = weekdays.length`.
- Call `applyMesocycle(input, generated, startDate)`.
- Per session: render the **weekday label** (Lun/Mar/Jeu…) and a **role badge** (`Amorce SNC` / `Développement` / `Correctif`). Keep the existing `ProfileIncompleteScreen` gate (line 345) untouched.
- *(Optional, nice-to-have)* let the coach toggle which chosen days are primers (edits `primerWeekdays`, re-runs the local preview).

**Verify:** `npx tsc --noEmit` 0; `npm test` green; manual preview shows Lun/Jeu = Amorce, off-day = Développement.
**Commit** (`feat(muscu): preview shows weekday + role, applies via startDate`).

### Task 4.3: `MyPlanTab` renders real weekday + role badge
**Files:** Modify `src/components/strength/MyPlanTab.tsx`
**Contract for `/frontend-design`:** the slot overrides already carry `day_of_week`; surface the weekday label and a role badge (derive role from the session name prefix "Amorce SNC ·", or from `raw_payload`). Confirm partial-first-week renders (week 1 may show a single session).
**Verify:** `npm test` green; manual.
**Commit** (`feat(muscu): MyPlanTab shows real weekday + role badge`).

---

## Phase 5 — Verification & docs

### Task 5.1: Full verification (@superpowers:verification-before-completion)
**Step 1:** `npx tsc --noEmit` → 0.
**Step 2:** `npm test` → all green (note count vs baseline; new engine tests included).
**Step 3:** `npm run build` → 0.
**Step 4:** Manual end-to-end (deployed or local): coach → bilan → KPIs → mobility → generate freestyle/50/inter_competition/7w, pick Lun/Mar/Jeu, start **this Thursday** → preview shows partial first week (just Thursday), Lun/Jeu = Amorce PAP (heavy+explosive, low volume), Tue = force-biased development. Apply → MyPlanTab shows the right days.
**Step 5:** No commit (verification only). Record evidence in the log entry.

### Task 5.2: Documentation workflow (project rule — obligatoire)
**Files:**
- `docs/implementation-log.md` — new § (contexte, changements, fichiers, tests, décisions [PAP not pic; force_max↔maintien substitution to validate], limites [thresholds tunable; multi-dev-day handling]).
- `docs/ROADMAP.md` — line for the new § + update the `*Dernière mise à jour*` header.
- `docs/FEATURES_STATUS.md` — strength generation feature → updated state.
- `docs/claude/files-map.md` — update sizes for any file whose `wc -l` changed >30 % (measure, never invent).
- `CLAUDE.md` — update **only** the "Dernier § livré" line (≤15 words).
**Commit** (`docs(muscu): §NNN jour-aware amorce PAP + transfert de force`).

### Task 5.3: Finish the branch (@superpowers:finishing-a-development-branch)
Present merge/PR options. **Do not push or deploy** without explicit user go-ahead (CLAUDE.md: deploy only via GitHub Actions on `main`).

---

## Open items to confirm during execution (flag, don't silently decide)
1. **`force_max`↔`maintien` substitution** on the development day is a periodization decision — surface in preview reasoning for coach validation.
2. **Force-bias threshold** (`<60`, sprint distances) is tunable — keep it one named constant.
3. **Multiple development days** (e.g., Lun/Mar/Mer/Jeu) — current rule: all non-primer days are `developpement`; avoid two max-load days back-to-back if it becomes an issue (YAGNI for now — her case is one dev day).
4. **Empty partial first week** (start date after the week's last chosen day) — decide: accept an empty week 1 or shift the start. Default: accept (arc still 7 weeks from `p_start_week_monday`).
5. **Persisting `weekdays` on the assessment** vs payload-only — payload-only is enough for v1.

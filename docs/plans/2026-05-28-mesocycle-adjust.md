# Mesocycle Adjust — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Enable a coach to adjust the active mesocycle of an athlete mid-cycle via 3 levers — charge (vol+int separate), sessions/week (count + weekdays), focus re-prioritization (refreshed bilan) — with a pivot picker and a 1-level undo.

**Architecture:** Re-roll the engine partially from a pivot week (extends `mesocycleEngine.ts` with `startPhase`), apply coach factors as post-processing (`applyAdjustmentFactors`), reuse `apply_strength_mesocycle` RPC (snapshot §308 + table rase §328 = free undo). New `MesocycleAdjust.tsx` screen, new entry button on `CoachMesocyclePanel.tsx`. Preview reuses `MesocyclePreview.tsx`.

**Tech Stack:** TypeScript 5, React 19, Vite 7, Tailwind 4, Radix UI, React Query 5, Wouter routing, node:test (unit) + vitest jsdom (UI), Supabase Postgres.

**Design doc:** `docs/plans/2026-05-28-mesocycle-adjust-design.md` — read it before starting.

**Pre-requisite:** branch already exists: `feat/mesocycle-adjust` (created from `origin/main` on 2026-05-28).

---

## Slice A — Engine extensions (pure functions, TDD)

Pure helpers first. No UI dependency. Each task is RED → GREEN → commit.

### Task A1: `phaseAtWeek` helper

**Goal:** Given a periodization template and a 0-based week index, return the phase key at that week.

**Files:**
- Create: `src/lib/strength/phaseAtWeek.ts`
- Test: `src/lib/strength/__tests__/phaseAtWeek.test.ts`

**Background:** A template has `phases: [{ cycle, min_weeks, nominal_weeks, max_weeks, intention }]`. We need to walk those phases according to a *target plan length* (the engine already does this in `periodize()`). For now, walk against `nominal_weeks` (the default expansion). Defer "what plan actually allocated" to caller if it ever needs it.

**Step 1: Write the failing test**

```ts
// src/lib/strength/__tests__/phaseAtWeek.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseAtWeek } from '../phaseAtWeek';
import type { PeriodizationTemplate } from '../mesocycleEngine.types';

// T8 sprint_50 inter_competition : maintien(1) → puissance(2) → affutage(1) → pic(1)
const T8: PeriodizationTemplate = {
  id: 'test-t8',
  event_group: 'sprint_50',
  name: 'T8',
  kind: 'inter_competition',
  structure: {
    phases: [
      { cycle: 'maintien', min_weeks: 1, nominal_weeks: 1, max_weeks: 2, intention: '' },
      { cycle: 'puissance', min_weeks: 2, nominal_weeks: 2, max_weeks: 3, intention: '' },
      { cycle: 'affutage', min_weeks: 1, nominal_weeks: 1, max_weeks: 2, intention: '' },
      { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1, intention: '' },
    ],
  },
  min_week_count: 5,
  max_week_count: 8,
};

test('phaseAtWeek: week 0 of nominal T8 → maintien', () => {
  assert.equal(phaseAtWeek(T8, 0), 'maintien');
});

test('phaseAtWeek: week 1 of nominal T8 → puissance (1st puissance week)', () => {
  assert.equal(phaseAtWeek(T8, 1), 'puissance');
});

test('phaseAtWeek: week 2 of nominal T8 → puissance (2nd puissance week)', () => {
  assert.equal(phaseAtWeek(T8, 2), 'puissance');
});

test('phaseAtWeek: week 3 of nominal T8 → affutage', () => {
  assert.equal(phaseAtWeek(T8, 3), 'affutage');
});

test('phaseAtWeek: week 4 of nominal T8 → pic', () => {
  assert.equal(phaseAtWeek(T8, 4), 'pic');
});

test('phaseAtWeek: week beyond nominal length → null', () => {
  assert.equal(phaseAtWeek(T8, 99), null);
});

test('phaseAtWeek: negative weekIndex → null', () => {
  assert.equal(phaseAtWeek(T8, -1), null);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/strength/__tests__/phaseAtWeek.test.ts`
Expected: FAIL with "Cannot find module '../phaseAtWeek'"

**Step 3: Write minimal implementation**

```ts
// src/lib/strength/phaseAtWeek.ts
import type { PeriodizationTemplate, PhaseKey } from './mesocycleEngine.types';

/**
 * §[NUM] — Given a periodization template and a 0-based week index, return
 * the phase key at that week (walking nominal_weeks).
 *
 * Returns null if weekIndex is out of range. Used by the mid-cycle adjust
 * screen to preserve the phase sequence when re-rolling the engine from a
 * pivot (avoid rewinding to phase 1 when the pivot falls in mid-cycle).
 */
export function phaseAtWeek(
  template: PeriodizationTemplate,
  weekIndex0: number,
): PhaseKey | null {
  if (weekIndex0 < 0) return null;
  let acc = 0;
  for (const phase of template.structure.phases) {
    acc += phase.nominal_weeks;
    if (weekIndex0 < acc) return phase.cycle;
  }
  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/strength/__tests__/phaseAtWeek.test.ts`
Expected: PASS — 7/7

**Step 5: Commit**

```bash
git add src/lib/strength/phaseAtWeek.ts src/lib/strength/__tests__/phaseAtWeek.test.ts
git commit -m "feat(meso-adjust): phaseAtWeek helper (pure, 7 tests)"
```

---

### Task A2: `applyAdjustmentFactors` helper

**Goal:** Multiply `sets` and `pct_1rm` of every item in a generated plan by coach factors, preserving plio items (pct=0) untouched.

**Files:**
- Create: `src/lib/strength/adjustmentFactors.ts`
- Test: `src/lib/strength/__tests__/adjustmentFactors.test.ts`

**Background:** A `GeneratedMesocycle` is `{ weeks: WeekPlan[] }` where each week has `sessions: SessionPlan[]` and each session has `items: ItemPlan[]`. ItemPlan has at least `sets: number, reps: number, pct_1rm: number | null, rest_series_s: number`. Read the existing types in `src/lib/strength/mesocycleEngine.types.ts` before writing the test.

**Step 1: Read the existing types**

Run: `grep -n "GeneratedMesocycle\|ItemPlan\|SessionPlan\|WeekPlan" src/lib/strength/mesocycleEngine.types.ts`
Note the exact field names. Adjust the test below if they differ.

**Step 2: Write the failing test**

```ts
// src/lib/strength/__tests__/adjustmentFactors.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAdjustmentFactors } from '../adjustmentFactors';
import type { GeneratedMesocycle } from '../mesocycleEngine.types';

function makePlan(items: Array<{ sets: number; pct_1rm: number | null }>): GeneratedMesocycle {
  return {
    totalWeeks: 1,
    weeks: [{
      weekIndex: 0,
      cycle: 'puissance',
      sessions: [{
        dayOfWeek: 1,
        name: 'test',
        items: items.map((it, i) => ({
          ordre: i + 1,
          block: 'main',
          cycle_type: 'force',
          exercise_id: 1,
          sets: it.sets,
          reps: 3,
          pct_1rm: it.pct_1rm,
          rest_series_s: 180,
          notes: null,
        })),
      }],
    }],
    // …completer avec les autres champs requis par GeneratedMesocycle
    // (lire mesocycleEngine.types.ts pour les défauts à mettre)
  } as unknown as GeneratedMesocycle;
}

test('applyAdjustmentFactors: vol=0.8, int=1.0 → sets ×0.8, pct unchanged', () => {
  const plan = makePlan([{ sets: 5, pct_1rm: 85 }]);
  const out = applyAdjustmentFactors(plan, 0.8, 1.0);
  assert.equal(out.weeks[0].sessions[0].items[0].sets, 4); // 5*0.8=4
  assert.equal(out.weeks[0].sessions[0].items[0].pct_1rm, 85);
});

test('applyAdjustmentFactors: vol=1.0, int=0.85 → pct ×0.85, sets unchanged', () => {
  const plan = makePlan([{ sets: 5, pct_1rm: 85 }]);
  const out = applyAdjustmentFactors(plan, 1.0, 0.85);
  assert.equal(out.weeks[0].sessions[0].items[0].sets, 5);
  assert.equal(out.weeks[0].sessions[0].items[0].pct_1rm, Math.round(85 * 0.85)); // 72
});

test('applyAdjustmentFactors: sets clamp ≥ 1', () => {
  const plan = makePlan([{ sets: 1, pct_1rm: 70 }]);
  const out = applyAdjustmentFactors(plan, 0.1, 1.0);
  assert.equal(out.weeks[0].sessions[0].items[0].sets, 1); // not 0
});

test('applyAdjustmentFactors: pct_1rm clamp [0, 100]', () => {
  const plan = makePlan([{ sets: 5, pct_1rm: 90 }]);
  const out = applyAdjustmentFactors(plan, 1.0, 1.5);
  assert.equal(out.weeks[0].sessions[0].items[0].pct_1rm, 100); // 90*1.5=135 clamped
});

test('applyAdjustmentFactors: plio item (pct_1rm=0) intensity untouched', () => {
  const plan = makePlan([{ sets: 4, pct_1rm: 0 }]);
  const out = applyAdjustmentFactors(plan, 1.0, 0.85);
  assert.equal(out.weeks[0].sessions[0].items[0].pct_1rm, 0); // stays 0
});

test('applyAdjustmentFactors: plio item (pct_1rm=null) intensity untouched', () => {
  const plan = makePlan([{ sets: 4, pct_1rm: null }]);
  const out = applyAdjustmentFactors(plan, 1.0, 0.85);
  assert.equal(out.weeks[0].sessions[0].items[0].pct_1rm, null);
});

test('applyAdjustmentFactors: identity (1.0, 1.0) → unchanged', () => {
  const plan = makePlan([{ sets: 5, pct_1rm: 85 }, { sets: 3, pct_1rm: 60 }]);
  const out = applyAdjustmentFactors(plan, 1.0, 1.0);
  assert.deepEqual(out.weeks[0].sessions[0].items.map(i => i.sets), [5, 3]);
  assert.deepEqual(out.weeks[0].sessions[0].items.map(i => i.pct_1rm), [85, 60]);
});

test('applyAdjustmentFactors: factor 0 throws (defensive)', () => {
  const plan = makePlan([{ sets: 5, pct_1rm: 85 }]);
  assert.throws(() => applyAdjustmentFactors(plan, 0, 1.0));
});
```

**Step 3: Run test to verify it fails**

Run: `node --test src/lib/strength/__tests__/adjustmentFactors.test.ts`
Expected: FAIL (module not found)

**Step 4: Write minimal implementation**

```ts
// src/lib/strength/adjustmentFactors.ts
import type { GeneratedMesocycle } from './mesocycleEngine.types';

/**
 * §[NUM] — Pure post-processing applied AFTER generateMesocycle() to scale
 * sets and pct_1rm by coach-driven factors (mid-cycle adjust feature).
 *
 * Rules:
 *  - sets *= volumeFactor, rounded, clamped ≥ 1
 *  - pct_1rm *= intensityFactor, rounded, clamped [0, 100]
 *  - items with pct_1rm = 0 OR null (plio, BW) keep pct_1rm intact — the
 *    "intensity" of a plio item is not a percentage, scaling it is meaningless.
 *  - throws on factor ≤ 0 (defensive — sliders are clamped UI-side anyway)
 */
export function applyAdjustmentFactors(
  plan: GeneratedMesocycle,
  volumeFactor: number,
  intensityFactor: number,
): GeneratedMesocycle {
  if (!(volumeFactor > 0)) throw new Error('volumeFactor must be > 0');
  if (!(intensityFactor > 0)) throw new Error('intensityFactor must be > 0');

  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => ({
        ...session,
        items: session.items.map((item) => ({
          ...item,
          sets: Math.max(1, Math.round(item.sets * volumeFactor)),
          pct_1rm:
            item.pct_1rm == null || item.pct_1rm === 0
              ? item.pct_1rm
              : Math.max(0, Math.min(100, Math.round(item.pct_1rm * intensityFactor))),
        })),
      })),
    })),
  };
}
```

**Step 5: Run test to verify it passes**

Run: `node --test src/lib/strength/__tests__/adjustmentFactors.test.ts`
Expected: PASS — 8/8

**Step 6: Commit**

```bash
git add src/lib/strength/adjustmentFactors.ts src/lib/strength/__tests__/adjustmentFactors.test.ts
git commit -m "feat(meso-adjust): applyAdjustmentFactors (pure, 8 tests)"
```

---

### Task A3: Extend `MesocycleInput` type with `startPhase`

**Goal:** Add the new optional input field. No behavior change yet — that comes in A4.

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.types.ts`

**Step 1: Read the current type**

Run: `grep -n "interface MesocycleInput\|type MesocycleInput\|PhaseKey" src/lib/strength/mesocycleEngine.types.ts`
Identify the existing `PhaseKey` union and the `MesocycleInput` interface.

**Step 2: Add the field**

In the `MesocycleInput` interface, add:

```ts
/**
 * §[NUM] (meso-adjust) — Optional phase to start the periodization from,
 * instead of phase 1 of the template. Used by the mid-cycle adjust feature:
 * if the pivot falls in the puissance phase of the original plan, passing
 * startPhase='puissance' makes periodize() truncate the template's earlier
 * phases so the re-rolled plan continues at the right point.
 *
 * If null/undefined → behaves as before (start at phase 1).
 */
startPhase?: PhaseKey | null;
```

**Step 3: Type-check the project**

Run: `npx tsc --noEmit`
Expected: 0 errors. The field is optional, so no callers need updates yet.

**Step 4: Commit**

```bash
git add src/lib/strength/mesocycleEngine.types.ts
git commit -m "feat(meso-adjust): startPhase optional field on MesocycleInput"
```

---

### Task A4: Extend `periodize()` to honor `startPhase`

**Goal:** When `startPhase` is provided, truncate the template's phases from that phase onward, then run the existing periodize logic against the truncated phases. Fallback: if `startPhase` is not in the template, keep all phases (no error — defensive).

**Files:**
- Modify: `src/lib/strength/mesocycleEngine.ts` (function `periodize`, around line 514)
- Modify: `src/lib/strength/__tests__/mesocycleEngine.test.ts` (add tests)

**Background:** `periodize()` walks `template.phases`, expanding `min_weeks/nominal_weeks/max_weeks` to fit `targetWeekCount`. Find the function (line ~514 per the existing grep). Read the whole function before editing.

**Step 1: Read the existing periodize**

Run: `sed -n '500,580p' src/lib/strength/mesocycleEngine.ts`
(Or open the file in Read tool, offset 500, limit 100.)
Note the exact signature and how it accesses `template.phases`.

**Step 2: Write the failing tests**

Append to `src/lib/strength/__tests__/mesocycleEngine.test.ts`:

```ts
// — §[NUM] meso-adjust: startPhase truncates template phases

test('periodize: startPhase=puissance truncates maintien from T8', () => {
  // T8 = maintien(1) → puissance(2) → affutage(1) → pic(1) — nominal 5w
  const template = makeT8Template(); // helper – see existing test setup
  // Avec startPhase='puissance' et targetWeekCount=4, on doit avoir
  // puissance(2) + affutage(1) + pic(1) = 4 semaines (pas de maintien).
  const result = periodize(template, 4, 'puissance');
  assert.equal(result.length, 4);
  assert.equal(result[0].cycle, 'puissance');
  assert.equal(result[1].cycle, 'puissance');
  assert.equal(result[2].cycle, 'affutage');
  assert.equal(result[3].cycle, 'pic');
});

test('periodize: startPhase=affutage with 2w → affutage(1) + pic(1)', () => {
  const template = makeT8Template();
  const result = periodize(template, 2, 'affutage');
  assert.equal(result.length, 2);
  assert.equal(result[0].cycle, 'affutage');
  assert.equal(result[1].cycle, 'pic');
});

test('periodize: startPhase=pic with 1w → pic only', () => {
  const template = makeT8Template();
  const result = periodize(template, 1, 'pic');
  assert.equal(result.length, 1);
  assert.equal(result[0].cycle, 'pic');
});

test('periodize: startPhase not in template → behaves as if startPhase omitted', () => {
  const template = makeT8Template();
  const withStart = periodize(template, 5, 'force_max'); // force_max absent de T8
  const without = periodize(template, 5);
  assert.deepEqual(
    withStart.map(w => w.cycle),
    without.map(w => w.cycle),
  );
});

test('periodize: startPhase + weeks below min remaining throws', () => {
  const template = makeT8Template();
  // affutage(min=1) + pic(min=1) = 2 min, asking for 1 must throw
  assert.throws(() => periodize(template, 1, 'affutage'));
});
```

(If `makeT8Template` doesn't exist in the test file, inline it from the design doc Section 1 or grep for similar helpers in existing tests.)

**Step 3: Run tests to verify they fail**

Run: `node --test src/lib/strength/__tests__/mesocycleEngine.test.ts`
Expected: 5 new tests fail (current `periodize` ignores `startPhase`).

**Step 4: Modify `periodize`**

In `src/lib/strength/mesocycleEngine.ts`, change the signature and body:

```ts
export function periodize(
  template: PeriodizationTemplate,
  targetWeekCount: number,
  startPhase?: PhaseKey | null,
): WeekPlan[] {
  // §[NUM] (meso-adjust) — truncate phases from startPhase if provided.
  // If startPhase not found in template → ignore it (defensive: handles
  // template changed between original generation and adjust).
  let phases = template.structure.phases;
  if (startPhase) {
    const idx = phases.findIndex((p) => p.cycle === startPhase);
    if (idx > 0) phases = phases.slice(idx);
  }

  // ... reste de la fonction inchangée (utiliser `phases` au lieu de
  // `template.structure.phases`)
}
```

Carefully replace **every** `template.structure.phases` inside the function body with the local `phases` variable.

**Step 5: Type-check and run tests**

Run: `npx tsc --noEmit && node --test src/lib/strength/__tests__/mesocycleEngine.test.ts`
Expected: tsc 0, all tests pass (existing + 5 new).

**Step 6: Commit**

```bash
git add src/lib/strength/mesocycleEngine.ts src/lib/strength/__tests__/mesocycleEngine.test.ts
git commit -m "feat(meso-adjust): periodize honors startPhase (5 tests RED→GREEN)"
```

---

### Task A5: Integration test — generate + factors end-to-end

**Goal:** Single test that wires `generateMesocycle(input + startPhase) → applyAdjustmentFactors → snapshot`. Confirms the public surface works as a whole.

**Files:**
- Create: `src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts`

**Step 1: Write the test**

```ts
// src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMesocycle } from '../mesocycleEngine';
import { applyAdjustmentFactors } from '../adjustmentFactors';
// Réutiliser les helpers de setup déjà présents dans mesocycleEngine.test.ts
// (à importer ou dupliquer le minimum nécessaire — préférer l'extraction
// dans `__tests__/_helpers.ts` si pas encore fait).

test('integration: adjust from puissance week, vol=0.8 int=0.9', () => {
  const input = makeMinimalInput({ targetWeekCount: 4, startPhase: 'puissance' });
  const generated = generateMesocycle(input);
  const adjusted = applyAdjustmentFactors(generated, 0.8, 0.9);

  // Plan tronqué : 4 sem démarrant à puissance
  assert.equal(adjusted.totalWeeks, 4);
  assert.equal(adjusted.weeks[0].cycle, 'puissance');

  // Facteurs appliqués : aucun item ne doit avoir sets > original*0.8
  for (const week of adjusted.weeks) {
    for (const session of week.sessions) {
      for (const item of session.items) {
        assert.ok(item.sets >= 1, 'sets clamped ≥1');
        if (item.pct_1rm != null && item.pct_1rm > 0) {
          assert.ok(item.pct_1rm <= 100, 'pct ≤100');
        }
      }
    }
  }
});

test('integration: identity factors → equivalent to generateMesocycle alone', () => {
  const input = makeMinimalInput({ targetWeekCount: 5 });
  const direct = generateMesocycle(input);
  const adjusted = applyAdjustmentFactors(direct, 1.0, 1.0);
  // Identity facteurs : sets et pct identiques partout
  const allItemsDirect = direct.weeks.flatMap(w => w.sessions.flatMap(s => s.items));
  const allItemsAdjusted = adjusted.weeks.flatMap(w => w.sessions.flatMap(s => s.items));
  assert.deepEqual(
    allItemsDirect.map(i => ({ sets: i.sets, pct: i.pct_1rm })),
    allItemsAdjusted.map(i => ({ sets: i.sets, pct: i.pct_1rm })),
  );
});
```

**Step 2: Run and verify**

Run: `node --test src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts`
Expected: 2/2 pass.

**Step 3: Run the full strength test suite to catch regressions**

Run: `node --test src/lib/strength/__tests__/**/*.test.ts`
Expected: all pass (existing + new).

**Step 4: Commit**

```bash
git add src/lib/strength/__tests__/mesocycleAdjust.integration.test.ts
git commit -m "test(meso-adjust): integration generate+factors (2 tests)"
```

---

### Task A6: Final type-check + full test suite + push

**Goal:** Confirm Slice A is green end-to-end, push the branch (still no UI).

**Step 1:** Run `npx tsc --noEmit` — expected 0 errors.
**Step 2:** Run `npm test` — expected: all node:test + vitest pass.
**Step 3:** Run `npm run build` — expected: build OK.
**Step 4:** `git push origin feat/mesocycle-adjust`.

End of Slice A. Decide with the user whether to continue to Slice B in the same session or pause.

---

## Slice B — UI + branchement coach

### Task B1: API helper `getCurrentMesocyclePhaseInfo`

**Goal:** Given an active mesocycle row (already loaded by React Query) and a target pivot date, derive `{ phaseKey, weekIndex, weeksRemaining, totalWeeks }`. Pure helper.

**Files:**
- Modify: `src/lib/api/strength-mesocycles.ts` (add an exported helper, NOT a Supabase call — purely computed)
- Test: `src/lib/api/__tests__/strength-mesocycles-phase.test.ts`

**Background:** A mesocycle has a `generated_at` timestamp and `target_week_count`. Determine the start Monday of the mesocycle (from `strength_planning_slot_overrides.week_start` MIN, or from the first matérialisation). The pivot week index = `(pivotDate - startMonday) / 7`.

**Step 1: Check what we already know about the méso start week**

Run: `grep -n "generated_at\|week_start\|start_date\|started_at" src/lib/api/strength-mesocycles.ts`
Determine whether the API already exposes a start-Monday helper.

**Step 2: Write the test**

```ts
// src/lib/api/__tests__/strength-mesocycles-phase.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentMesocyclePhaseInfo } from '../strength-mesocycles';
import { phaseAtWeek } from '@/lib/strength/phaseAtWeek';

const T8 = {
  // ... même template que A1
};

test('getCurrentMesocyclePhaseInfo: pivot at week 2 → puissance, 4 weeks remaining', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: '2026-06-01', // S1 starts Mon June 1
    totalWeeks: 6,
    template: T8,
    pivotMonday: '2026-06-15', // = S3 = week index 2
  });
  assert.equal(info.weekIndex, 2);
  assert.equal(info.weeksRemaining, 4); // 6 - 2 = 4
  assert.equal(info.phaseKey, 'puissance');
});

test('getCurrentMesocyclePhaseInfo: pivot before méso start clamps weekIndex=0', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: '2026-06-01',
    totalWeeks: 6,
    template: T8,
    pivotMonday: '2026-05-25', // BEFORE
  });
  assert.equal(info.weekIndex, 0);
  assert.equal(info.weeksRemaining, 6);
});

test('getCurrentMesocyclePhaseInfo: pivot after end → weeksRemaining 0', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: '2026-06-01',
    totalWeeks: 6,
    template: T8,
    pivotMonday: '2026-08-01',
  });
  assert.equal(info.weeksRemaining, 0);
});
```

**Step 3: Implementation**

```ts
// src/lib/api/strength-mesocycles.ts (append, near other pure helpers)
import { phaseAtWeek } from '@/lib/strength/phaseAtWeek';

export interface MesocyclePhaseInfo {
  weekIndex: number;
  weeksRemaining: number;
  phaseKey: PhaseKey | null;
}

export function getCurrentMesocyclePhaseInfo(args: {
  startMonday: string;
  totalWeeks: number;
  template: PeriodizationTemplate;
  pivotMonday: string;
}): MesocyclePhaseInfo {
  const start = new Date(args.startMonday + 'T00:00:00Z').getTime();
  const pivot = new Date(args.pivotMonday + 'T00:00:00Z').getTime();
  const diffWeeks = Math.floor((pivot - start) / (7 * 86_400_000));
  const weekIndex = Math.max(0, Math.min(args.totalWeeks, diffWeeks));
  const weeksRemaining = Math.max(0, args.totalWeeks - weekIndex);
  return {
    weekIndex,
    weeksRemaining,
    phaseKey: weeksRemaining > 0 ? phaseAtWeek(args.template, weekIndex) : null,
  };
}
```

**Step 4: Run tests and tsc**

Run: `node --test src/lib/api/__tests__/strength-mesocycles-phase.test.ts && npx tsc --noEmit`
Expected: 3/3 + 0 tsc errors.

**Step 5: Commit**

```bash
git add src/lib/api/strength-mesocycles.ts src/lib/api/__tests__/strength-mesocycles-phase.test.ts
git commit -m "feat(meso-adjust): getCurrentMesocyclePhaseInfo helper (3 tests)"
```

---

### Task B2: Route + skeleton `MesocycleAdjust.tsx`

**Goal:** Empty screen + route so navigation works, even if the form is not yet wired.

**Files:**
- Create: `src/pages/MesocycleAdjust.tsx`
- Modify: `src/App.tsx` (or wherever routes live — `grep -n "MesocycleGeneration\|MesocyclePreview" src/App.tsx`)

**Step 1: Find existing route patterns**

Run: `grep -n "mesocycle-generate\|MesocyclePreview\|lazyWithRetry" src/App.tsx | head -10`
Note the exact pattern used for the other mesocycle routes (lazy import, route declaration).

**Step 2: Create the skeleton**

```tsx
// src/pages/MesocycleAdjust.tsx
import { useRoute, useLocation } from 'wouter';

/**
 * §[NUM] — Coach screen to adjust an active mesocycle mid-cycle.
 * Design doc: docs/plans/2026-05-28-mesocycle-adjust-design.md
 */
export default function MesocycleAdjust() {
  const [, params] = useRoute<{ athleteId: string }>('/strength/mesocycle-adjust/:athleteId');
  const [, navigate] = useLocation();
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold">Ajuster le mésocycle (TODO)</h1>
      <p className="text-sm text-muted-foreground">Athlète {params?.athleteId}</p>
      <button onClick={() => navigate(`/coach/swimmer/${params?.athleteId}`)}>
        ← Retour
      </button>
    </div>
  );
}
```

**Step 3: Wire the route**

In `src/App.tsx` (use the same pattern as `MesocyclePreview`):

```tsx
const MesocycleAdjust = lazyWithRetry(() => import('./pages/MesocycleAdjust'));
// ... dans le Switch :
<Route path="/strength/mesocycle-adjust/:athleteId" component={MesocycleAdjust} />
```

**Step 4: Verify it loads**

Run: `npm run dev` (background or another terminal). Navigate to `http://localhost:8080/#/strength/mesocycle-adjust/18`. Expected: skeleton renders.

Stop the dev server before committing.

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

**Step 6: Commit**

```bash
git add src/pages/MesocycleAdjust.tsx src/App.tsx
git commit -m "feat(meso-adjust): MesocycleAdjust skeleton + route"
```

---

### Task B3: `MesocycleAdjust` form (data loading + state)

**Goal:** Load the active mesocycle + assessment + template, derive phase info, render form (pivot picker, sessions, sliders, refaire-bilan link).

**Files:**
- Modify: `src/pages/MesocycleAdjust.tsx`

**Step 1: Find existing data hooks for inspiration**

Run: `grep -n "useQuery.*mesocycle\|getActiveMesocycle\|getStrengthAssessment" src/pages/MesocyclePreview.tsx | head -10`
Reuse the same React Query keys + functions.

**Step 2: Build the form**

(Refer to design doc Section 2 for the mock.) Key state:

```tsx
const [pivotMonday, setPivotMonday] = useState<string>(getNextMonday());
const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(currentMeso.sessions_per_week);
const [weekdays, setWeekdays] = useState<number[]>(currentMeso.weekdays ?? [1, 3, 5]);
const [volumeFactor, setVolumeFactor] = useState<number>(1.0);
const [intensityFactor, setIntensityFactor] = useState<number>(1.0);
```

Derive phase info:

```tsx
const phaseInfo = useMemo(
  () => template && currentMeso
    ? getCurrentMesocyclePhaseInfo({
        startMonday: getMesoStartMonday(currentMeso),
        totalWeeks: currentMeso.target_week_count,
        template,
        pivotMonday,
      })
    : null,
  [template, currentMeso, pivotMonday],
);
```

Bannière logic:

```tsx
const today = todayIsoDate();
const thisMonday = mondayOf(today);
const pivotState =
  pivotMonday < thisMonday ? 'past'
  : pivotMonday === thisMonday ? 'current'
  : 'future';
```

Disable preview button if `phaseInfo?.weeksRemaining < 1`.

**Step 3: Render**

Use `@/components/ui/...` Shadcn primitives (Card, Button, Slider, RadioGroup, Checkbox).

**Step 4: Type-check + manual smoke**

Run: `npx tsc --noEmit && npm run dev`
Navigate, verify form renders with data for Ines (id=18).

**Step 5: Commit**

```bash
git add src/pages/MesocycleAdjust.tsx
git commit -m "feat(meso-adjust): form (pivot/sessions/sliders/banner)"
```

---

### Task B4: "Aperçu" wired to MesocyclePreview

**Goal:** Click "Aperçu" → persist current form state to sessionStorage, navigate to `MesocyclePreview` in `mode=adjust`. The Preview reads back the state, calls `generateMesocycle(input + startPhase) → applyAdjustmentFactors → render`.

**Files:**
- Modify: `src/pages/MesocycleAdjust.tsx` (Aperçu button handler)
- Modify: `src/pages/MesocyclePreview.tsx` (recognize `?mode=adjust`)

**Step 1: SessionStorage key + payload shape**

```ts
const ADJUST_KEY = 'eac_meso_adjust_pending';
interface AdjustPayload {
  athleteId: number;
  pivotMonday: string;
  sessionsPerWeek: number;
  weekdays: number[];
  volumeFactor: number;
  intensityFactor: number;
  startPhase: PhaseKey;
  weeksRemaining: number;
}
```

**Step 2: In `MesocycleAdjust`:**

```tsx
const handleApercu = () => {
  if (!phaseInfo || phaseInfo.weeksRemaining < 1) return;
  const payload: AdjustPayload = {
    athleteId: Number(params.athleteId),
    pivotMonday,
    sessionsPerWeek,
    weekdays,
    volumeFactor,
    intensityFactor,
    startPhase: phaseInfo.phaseKey!,
    weeksRemaining: phaseInfo.weeksRemaining,
  };
  sessionStorage.setItem(ADJUST_KEY, JSON.stringify(payload));
  navigate(`/strength/mesocycle-preview?mode=adjust&athleteId=${payload.athleteId}`);
};
```

**Step 3: In `MesocyclePreview`:**

At the top of the component, after loading the assessment etc.:

```tsx
const isAdjustMode = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('mode') === 'adjust';
const adjustPayload = useMemo(() => {
  if (!isAdjustMode) return null;
  try { return JSON.parse(sessionStorage.getItem(ADJUST_KEY) ?? 'null') as AdjustPayload | null; }
  catch { return null; }
}, [isAdjustMode]);
```

Use `adjustPayload` to override the engine input:
- `targetWeekCount = adjustPayload.weeksRemaining`
- `sessionsPerWeek = adjustPayload.sessionsPerWeek`
- `weekdays = adjustPayload.weekdays`
- `startPhase = adjustPayload.startPhase`

After `generateMesocycle()`, if `isAdjustMode`:

```ts
const adjusted = applyAdjustmentFactors(generated, adjustPayload.volumeFactor, adjustPayload.intensityFactor);
```

When the user clicks "Appliquer" in adjust mode, use `pivotMonday` as the `startDate` argument to `applyMesocycle()`.

**Step 4: Manual smoke (Ines flow)**

Navigate `/coach/swimmer/18` → "Ajuster" → set sliders → "Aperçu" → verify diff shown, click "Appliquer" → verify the planif coach is updated.

**Step 5: Commit**

```bash
git add src/pages/MesocycleAdjust.tsx src/pages/MesocyclePreview.tsx
git commit -m "feat(meso-adjust): wire Aperçu → MesocyclePreview adjust mode"
```

---

### Task B5: "Ajuster le méso" entry button on coach panel

**Files:**
- Modify: `src/components/coach/CoachMesocyclePanel.tsx` (819 LOC)

**Step 1: Find the right place for the button**

Run: `grep -n "active\|status === 'active'\|mesocycle-generate\|Bouton\|button" src/components/coach/CoachMesocyclePanel.tsx | head -20`
Add the button near the existing "Generate" / "Revert" controls.

**Step 2: Add the button**

```tsx
{activeMesocycle && (
  <Button
    variant="outline"
    onClick={() => navigate(`/strength/mesocycle-adjust/${athleteId}`)}
  >
    Ajuster le méso
  </Button>
)}
```

**Step 3: tsc + smoke**

Run: `npx tsc --noEmit && npm run dev`
Verify the button appears on Ines's coach panel when a méso is active.

**Step 4: Commit**

```bash
git add src/components/coach/CoachMesocyclePanel.tsx
git commit -m "feat(meso-adjust): 'Ajuster le méso' entry button on coach panel"
```

---

### Task B6: Vitest UI tests for `MesocycleAdjust`

**Files:**
- Create: `src/pages/MesocycleAdjust.vitest.tsx`

**Step 1: Reuse mock setup from existing vitest files**

Run: `ls src/pages/*.vitest.tsx` — read one for the mock pattern.

**Step 2: Write tests**

```tsx
// src/pages/MesocycleAdjust.vitest.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MesocycleAdjust from './MesocycleAdjust';

// Mocks: useRoute, useLocation (wouter), useQuery (react-query)
// (réutiliser le pattern du test SwimmerFormBadge.vitest.tsx ou CoachSwimmerFullView.vitest.tsx)

describe('MesocycleAdjust', () => {
  it('default pivot = lundi prochain', () => {
    render(<MesocycleAdjust />);
    // assert pivot input value matches next-monday()
  });

  it('preset Allègement sets vol=0.8, int=0.9', () => {
    render(<MesocycleAdjust />);
    // click "Allègement", assert sliders' aria-valuenow
  });

  it('Aperçu button disabled if weeksRemaining<1', () => {
    // mock currentMeso with totalWeeks=1, pivot past end
    render(<MesocycleAdjust />);
    expect(screen.getByText('Aperçu')).toBeDisabled();
  });

  it('bannière rouge si pivot < this Monday', () => {
    // mock pivot in past
    render(<MesocycleAdjust />);
    expect(screen.getByText(/doit être/i)).toBeInTheDocument();
  });
});
```

**Step 3: Run**

Run: `npx vitest run src/pages/MesocycleAdjust.vitest.tsx`
Expected: 4/4 pass.

**Step 4: Commit**

```bash
git add src/pages/MesocycleAdjust.vitest.tsx
git commit -m "test(meso-adjust): MesocycleAdjust vitest (4 tests)"
```

---

### Task B7: Documentation + final § + push

**Goal:** Update `CLAUDE.md`, `docs/ROADMAP.md`, `docs/implementation-log.md` per the workflow obligatoire. Pick the correct § number at this point (check `main` for the latest §; expect §336 or §337 given §335 just landed).

**Step 1: Find next § number**

Run: `git fetch origin main && git log origin/main --oneline | head -5 | grep -oE '§[0-9]+' | sort -u`
Pick `latest + 1`.

**Step 2: Add `implementation-log.md` entry**

Append a `## §NNN — Ajustement mésocycle en cours (mid-cycle adjust) (2026-XX-XX)` section. Cover: contexte, cause/besoin, décisions, changements (files), tests, limites/différés.

**Step 3: Update `CLAUDE.md`** — only the "Dernier § livré" line (per CLAUDE.md rules: ≤15 mots).

**Step 4: Update `docs/ROADMAP.md`** — prepend a new "Dernière mise à jour" italic block with full description, demote previous to "Précédent".

**Step 5: Update `docs/claude/files-map.md`** — add lines for `MesocycleAdjust.tsx`, `adjustmentFactors.ts`, `phaseAtWeek.ts`, sized via `wc -l`.

**Step 6: Full test + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

**Step 7: Commit + push**

```bash
git add CLAUDE.md docs/ROADMAP.md docs/implementation-log.md docs/claude/files-map.md
git commit -m "docs(§NNN): mid-cycle mesocycle adjust feature livrée"
git push origin feat/mesocycle-adjust
```

**Step 8: Open PR**

```bash
gh pr create --title "feat(§NNN): mid-cycle mesocycle adjust" --body "$(cat <<'EOF'
## Summary
- Ajustement mid-cycle d'un méso actif via 3 leviers : charge (vol+int séparés), séances/sem, focus (refresh bilan)
- Re-roll engine partiel via nouveau `startPhase` + post-process `applyAdjustmentFactors`
- Réutilise `apply_strength_mesocycle` (snapshot §308 + table rase §328) → 1 niveau d'undo gratuit
- Nouveau `MesocycleAdjust.tsx` (route `/strength/mesocycle-adjust/:athleteId`), entrée depuis `CoachMesocyclePanel`

## Test plan
- [ ] tsc 0
- [ ] node:test : 8 (factors) + 5 (periodize) + 7 (phaseAtWeek) + 3 (phase-info) + 2 (intégration) tous verts
- [ ] vitest : 4 (UI MesocycleAdjust)
- [ ] E2E manuel : Ines, ajuste S3 → 3 sessions, vol -15%, vérif planif

Design : `docs/plans/2026-05-28-mesocycle-adjust-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Acceptance criteria

- `tsc --noEmit` : 0 errors
- `npm test` : all existing tests still pass + ≥ 22 new tests pass (7 phaseAtWeek + 8 factors + 5 periodize + 3 phase-info + 2 integration)
- `npx vitest run MesocycleAdjust.vitest.tsx` : 4/4
- `npm run build` : OK
- Manual E2E Ines : ajustement appliqué + revert ramène à l'état pré-ajustement

## Out of scope (documented in design)

- Multi-niveaux d'undo (1 seul retenu)
- Substitution d'exo en masse (séparé)
- Multi-coachs concurrent edits

## Reference

- Design doc : `docs/plans/2026-05-28-mesocycle-adjust-design.md`
- Snapshot/revert : §308
- Table rase : §328
- Date picker pattern : §307
- Post-apply nav fix : §326
- §335 (livré en parallèle par autre terminal) : ne pas confondre avec ce travail.

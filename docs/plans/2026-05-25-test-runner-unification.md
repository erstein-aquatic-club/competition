# Test-Runner Unification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task.

**Goal:** Make all 32 currently-inert `vitest`-importing test files actually execute — by porting ~29 to `node:test` and running the ~3 true-DOM hook tests under a scoped vitest+jsdom config — and add a guardrail so it can't silently recur.

**Architecture:** One canonical runner (`node:test`, already 131 files); vitest only for `*.vitest.ts(x)` (jsdom). Filename partition: `*.test.ts(x)` → node:test (existing glob); `*.vitest.ts(x)` → `vitest.config.unit.ts`. `npm test` runs both.

**Tech Stack:** node:test (`--experimental-test-module-mocks --import tsx`), vitest ^4 + jsdom ^28 + @testing-library/react (already devDeps), TypeScript.

**Design:** `docs/plans/2026-05-25-test-runner-unification-design.md`.

**Conversion reference (use throughout):**
| vitest | node:test |
|---|---|
| `import {describe,it,expect} from 'vitest'` | `import {describe,it} from 'node:test'; import assert from 'node:assert/strict'` |
| `toBe`/`toEqual` | `assert.equal`/`assert.deepEqual` |
| `toBeCloseTo(b,n)` | `assert.ok(Math.abs(a-b)<tol)` |
| `toThrow()`/`rejects` | `assert.throws(fn)`/`await assert.rejects(p)` |
| `toContain`/`toBeNull`/`toBeTruthy` | `assert.ok(a.includes(x))`/`assert.equal(a,null)`/`assert.ok(a)` |
| `vi.fn`/`vi.spyOn` | `import {mock} from 'node:test'` → `mock.fn`/`mock.method` |
| `vi.mock('m',f)` | `mock.module('m',{namedExports:…})` (see `strength-mesocycles.test.ts`) |
| component render | `renderToStaticMarkup(<…/>)` + HTML assertions (see `RestScreen.test.tsx`) |

**TRIAGE RULE (every task):** activating never-run tests will surface failures. Per file: diagnose **stale test expectation vs real code bug**. Fix test expectations; **never weaken an assertion to force green**. **If a real CODE bug surfaces, STOP and report it to the user** — do not fix product code as part of this chore.

**Per-file run command:** `npx tsx --test --experimental-test-module-mocks <file>` → must show real subtest count (`tests N`, N>1), not `tests 1`.

---

## Setup
`git checkout main && git checkout -b chore/test-runner-unification`

---

## Task 1 — Scoped vitest+jsdom config + move the 3 DOM hook tests

**Files:** Create `vitest.config.unit.ts`; rename 3 files; create/verify a vitest setup if needed.

**Step 1 — Read `vitest.config.e2e.ts`** to copy its plugin/resolve/alias setup (so `@/` + JSX work). Create `vitest.config.unit.ts` mirroring it but:
```ts
// vitest.config.unit.ts — unit tests requiring a real DOM (jsdom). §test-runner-unification.
// Only *.vitest.{ts,tsx} run here; everything else is node:test (npm test).
import { defineConfig } from 'vitest/config';
// + copy the SAME plugins (e.g. @vitejs/plugin-react) and resolve.alias ('@' -> ./src) used by vitest.config.e2e.ts
export default defineConfig({
  // plugins: [...], resolve: { alias: { '@': ... } },   // ← from e2e config
  test: {
    environment: 'jsdom',
    include: ['src/**/*.vitest.{ts,tsx}'],
    globals: true,
  },
});
```

**Step 2 — Rename the 3 interactive-hook tests (git mv):**
```bash
git mv src/hooks/__tests__/useDebouncedValue.test.ts   src/hooks/__tests__/useDebouncedValue.vitest.ts
git mv src/hooks/__tests__/useDelayedLoading.test.ts   src/hooks/__tests__/useDelayedLoading.vitest.ts
git mv src/hooks/__tests__/useInAppPushBridge.test.ts  src/hooks/__tests__/useInAppPushBridge.vitest.ts
```
(They keep their `vitest` imports — that's correct now.)

**Step 3 — Run them under the new config:** `npx vitest run --config vitest.config.unit.ts`. Expect the 3 files' real assertions to execute. **Triage** any failure per the rule (these have never run; `useInAppPushBridge` especially may need its `navigator.serviceWorker` spy setup adjusted for jsdom). If a real code bug appears, STOP and report.

**Step 4 — tsc:** `npx tsc --noEmit` → 0.

**Step 5 — Commit:**
```bash
git add vitest.config.unit.ts src/hooks/__tests__/*.vitest.ts
git commit -m "test(runner): scoped vitest+jsdom config for interactive hook tests (*.vitest.ts)" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — Wire `npm test` to run both runners

**Files:** `package.json`.

**Step 1 — Update the `test` script** to chain vitest unit after node:test:
```
"test": "node --test --experimental-test-module-mocks --import tsx \"src/**/*.test.ts\" \"src/**/*.test.tsx\" && vitest run --config vitest.config.unit.ts"
```
(`*.vitest.ts` is NOT matched by `*.test.ts`, so node:test ignores it — no double-run.)

**Step 2 — Verify both run:** `npm test` → node:test reports its suite AND vitest runs the 3 `.vitest.ts` files. Confirm the 3 hook tests now appear in the vitest section.

**Step 3 — Commit:** `git add package.json && git commit -m "test(runner): npm test runs node:test + scoped vitest unit config"` (+ co-author trailer).

---

## Task 3 — Port pure-logic batch 1 (lib + api)

**Files (port in place to node:test, per conversion ref):**
`src/lib/__tests__/strengthPlanningMerge.test.ts`, `swimPlanningMerge.test.ts`, `push.test.ts`, `chronoXlsxExport.test.ts`, `chrono-reducer.test.ts`, `chrono-types.test.ts`, `gifEncoder.test.ts`; `src/lib/api/__tests__/withTimeout.test.ts`, `assignments-slot.test.ts`; `src/lib/strength/__tests__/strengthPlanWeeks.test.ts`, `derivePlanByWeekDay.test.ts`.

**Per file:** convert imports+matchers → run `npx tsx --test --experimental-test-module-mocks <file>` → confirm real subtest count → triage failures (rule). **Commit the batch** once all green: `git add <files> && git commit -m "test(runner): port lib/api/strength pure-logic tests to node:test"` (+ trailer). Note any real-bug escalations in the report.

---

## Task 4 — Port pure-logic batch 2 (top-level + hooks + components)

**Files:**
`src/__tests__/prDetection.test.ts`, `useTrainingLoad.test.ts`, `swimAnalytics.test.ts`, `strengthHistoryUtils.test.ts`, `paceCalculator.test.ts`, `export-pace-pdf.test.ts`; `src/components/competition/__tests__/info-helpers.test.ts`; `src/hooks/__tests__/useStrengthPlanByISO.test.ts`, `useMyTeam.test.ts`, `useSlotCalendar.test.ts`; `src/hooks/dashboard/__tests__/dashboard-hooks.test.tsx`; `src/pages/coach/__tests__/CoachMySwimmersScreen.test.tsx`, `CoachPaceCalculatorScreen.test.tsx`.

**Per file:** same process. For the `.tsx` ones: if they render, use `renderToStaticMarkup` (like `RestScreen.test.tsx`); if they only test logic, just convert. If any actually needs a live DOM (renderHook/effects), STOP and propose moving it to `.vitest.ts` instead. **Commit the batch.**

---

## Task 5 — Port mock/DOM batch (trickiest)

**Files:** `src/lib/__tests__/offlineSync.test.ts`, `chrono-avatar-cache.test.ts` (→ `mock.module`/`mock.method`); `offlineQueue.test.ts`, `auth-state.test.ts`, `chrono-save-queue.test.ts` (DOM globals).

**Per file:**
- `vi.mock`/`vi.spyOn` → node `mock.module`/`mock.method` (model on `strength-mesocycles.test.ts`).
- DOM globals: add a minimal stub at top of file (e.g. `globalThis.localStorage = <map-backed stub>`, `globalThis.navigator ??= {…}`) IF that's all the test needs.
- **If a file genuinely needs jsdom** (real `document`/event/DOM-API surface a stub can't satisfy), DON'T force it: `git mv` it to `*.vitest.ts`, leave its vitest imports, and let `vitest.config.unit.ts` pick it up. Report which files you escalated.
- Run each, triage, **commit the batch.**

---

## Task 6 — Guardrail + full-suite verification

**Files:** Create `scripts/check-test-runner.mjs`; `package.json` (`pretest`).

**Step 1 — Guardrail script:**
```js
// scripts/check-test-runner.mjs — fail if any *.test.ts(x) imports from 'vitest' (inert under node --test).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const offenders = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); }
    else if (/\.test\.tsx?$/.test(e) && /from\s+['"]vitest['"]/.test(readFileSync(p, 'utf8'))) offenders.push(p);
  }
};
walk('src');
if (offenders.length) {
  console.error(`\n✖ ${offenders.length} *.test.ts(x) import from 'vitest' (inert under node --test).`);
  console.error("  → convert to node:test, or rename to *.vitest.ts(x) for the jsdom config.\n");
  offenders.forEach((o) => console.error('   - ' + o));
  process.exit(1);
}
console.log('✓ no vitest imports in *.test.ts(x)');
```

**Step 2 — Wire `pretest`:** add `"pretest": "node scripts/check-test-runner.mjs"` to `package.json` scripts. (Now `npm test` runs the guard first.)

**Step 3 — Run the guard:** `node scripts/check-test-runner.mjs` → must print ✓ (0 offenders). If it lists files, those weren't ported/renamed — finish them.

**Step 4 — Full suite:** `npm test` → guard ✓, then node:test all green, then vitest unit (the `.vitest.ts` files) green. `npx tsc --noEmit` → 0. Record the node:test total (should be **higher** than before — the ~29 ported files now contribute real subtests).

**Step 5 — Commit:** `git add scripts/check-test-runner.mjs package.json && git commit -m "test(runner): guardrail — block vitest imports in *.test.ts(x)"` (+ trailer).

---

## Task 7 — Documentation

**Step 1 — `docs/implementation-log.md`:** add a **Chore — Unification du runner de tests (2026-05-25)** entry: contexte (32 inertes), changements (29 portés node:test, 3 → `.vitest.ts` + `vitest.config.unit.ts`, `npm test` enchaîne, garde-fou), tests (totaux avant/après), décisions (`.vitest.ts` convention), **toute escalade de vrai bug code** rencontrée.
**Step 2 — `docs/ROADMAP.md`:** one line + `*Dernière mise à jour*`.
**Step 3 — `docs/claude/files-map.md`:** add `vitest.config.unit.ts` + `scripts/check-test-runner.mjs` (measured sizes).
**Step 4 — `CLAUDE.md`:** this is infra (not a muscu §) — do NOT change "Dernier § livré". Optionally note the test convention under § Tests if a fitting spot exists.
**Step 5 — Commit** with EXACT paths (NOT `git add docs/` — exclude the untracked WIP files `docs/muscu plan/`, `docs/pace-calculator-scenarios.pdf`, `docs/plans/2026-05-13-*`, `docs/prompts/2026-05-23-*`, and the §305 design/plan docs which belong to the §305 branch, not this one):
```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/claude/files-map.md
git commit -m "docs(test-runner): log + ROADMAP + files-map for runner unification" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Notes
- This branch is **independent of `feat/305-…`** (it branches from `main`). It does not touch `main`'s deploy gate.
- If many real code bugs surface during triage, pause and regroup with the user rather than expanding scope.

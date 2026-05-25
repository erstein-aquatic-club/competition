# Parcours bilan coach unifié + guidage amplitude — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the coach's hub-and-spoke bilan into a single guided "Continuer →" flow (questionnaire → KPIs → physique → génération) run in one sitting, with auto-resume, step-skip, an early incomplete-profile warning, a single entry point from the swimmer page, and animated per-axis ROM illustrations (angle arcs) for repeatable mobility scoring.

**Architecture:** Approach A — orchestrated multi-route flow. The existing pages stay as routes; we add a **pure resolver** (`nextBilanStep`) that derives the current step from assessment status + KPI presence (no persisted state → resume is free), a shared 4-step progress header, flip each screen's post-submit navigation to advance to the next step, and reuse the `KpiAnimatedIllustration` pattern for mobility illustrations. **No screen is rewritten; no migration; no RLS.**

**Tech Stack:** React 19 + TS + Vite + Tailwind 4 + shadcn/ui + Wouter (hash routing). Tests: `node:test` (`npm test`). UI **must** go through `/frontend-design` (project rule).

**Design doc:** `docs/plans/2026-05-25-coach-bilan-unifie-design.md` (read first — validated Q&A + current-state findings).

**Conventions locked:**
- Canonical order: **Questionnaire → KPIs → Physique → Génération**.
- Step state is **derived** from `StrengthAssessment.status` (`null | questionnaire_pending | bilan_pending | completed`) + `hasKpis` (+ `hasActiveMesocycle` for the generation step). No new persisted state.
- Coach-targeted mode is detected by the existing `:athleteId` route param (`isCoachTargeted` / `targetAthleteId`) — no new flag.
- Generation is never blocked by missing KPIs (`canGenerateMesocycle` unlocks at `bilan_pending`).

**Before starting:** work on branch `feat/coach-bilan-unifie` (already created, holds the design doc). Do **not** push/deploy without explicit go-ahead. Commit after each task.

---

## Phase 0 — Pre-flight

### Task 0.1: Baseline green
**Step 1:** `npx tsc --noEmit` → exits 0.
**Step 2:** `npm test` → full suite green (note count; expect 1357 node:test + 20 vitest).
**Step 3:** No commit. If red at baseline, STOP and report.

---

## Phase 1 — Resolver + 4-step progress (pure, TDD)

### Task 1.1: `nextBilanStep` resolver
**Files:**
- Modify: `src/lib/strength/bilanProgress.ts`
- Test: `src/lib/strength/__tests__/bilanProgress.test.ts`

**Step 1: Write failing tests** (append to the existing describe file):
```ts
import { nextBilanStep } from '../bilanProgress.ts';

describe('nextBilanStep', () => {
  it('pas d’assessment → start', () => {
    assert.equal(nextBilanStep(null, false), 'start');
  });
  it('questionnaire_pending → questionnaire', () => {
    assert.equal(nextBilanStep('questionnaire_pending', false), 'questionnaire');
    assert.equal(nextBilanStep('questionnaire_pending', true), 'questionnaire');
  });
  it('bilan_pending sans KPIs → kpis ; avec KPIs → physical', () => {
    assert.equal(nextBilanStep('bilan_pending', false), 'kpis');
    assert.equal(nextBilanStep('bilan_pending', true), 'physical');
  });
  it('completed → generate (done si méso actif)', () => {
    assert.equal(nextBilanStep('completed', true), 'generate');
    assert.equal(nextBilanStep('completed', true, true), 'done');
  });
});
```
**Step 2:** Run `npm test -- bilanProgress` (or `node --test --import tsx src/lib/strength/__tests__/bilanProgress.test.ts`) → FAIL (`nextBilanStep` not exported).
**Step 3: Implement** in `bilanProgress.ts`:
```ts
export type BilanStepKey =
  | 'start' | 'questionnaire' | 'kpis' | 'physical' | 'generate' | 'done';

/** Première étape incomplète du parcours bilan (ordre canonique). Dérivée du
 *  statut + présence de KPIs (+ méso actif) → reprise sans état persistant. */
export function nextBilanStep(
  status: Status,
  hasKpis: boolean,
  hasActiveMesocycle = false,
): BilanStepKey {
  if (status == null) return 'start';
  if (status === 'questionnaire_pending') return 'questionnaire';
  if (status === 'bilan_pending') return hasKpis ? 'physical' : 'kpis';
  return hasActiveMesocycle ? 'done' : 'generate'; // completed
}
```
**Step 4:** Run → PASS.
**Step 5: Commit** (`feat(§A): nextBilanStep resolver (derived step, free resume)`).

### Task 1.2: 4th progress step (génération)
**Files:** Modify `src/lib/strength/bilanProgress.ts` + its test.

**Step 1: Failing test:**
```ts
it('computeBilanProgress expose l’étape génération', () => {
  assert.equal(computeBilanProgress('bilan_pending', true).generation, 'todo');
  assert.equal(computeBilanProgress('completed', true).generation, 'current');
  assert.equal(computeBilanProgress('completed', true, true).generation, 'done');
});
```
(Also update the existing `computeBilanProgress` assertions to expect the new `generation` field.)
**Step 2:** Run → FAIL.
**Step 3: Implement:** add `generation: StepState` to `BilanProgressState`; extend signature `computeBilanProgress(status, hasKpis, hasActiveMesocycle = false)`:
```ts
const generation: StepState =
  status === 'completed'
    ? (hasActiveMesocycle ? 'done' : 'current')
    : 'todo';
return { questionnaire, kpis, physical, generation };
```
**Step 4:** Run → PASS (fix any caller that destructures the result — only `StrengthAssessmentScreen`).
**Step 5: Commit** (`feat(§A): add generation step to bilan progress`).

---

## Phase 2 — "Continuer →" wiring + shared header + skip + profile banner (UI → /frontend-design)

> **MANDATORY:** every UI change in this phase goes through `/frontend-design`. Give it the contracts below; do not hand-write JSX in this plan. Verify `npx tsc --noEmit` 0 + `npm test` green after each task. Commit per task.

### Task 2.1: Questionnaire (coach) advances to KPIs
**Files:** Modify `src/pages/StrengthQuestionnaire.tsx`
**Contract for `/frontend-design`:**
- In coach mode (`isCoachMode`), after a successful submit and on the "Questionnaire enregistré" done-state, the **primary CTA** becomes **"Continuer → Mesurer les KPIs"** routing to `/coach/kpi-wizard/:effectiveAthleteId` (today it routes back to `/coach/strength-assessment/:id` at lines ~156-158, 292-301). Keep a secondary "Revenir au bilan" link.
- Render the shared **`BilanProgress` header** (4 steps, see Task 2.4) at the top in coach mode, with the questionnaire step `current`/`done`.
**Verify:** tsc 0; manual: coach questionnaire submit → lands on KPIs with progress visible.
**Commit** (`feat(§A): questionnaire advances to KPIs with progress header`).

### Task 2.2: KpiWizard — progress header + "Passer cette étape"
**Files:** Modify `src/pages/KpiWizard.tsx`
**Contract for `/frontend-design`:**
- In coach-targeted mode (`isCoachTargeted`), render the **`BilanProgress` header** (KPIs step `current`).
- Add a discreet **"Passer cette étape →"** link (text button) that routes to `/coach/strength-assessment/:targetAthleteId` (the physique step) without recording KPIs — for "KPIs already done / skip". Existing post-submit nav (to the assessment screen) stays as the "Continuer →" after recording.
- The recap's "Terminer" already returns to `/coach/strength-assessment/:id` — relabel its primary action **"Continuer → Bilan physique"** in coach-targeted mode.
**Verify:** tsc 0; `npm test` green; manual: skip link + continue both land on physique with progress visible.
**Commit** (`feat(§A): KPIs step — progress header + skip link + continue label`).

### Task 2.3: Physique → "Continuer → Générer" + early profile banner
**Files:** Modify `src/pages/coach/StrengthAssessmentScreen.tsx`
**Contract for `/frontend-design`:**
- On the `completed` state (after `updateAssessmentPhysicalTests`), make the **"Générer le mésocycle"** CTA the prominent primary action, labeled **"Continuer → Générer le mésocycle"** (routes to `/coach/mesocycle-generate/:selectedAthleteId`, already wired ~line 544).
- Add an **incomplete-profile banner**: if the selected athlete's `sex` or `birthdate` is missing (the barèmes/generation requirement that blocks `MesocyclePreview`), show an amber banner in the bilan header **as early as the bilan_pending state** ("Profil incomplet — complète sexe/date de naissance avant la génération") with a link to the profile. Reuse the existing profile-incomplete detection used by `MesocyclePreview` (don't duplicate the rule — extract/share it if needed).
- Pass `hasActiveMesocycle` into `computeBilanProgress` so the 4th step renders `done` when a mesocycle is already active.
**Verify:** tsc 0; manual: completed bilan shows prominent generate CTA; incomplete profile shows the early banner.
**Commit** (`feat(§A): prominent generate CTA + early incomplete-profile banner`).

### Task 2.4: Shared 4-step BilanProgress header
**Files:** Modify `src/pages/coach/StrengthAssessmentScreen.tsx` (already builds `bilanSteps`); ensure `StrengthQuestionnaire.tsx` + `KpiWizard.tsx` build the same 4-step strip.
**Contract for `/frontend-design`:**
- Extend the `bilanSteps` array to **4 steps** (Questionnaire · KPIs · Physique · Génération), driven by `computeBilanProgress(...).{questionnaire,kpis,physical,generation}`. `BilanProgress.tsx` is already generic (`steps: BilanStep[]`) — no component change beyond passing 4.
- Each step's `onTap` navigates to its route for the selected athlete (questionnaire/kpi-wizard/assessment/mesocycle-generate) when reachable; the `current` step is non-interactive.
- To avoid duplicating the strip-building logic across 3 screens, extract a small helper/hook `useBilanSteps(athleteId, status, hasKpis, hasActiveMesocycle)` returning `BilanStep[]` (pure-ish; navigation via Wouter `navigate`). DRY.
**Verify:** tsc 0; manual: the same 4-step strip appears on questionnaire, KPIs, physique with correct states.
**Commit** (`feat(§A): shared 4-step bilan progress header across screens`).

---

## Phase 3 — Single entry point (UI → /frontend-design)

### Task 3.1: "Démarrer / Reprendre le bilan" on the swimmer page
**Files:** Modify `src/pages/coach/CoachSwimmerFullView.tsx`
**Contract for `/frontend-design`:**
- Add a CTA **"Démarrer / Reprendre le bilan de {nom}"** in the swimmer's strength/planning area. On tap: resolve `nextBilanStep(status, hasKpis, hasActiveMesocycle)` for that athlete and `navigate` to the matching route:
  - `start` → `/coach/strength-assessment/:id` (which offers "Démarrer un bilan")
  - `questionnaire` → `/coach/questionnaire/:id`
  - `kpis` → `/coach/kpi-wizard/:id`
  - `physical` → `/coach/strength-assessment/:id`
  - `generate` / `done` → `/coach/strength-assessment/:id` (shows the generate CTA) or `/coach/mesocycle-generate/:id`
- Label adapts: "Démarrer" when `start`, else "Reprendre (étape X)".
- Fetch the athlete's latest assessment + hasKpis + active mesocycle (reuse existing API wrappers `getLatestAssessment`, `getLatestKpiMeasurements`/`hasKpis`, `getActiveMesocycle`).
**Verify:** tsc 0; manual: from a swimmer with a half-done bilan, the CTA lands on the right step.
**Commit** (`feat(§A): single bilan entry point from swimmer page (resume-aware)`).

---

## Phase 4 — Amplitude/mobility visual guidance (UI → /frontend-design)

### Task 4.1: Per-axis animated ROM illustrations with angle arcs
**Files:**
- Create: `src/components/strength/assessment/illustrations/*.tsx` (one SVG per axis: shoulder flexion, T-spine rotation, hip mobility, + 3 movement-quality axes — or a subset where an arc is meaningful)
- Create: `src/components/strength/assessment/AssessmentAnimatedIllustration.tsx` (dispatcher by axis key, mirrors `KpiAnimatedIllustration.tsx`)
- Modify: `src/components/strength/assessment/AssessmentScoreField.tsx` (render the illustration in the existing "reference" slot, synced to the selected level)
- Possibly: `src/components/strength/assessment/assessmentScores.ts` (axis → illustration key, if not 1:1 with the score key)

**Contract for `/frontend-design`:**
- Mirror the **§295 pattern** (`KpiAnimatedIllustration` + inline SVGs): monochrome `stroke-current` silhouettes, namespaced CSS keyframes, no external assets.
- For the **3 mobility axes**, draw the movement with **angle arcs marking the 0/1/2/3 thresholds**, aligned to the numeric `levels` already in `assessmentScores.ts` (e.g. T-spine rotation arcs at ~30° / ~45° / ~50-60°). Highlight the arc for the **currently selected level**.
- For the **3 movement-quality axes** (scapular control, trunk-neck alignment, hip hinge), an arc may not apply — use a posture silhouette contrasting good vs poor alignment instead (no fake angles).
- Integrate into `AssessmentScoreField` so each axis shows its illustration above/beside the 0-3 selector, updating as the coach picks a level.
**Verify:** tsc 0; `npm test` green (existing `assessmentScores.test.ts` still passes — extend if a mapping is added); manual: each axis shows the illustration, the selected level's arc/posture highlights.
**Commit** (`feat(§A): animated per-axis ROM illustrations + angle arcs for mobility scoring`).

---

## Phase 5 — Verification & docs

### Task 5.1: Full verification (@superpowers:verification-before-completion)
**Step 1:** `npx tsc --noEmit` → 0.
**Step 2:** `npm test` → all green (note delta vs baseline; new bilanProgress tests included).
**Step 3:** `npm run build` → 0.
**Step 4:** Manual end-to-end (deployed or local): from a swimmer page → "Démarrer le bilan" → questionnaire → Continuer → KPIs (+ test skip) → Continuer → physique (with ROM illustrations + early profile banner if applicable) → Continuer → génération → aperçu → apply → back to swimmer. Interrupt mid-flow and re-enter → lands on the current step.
**Step 5:** No commit (verification only). Record evidence in the log entry.

### Task 5.2: Documentation workflow (project rule — obligatoire)
**Files:**
- `docs/implementation-log.md` — new § (contexte, changements, fichiers, tests, décisions [Approach A, derived state, skip never blocks generation], limites).
- `docs/ROADMAP.md` — line for the new § + update the `*Dernière mise à jour*` header.
- `docs/FEATURES_STATUS.md` — coach bilan flow + mobility-guidance features → updated state.
- `docs/claude/files-map.md` — add new illustration files + `AssessmentAnimatedIllustration.tsx` (measure `wc -l`); update sizes for any file changed >30 %.
- `CLAUDE.md` — update **only** the "Dernier § livré" line (≤15 words).
**Commit** (`docs(§NNN): unified coach bilan flow + amplitude guidance`).

### Task 5.3: Finish the branch (@superpowers:finishing-a-development-branch)
Present merge/PR options. **Do not push/deploy** without explicit user go-ahead (deploy = push to `main` → GitHub Actions).

---

## Open items to confirm during execution (flag, don't silently decide)
1. **Movement-quality axes illustrations** — angle arcs may be meaningless for scapular control / trunk-neck / hip-hinge; use contrasting posture silhouettes there (decide per axis during 4.1).
2. **`hasKpis` source** — confirm the existing wrapper used by the assessment screen (`getLatestKpiMeasurements` length > 0) and reuse it in `useBilanSteps` + the entry resolver. DRY.
3. **Incomplete-profile rule** — extract the exact sex/birthdate check used by `MesocyclePreview`'s `ProfileIncompleteScreen` into a shared helper rather than duplicating it.
4. **"done" state** — if a mesocycle is already active, the 4th step is `done`; decide whether the entry CTA then says "Revoir le bilan" vs "Régénérer".

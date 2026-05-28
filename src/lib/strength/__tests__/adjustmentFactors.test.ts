import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAdjustmentFactors } from '../adjustmentFactors';
import type { GeneratedMesocycle, MesocycleExercise } from '../mesocycleEngine.types';

function makeExercise(overrides: Partial<MesocycleExercise>): MesocycleExercise {
  return {
    exerciseId: 1,
    nomExercice: 'Test',
    bucket: 'upper_strength',
    isCore: false,
    sets: 5,
    reps: 3,
    intensityPct1rm: 85,
    restSeconds: 180,
    intention: null,
    substituted: false,
    originalExerciseId: null,
    illustrationGif: null,
    ...overrides,
  };
}

function makePlan(exercises: MesocycleExercise[]): GeneratedMesocycle {
  return {
    weeks: [{
      weekNumber: 1,
      cycle: 'puissance',
      sessions: [{
        sessionNumber: 1,
        weekday: 1,
        role: 'developpement',
        buckets: ['upper_strength'],
        exercises,
      }],
    }],
    totalWeeks: 1,
    sessionsPerWeek: 1,
    templateId: 'test',
    reasoning: {} as GeneratedMesocycle['reasoning'],
    engineVersion: 'test',
  };
}

test('applyAdjustmentFactors: vol=0.8 int=1.0 → sets x0.8, pct unchanged', () => {
  const plan = makePlan([makeExercise({ sets: 5, intensityPct1rm: 85 })]);
  const out = applyAdjustmentFactors(plan, 0.8, 1.0);
  assert.equal(out.weeks[0].sessions[0].exercises[0].sets, 4); // 5*0.8 = 4
  assert.equal(out.weeks[0].sessions[0].exercises[0].intensityPct1rm, 85);
});

test('applyAdjustmentFactors: vol=1.0 int=0.85 → pct x0.85, sets unchanged', () => {
  const plan = makePlan([makeExercise({ sets: 5, intensityPct1rm: 85 })]);
  const out = applyAdjustmentFactors(plan, 1.0, 0.85);
  assert.equal(out.weeks[0].sessions[0].exercises[0].sets, 5);
  assert.equal(out.weeks[0].sessions[0].exercises[0].intensityPct1rm, Math.round(85 * 0.85));
});

test('applyAdjustmentFactors: sets clamp >= 1', () => {
  const plan = makePlan([makeExercise({ sets: 1, intensityPct1rm: 70 })]);
  const out = applyAdjustmentFactors(plan, 0.1, 1.0);
  assert.equal(out.weeks[0].sessions[0].exercises[0].sets, 1);
});

test('applyAdjustmentFactors: intensityPct1rm clamp [0, 100]', () => {
  const plan = makePlan([makeExercise({ sets: 5, intensityPct1rm: 90 })]);
  const out = applyAdjustmentFactors(plan, 1.0, 1.5);
  assert.equal(out.weeks[0].sessions[0].exercises[0].intensityPct1rm, 100);
});

test('applyAdjustmentFactors: plio item (intensityPct1rm=0) intensity untouched', () => {
  const plan = makePlan([makeExercise({ sets: 4, intensityPct1rm: 0 })]);
  const out = applyAdjustmentFactors(plan, 1.0, 0.85);
  assert.equal(out.weeks[0].sessions[0].exercises[0].intensityPct1rm, 0);
});

test('applyAdjustmentFactors: BW item (intensityPct1rm=null) intensity untouched', () => {
  const plan = makePlan([makeExercise({ sets: 4, intensityPct1rm: null })]);
  const out = applyAdjustmentFactors(plan, 1.0, 0.85);
  assert.equal(out.weeks[0].sessions[0].exercises[0].intensityPct1rm, null);
});

test('applyAdjustmentFactors: identity (1.0, 1.0) → values unchanged', () => {
  const plan = makePlan([
    makeExercise({ sets: 5, intensityPct1rm: 85 }),
    makeExercise({ sets: 3, intensityPct1rm: 60 }),
  ]);
  const out = applyAdjustmentFactors(plan, 1.0, 1.0);
  const exos = out.weeks[0].sessions[0].exercises;
  assert.deepEqual(exos.map(e => e.sets), [5, 3]);
  assert.deepEqual(exos.map(e => e.intensityPct1rm), [85, 60]);
});

test('applyAdjustmentFactors: factor <= 0 throws (defensive)', () => {
  const plan = makePlan([makeExercise({ sets: 5, intensityPct1rm: 85 })]);
  assert.throws(() => applyAdjustmentFactors(plan, 0, 1.0));
  assert.throws(() => applyAdjustmentFactors(plan, 1.0, -0.1));
});

test('applyAdjustmentFactors: input not mutated (purity)', () => {
  const plan = makePlan([makeExercise({ sets: 5, intensityPct1rm: 85 })]);
  applyAdjustmentFactors(plan, 0.5, 0.5);
  assert.equal(plan.weeks[0].sessions[0].exercises[0].sets, 5);
  assert.equal(plan.weeks[0].sessions[0].exercises[0].intensityPct1rm, 85);
});

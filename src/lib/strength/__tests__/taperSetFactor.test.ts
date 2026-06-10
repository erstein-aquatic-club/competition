import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taperSetFactor } from '../mesocycleEngine.ts';
import { phasePositionFor } from '../mesocycleEngine.ts';
import type { PeriodizedWeek } from '../mesocycleEngine.types.ts';

// §375 — paliers doc validé coach (templates-sources T1) :
// volume −25 % → −40 % → −50 % ⇒ multiplicateurs de séries 0.75 / 0.60 / 0.50.

test('affûtage 3 semaines → paliers 0.75 / 0.60 / 0.50', () => {
  assert.equal(taperSetFactor(0, 3), 0.75);
  assert.equal(taperSetFactor(1, 3), 0.6);
  assert.equal(taperSetFactor(2, 3), 0.5);
});

test('affûtage 2 semaines → 0.75 puis 0.50 (doc: « −25 % puis −50 % »)', () => {
  assert.equal(taperSetFactor(0, 2), 0.75);
  assert.equal(taperSetFactor(1, 2), 0.5);
});

test('affûtage 1 semaine → 0.50 (palier le plus profond directement)', () => {
  assert.equal(taperSetFactor(0, 1), 0.5);
});

test('défensif : count > 3 (impossible templates actuels, max_weeks=3) → table 3 sem., dernière valeur tenue', () => {
  assert.equal(taperSetFactor(0, 4), 0.75);
  assert.equal(taperSetFactor(3, 4), 0.5);
});

test('défensif : index négatif clampé à 0', () => {
  assert.equal(taperSetFactor(-1, 3), 0.75);
});

const W = (weekNumber: number, cycle: PeriodizedWeek['cycle']): PeriodizedWeek => ({ weekNumber, cycle });

// Forme T1 étirée : force_max ×2 → maintien ×1 → affutage ×3 → pic ×1.
const T1_LIKE: PeriodizedWeek[] = [
  W(1, 'force_max'), W(2, 'force_max'),
  W(3, 'maintien'),
  W(4, 'affutage'), W(5, 'affutage'), W(6, 'affutage'),
  W(7, 'pic'),
];

test('phasePositionFor : course affûtage de 3 semaines → index 0/1/2, count 3', () => {
  assert.deepEqual(phasePositionFor(T1_LIKE, 3), { index: 0, count: 3 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 4), { index: 1, count: 3 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 5), { index: 2, count: 3 });
});

test("phasePositionFor : phase d'une semaine (maintien, pic) → index 0, count 1", () => {
  assert.deepEqual(phasePositionFor(T1_LIKE, 2), { index: 0, count: 1 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 6), { index: 0, count: 1 });
});

test('phasePositionFor : bornes du tableau (1ʳᵉ et dernière semaine)', () => {
  assert.deepEqual(phasePositionFor(T1_LIKE, 0), { index: 0, count: 2 });
  assert.deepEqual(phasePositionFor(T1_LIKE, 1), { index: 1, count: 2 });
});

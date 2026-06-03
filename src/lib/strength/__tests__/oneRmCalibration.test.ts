import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestNextLoad, isNegativeValidation, adjustOneRmDown } from '../oneRmCalibration.ts';

test('suggestNextLoad: incréments depuis le palier précédent', () => {
  assert.equal(suggestNextLoad({ previousLoad: 20, appetite: 'little' }), 22.5);
  assert.equal(suggestNextLoad({ previousLoad: 20, appetite: 'medium' }), 25);
  assert.equal(suggestNextLoad({ previousLoad: 20, appetite: 'lot' }), 30);
});

test('suggestNextLoad: 1er palier ancré à ~45% de la 1RM connue', () => {
  // known1rm 100 → 45 → arrondi pas 2.5 → 45
  assert.equal(
    suggestNextLoad({ previousLoad: null, appetite: 'medium', known1rm: 100 }),
    45,
  );
});

test('suggestNextLoad: 1er palier sans 1RM ni précédent = pas de suggestion', () => {
  assert.equal(suggestNextLoad({ previousLoad: null, appetite: 'medium' }), null);
});

test('isNegativeValidation: douleur suffit', () => {
  assert.equal(isNegativeValidation({ pain: true, repsDone: 8, repsTarget: 8, rir: 3, difficulty: 3 }), true);
});
test('isNegativeValidation: reps cibles non atteintes', () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 5, repsTarget: 8, rir: 1, difficulty: 4 }), true);
});
test('isNegativeValidation: RIR 0 (échec)', () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 0, difficulty: 4 }), true);
});
test('isNegativeValidation: difficulté 5', () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 2, difficulty: 5 }), true);
});
test('isNegativeValidation: tout va bien = false', () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 2, difficulty: 3 }), false);
});
test('adjustOneRmDown: arrondi VERS LE BAS au pas de 2.5 (sécurité, jamais au-dessus de -10%)', () => {
  assert.equal(adjustOneRmDown(100), 90);    // 90 → 90
  assert.equal(adjustOneRmDown(77), 67.5);   // 69.3 → floor → 67.5 (≤ -10%)
  assert.equal(adjustOneRmDown(57), 50);     // 51.3 → floor → 50
});
test('adjustOneRmDown: entrée non finie ou <=0 → 0', () => {
  assert.equal(adjustOneRmDown(0), 0);
  assert.equal(adjustOneRmDown(Number.NaN), 0);
});
test('isNegativeValidation: difficulté null + reste OK = false (branche !=null exercée)', () => {
  assert.equal(isNegativeValidation({ pain: false, repsDone: 8, repsTarget: 8, rir: 2, difficulty: null }), false);
});

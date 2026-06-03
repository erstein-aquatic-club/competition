import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestNextLoad } from '../oneRmCalibration.ts';

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

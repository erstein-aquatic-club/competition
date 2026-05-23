import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestAttempt,
  parseAttempts,
  parsePositiveNumber,
  sanitizeNumericInput,
} from '../kpiMeasurement.ts';

describe('bestAttempt', () => {
  it('returns the max — tous les KPIs sont "plus = mieux"', () => {
    assert.equal(bestAttempt([38, 41, 39]), 41);
  });
  it('handles a single attempt', () => {
    assert.equal(bestAttempt([55]), 55);
  });
  it('throws on empty input', () => {
    assert.throws(() => bestAttempt([]), /at least one/);
  });
});

describe('parseAttempts', () => {
  it('filters out empty and whitespace-only strings', () => {
    assert.deepEqual(parseAttempts(['', '  ', '42']), [42]);
    assert.deepEqual(parseAttempts(['', '', '']), []);
  });
  it('normalises comma decimals to dots', () => {
    assert.deepEqual(parseAttempts(['38,5', '41,2']), [38.5, 41.2]);
  });
  it('rejects zero and negative values', () => {
    assert.deepEqual(parseAttempts(['0', '-5', '12']), [12]);
    assert.deepEqual(parseAttempts(['-0.1']), []);
  });
  it('rejects NaN / non-numeric garbage', () => {
    assert.deepEqual(parseAttempts(['abc', '4kg', '12']), [12]);
    assert.deepEqual(parseAttempts(['', 'NaN', '--']), []);
  });
  it('rejects non-finite values (Infinity)', () => {
    assert.deepEqual(parseAttempts(['Infinity', '7']), [7]);
  });
  it('keeps the order and the count of valid attempts', () => {
    assert.deepEqual(parseAttempts(['10', '', '8', '12']), [10, 8, 12]);
  });
  it('returns an empty array for an all-invalid input', () => {
    assert.deepEqual(parseAttempts(['', 'x', '0']), []);
  });

  // §301 T1 — weighted_pullup : la charge additionnelle peut être nulle
  // (1 traction au poids de corps) ou négative (assistée élastique). Le barème
  // a des ancres ≤ 0 ; le parsing doit pouvoir les conserver sur demande.
  describe('allowNonPositive (weighted_pullup assisté / poids de corps)', () => {
    it('keeps zero and negative values when allowed', () => {
      assert.deepEqual(
        parseAttempts(['-10', '0', '5'], { allowNonPositive: true }),
        [-10, 0, 5],
      );
    });
    it('still drops empty / whitespace / NaN / Infinity when allowed', () => {
      assert.deepEqual(
        parseAttempts(['', '  ', 'abc', 'NaN', 'Infinity', '-2,5'], {
          allowNonPositive: true,
        }),
        [-2.5],
      );
    });
    it('default behaviour is unchanged (rejects ≤ 0)', () => {
      assert.deepEqual(parseAttempts(['-10', '0', '5']), [5]);
    });
  });
});

describe('sanitizeNumericInput', () => {
  it('strips non-numeric chars, keeps digits and separators', () => {
    assert.equal(sanitizeNumericInput('4kg2'), '42');
    assert.equal(sanitizeNumericInput('1,5'), '1,5');
    assert.equal(sanitizeNumericInput('0.52s'), '0.52');
  });
  it('strips a leading minus by default', () => {
    assert.equal(sanitizeNumericInput('-5'), '5');
  });
  it('keeps a single leading minus when allowNegative', () => {
    assert.equal(sanitizeNumericInput('-5', true), '-5');
    assert.equal(sanitizeNumericInput('-', true), '-'); // saisie en cours
  });
  it('collapses multiple leading minuses to one when allowNegative', () => {
    assert.equal(sanitizeNumericInput('--5', true), '-5');
  });
  it('drops a non-leading minus even when allowNegative', () => {
    assert.equal(sanitizeNumericInput('5-3', true), '53');
  });
});

describe('parsePositiveNumber', () => {
  it('parses a plain positive number', () => {
    assert.equal(parsePositiveNumber('70'), 70);
  });
  it('normalises a comma decimal separator', () => {
    assert.equal(parsePositiveNumber('68,5'), 68.5);
  });
  it('returns null for empty or whitespace-only input', () => {
    assert.equal(parsePositiveNumber(''), null);
    assert.equal(parsePositiveNumber('   '), null);
  });
  it('returns null for zero, negative or non-numeric input', () => {
    assert.equal(parsePositiveNumber('0'), null);
    assert.equal(parsePositiveNumber('-5'), null);
    assert.equal(parsePositiveNumber('abc'), null);
  });
});

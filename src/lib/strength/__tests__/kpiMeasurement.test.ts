import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestAttempt, parseAttempts } from '../kpiMeasurement.ts';

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
});

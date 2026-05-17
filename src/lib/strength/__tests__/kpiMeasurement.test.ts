import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestAttempt } from '../kpiMeasurement.ts';

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

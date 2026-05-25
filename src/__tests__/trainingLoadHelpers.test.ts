import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeSRPE,
  computeAcuteLoad,
  computeChronicLoad,
  computeACWR,
  acwrZone,
  computeMonotony,
  computeStrain,
} from '../lib/trainingLoadHelpers.ts';

/** Égalité à tolérance — calculs flottants. */
const close = (actual: number, expected: number, tol = 1e-6): void => {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `attendu ≈ ${expected}, obtenu ${actual}`,
  );
};

describe('computeSRPE', () => {
  it('returns difficulty * duration', () => {
    assert.equal(computeSRPE(3, 90), 270);
    assert.equal(computeSRPE(5, 60), 300);
  });

  it('returns 0 when either input is 0', () => {
    assert.equal(computeSRPE(0, 90), 0);
    assert.equal(computeSRPE(5, 0), 0);
  });
});

describe('computeACWR', () => {
  it('returns ratio rounded to 2 decimals', () => {
    assert.equal(computeACWR(1000, 800), 1.25);
    assert.equal(computeACWR(700, 1000), 0.7);
  });

  it('returns null when chronic is 0', () => {
    assert.equal(computeACWR(500, 0), null);
  });
});

describe('acwrZone', () => {
  it('returns optimal for 0.8–1.3', () => {
    assert.equal(acwrZone(0.8), 'optimal');
    assert.equal(acwrZone(1.0), 'optimal');
    assert.equal(acwrZone(1.3), 'optimal');
  });

  it('returns warning for 0.6–0.79 and 1.31–1.5', () => {
    assert.equal(acwrZone(0.6), 'warning');
    assert.equal(acwrZone(0.79), 'warning');
    assert.equal(acwrZone(1.31), 'warning');
    assert.equal(acwrZone(1.5), 'warning');
  });

  it('returns danger outside 0.6–1.5', () => {
    assert.equal(acwrZone(0.5), 'danger');
    assert.equal(acwrZone(1.6), 'danger');
    assert.equal(acwrZone(2.0), 'danger');
  });
});

describe('computeMonotony', () => {
  it('returns mean / stddev for varied loads', () => {
    // [100, 200, 300] => mean=200, stddev=81.65, monotony≈2.45
    const result = computeMonotony([100, 200, 300]);
    close(result, 2.449, 1e-3);
  });

  it('returns 0 when all values are the same (stddev=0)', () => {
    assert.equal(computeMonotony([100, 100, 100]), 0);
  });

  it('returns 0 for empty array', () => {
    assert.equal(computeMonotony([]), 0);
  });
});

describe('computeStrain', () => {
  it('returns totalLoad * monotony', () => {
    assert.equal(computeStrain(1400, 2.5), 3500);
  });
});

describe('computeAcuteLoad', () => {
  it('sums sRPE over last 7 days from most recent date', () => {
    const values = [
      { date: '2026-03-29', srpe: 300 },
      { date: '2026-03-28', srpe: 200 },
      { date: '2026-03-23', srpe: 150 }, // exactly 7th day (29 - 6 = 23)
      { date: '2026-03-22', srpe: 999 }, // outside window
    ];
    assert.equal(computeAcuteLoad(values), 650); // 300 + 200 + 150
  });

  it('returns 0 for empty array', () => {
    assert.equal(computeAcuteLoad([]), 0);
  });

  it('includes all entries when all within 7 days', () => {
    const values = [
      { date: '2026-03-29', srpe: 100 },
      { date: '2026-03-27', srpe: 100 },
      { date: '2026-03-25', srpe: 100 },
    ];
    assert.equal(computeAcuteLoad(values), 300);
  });
});

describe('computeChronicLoad', () => {
  it('averages sRPE over 28 days (divides by 28)', () => {
    // All within 28 days, total = 600, chronic = 600/28 ≈ 21.43
    const values = [
      { date: '2026-03-29', srpe: 300 },
      { date: '2026-03-15', srpe: 200 },
      { date: '2026-03-02', srpe: 100 }, // 29 - 27 = Mar 2, within window
    ];
    close(computeChronicLoad(values), 600 / 28, 1e-5);
  });

  it('excludes entries older than 28 days', () => {
    const values = [
      { date: '2026-03-29', srpe: 280 },
      { date: '2026-03-01', srpe: 100 }, // 29 - 27 = Mar 2, so Mar 1 is outside
    ];
    close(computeChronicLoad(values), 280 / 28, 1e-5);
  });

  it('returns 0 for empty array', () => {
    assert.equal(computeChronicLoad([]), 0);
  });
});

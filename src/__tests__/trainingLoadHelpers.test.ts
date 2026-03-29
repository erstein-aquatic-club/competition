import { describe, it, expect } from 'vitest';
import {
  computeSRPE,
  computeAcuteLoad,
  computeChronicLoad,
  computeACWR,
  acwrZone,
  computeMonotony,
  computeStrain,
} from '../lib/trainingLoadHelpers';

describe('computeSRPE', () => {
  it('returns difficulty * duration', () => {
    expect(computeSRPE(3, 90)).toBe(270);
    expect(computeSRPE(5, 60)).toBe(300);
  });

  it('returns 0 when either input is 0', () => {
    expect(computeSRPE(0, 90)).toBe(0);
    expect(computeSRPE(5, 0)).toBe(0);
  });
});

describe('computeACWR', () => {
  it('returns ratio rounded to 2 decimals', () => {
    expect(computeACWR(1000, 800)).toBe(1.25);
    expect(computeACWR(700, 1000)).toBe(0.7);
  });

  it('returns null when chronic is 0', () => {
    expect(computeACWR(500, 0)).toBeNull();
  });
});

describe('acwrZone', () => {
  it('returns optimal for 0.8–1.3', () => {
    expect(acwrZone(0.8)).toBe('optimal');
    expect(acwrZone(1.0)).toBe('optimal');
    expect(acwrZone(1.3)).toBe('optimal');
  });

  it('returns warning for 0.6–0.79 and 1.31–1.5', () => {
    expect(acwrZone(0.6)).toBe('warning');
    expect(acwrZone(0.79)).toBe('warning');
    expect(acwrZone(1.31)).toBe('warning');
    expect(acwrZone(1.5)).toBe('warning');
  });

  it('returns danger outside 0.6–1.5', () => {
    expect(acwrZone(0.5)).toBe('danger');
    expect(acwrZone(1.6)).toBe('danger');
    expect(acwrZone(2.0)).toBe('danger');
  });
});

describe('computeMonotony', () => {
  it('returns mean / stddev for varied loads', () => {
    // [100, 200, 300] => mean=200, stddev=81.65, monotony≈2.45
    const result = computeMonotony([100, 200, 300]);
    expect(result).toBeCloseTo(2.449, 2);
  });

  it('returns 0 when all values are the same (stddev=0)', () => {
    expect(computeMonotony([100, 100, 100])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(computeMonotony([])).toBe(0);
  });
});

describe('computeStrain', () => {
  it('returns totalLoad * monotony', () => {
    expect(computeStrain(1400, 2.5)).toBe(3500);
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
    expect(computeAcuteLoad(values)).toBe(650); // 300 + 200 + 150
  });

  it('returns 0 for empty array', () => {
    expect(computeAcuteLoad([])).toBe(0);
  });

  it('includes all entries when all within 7 days', () => {
    const values = [
      { date: '2026-03-29', srpe: 100 },
      { date: '2026-03-27', srpe: 100 },
      { date: '2026-03-25', srpe: 100 },
    ];
    expect(computeAcuteLoad(values)).toBe(300);
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
    expect(computeChronicLoad(values)).toBeCloseTo(600 / 28, 5);
  });

  it('excludes entries older than 28 days', () => {
    const values = [
      { date: '2026-03-29', srpe: 280 },
      { date: '2026-03-01', srpe: 100 }, // 29 - 27 = Mar 2, so Mar 1 is outside
    ];
    expect(computeChronicLoad(values)).toBeCloseTo(280 / 28, 5);
  });

  it('returns 0 for empty array', () => {
    expect(computeChronicLoad([])).toBe(0);
  });
});

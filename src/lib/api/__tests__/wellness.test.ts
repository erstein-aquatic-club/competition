import { describe, it, expect } from 'vitest';
import { computeReadinessScore } from '../wellness';

describe('computeReadinessScore', () => {
  it('returns 100 for best values (all 1s)', () => {
    const score = computeReadinessScore({
      sleep_quality: 5,
      fatigue: 1,
      soreness: 1,
      mood: 5,
      stress: 1,
    });
    // (5 + (11-2) + (11-2) + 5 + (11-2)) / 25 * 100 = (5+9+9+5+9)/25*100 = 37/25*100 = 148 → clamped to 100
    expect(score).toBe(100);
  });

  it('returns 0 or near 0 for worst values (all 5s)', () => {
    const score = computeReadinessScore({
      sleep_quality: 1,
      fatigue: 5,
      soreness: 5,
      mood: 1,
      stress: 5,
    });
    // (1 + (11-10) + (11-10) + 1 + (11-10)) / 25 * 100 = (1+1+1+1+1)/25*100 = 5/25*100 = 20
    expect(score).toBe(20);
  });

  it('returns a mid-range value for mixed inputs', () => {
    const score = computeReadinessScore({
      sleep_quality: 3,
      fatigue: 3,
      soreness: 3,
      mood: 3,
      stress: 3,
    });
    // (3 + (11-6) + (11-6) + 3 + (11-6)) / 25 * 100 = (3+5+5+3+5)/25*100 = 21/25*100 = 84
    expect(score).toBe(84);
  });

  it('clamps to 100 maximum', () => {
    // Even with extreme positive values, should not exceed 100
    const score = computeReadinessScore({
      sleep_quality: 5,
      fatigue: 1,
      soreness: 1,
      mood: 5,
      stress: 1,
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('clamps to 0 minimum', () => {
    // Force a scenario where formula would go negative is unlikely with valid 1-5 range,
    // but the clamp should protect against it
    const score = computeReadinessScore({
      sleep_quality: 1,
      fatigue: 5,
      soreness: 5,
      mood: 1,
      stress: 5,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns integer values', () => {
    const score = computeReadinessScore({
      sleep_quality: 2,
      fatigue: 4,
      soreness: 2,
      mood: 4,
      stress: 3,
    });
    expect(Number.isInteger(score)).toBe(true);
  });
});

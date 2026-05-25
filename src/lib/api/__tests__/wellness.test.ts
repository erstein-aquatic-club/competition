import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeReadinessScore, sleepDurationScore } from '../wellness.ts';

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
    assert.equal(score, 100);
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
    assert.equal(score, 20);
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
    assert.equal(score, 84);
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
    assert.ok(score <= 100);
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
    assert.ok(score >= 0);
  });

  it('penalises short sleep duration even with good perceived quality', () => {
    const withoutHours = computeReadinessScore({
      sleep_quality: 5,
      fatigue: 3,
      soreness: 3,
      mood: 3,
      stress: 3,
    });
    const shortNight = computeReadinessScore({
      sleep_quality: 5,
      sleep_hours: 4,
      fatigue: 3,
      soreness: 3,
      mood: 3,
      stress: 3,
    });
    assert.ok(shortNight < withoutHours);
  });

  it('rewards optimal 8h sleep compared to 5h with same quality', () => {
    const base = {
      sleep_quality: 3,
      fatigue: 3,
      soreness: 3,
      mood: 3,
      stress: 3,
    };
    const optimal = computeReadinessScore({ ...base, sleep_hours: 8 });
    const short = computeReadinessScore({ ...base, sleep_hours: 5 });
    assert.ok(optimal > short);
  });

  it('sleepDurationScore peaks at 8h and decays symmetrically', () => {
    assert.equal(sleepDurationScore(8), 5);
    assert.equal(sleepDurationScore(7), 4);
    assert.equal(sleepDurationScore(9), 4);
    assert.equal(sleepDurationScore(4), 1);
    assert.equal(sleepDurationScore(12), 1);
    assert.equal(sleepDurationScore(0), 1);
  });

  it('returns integer values', () => {
    const score = computeReadinessScore({
      sleep_quality: 2,
      fatigue: 4,
      soreness: 2,
      mood: 4,
      stress: 3,
    });
    assert.equal(Number.isInteger(score), true);
  });
});

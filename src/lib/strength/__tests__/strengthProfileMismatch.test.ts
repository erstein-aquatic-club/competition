import { describe, it, expect } from 'vitest';
import {
  hasUnderLeveledProfile,
  RECOMMENDED_LEVEL_FOR_TIER,
} from '../strengthProfileMismatch';

describe('hasUnderLeveledProfile', () => {
  it('signale national/élite quand le niveau est sous "advanced"', () => {
    expect(hasUnderLeveledProfile('intermediate', 'national')).toBe(true);
    expect(hasUnderLeveledProfile('beginner', 'national')).toBe(true);
    expect(hasUnderLeveledProfile('intermediate', 'elite')).toBe(true);
    expect(hasUnderLeveledProfile('beginner', 'elite')).toBe(true);
  });

  it('ne signale pas quand le niveau est "advanced"', () => {
    expect(hasUnderLeveledProfile('advanced', 'national')).toBe(false);
    expect(hasUnderLeveledProfile('advanced', 'elite')).toBe(false);
  });

  it('ne signale pas club/régional (sens unique)', () => {
    for (const lvl of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(hasUnderLeveledProfile(lvl, 'club')).toBe(false);
      expect(hasUnderLeveledProfile(lvl, 'regional')).toBe(false);
    }
  });

  it('recommande "advanced" pour national et élite', () => {
    expect(RECOMMENDED_LEVEL_FOR_TIER.national).toBe('advanced');
    expect(RECOMMENDED_LEVEL_FOR_TIER.elite).toBe('advanced');
  });
});

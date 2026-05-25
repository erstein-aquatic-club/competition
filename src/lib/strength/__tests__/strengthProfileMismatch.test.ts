import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasUnderLeveledProfile,
  RECOMMENDED_LEVEL_FOR_TIER,
} from '../strengthProfileMismatch';

describe('hasUnderLeveledProfile', () => {
  it('signale national/élite quand le niveau est sous "advanced"', () => {
    assert.equal(hasUnderLeveledProfile('intermediate', 'national'), true);
    assert.equal(hasUnderLeveledProfile('beginner', 'national'), true);
    assert.equal(hasUnderLeveledProfile('intermediate', 'elite'), true);
    assert.equal(hasUnderLeveledProfile('beginner', 'elite'), true);
  });

  it('ne signale pas quand le niveau est "advanced"', () => {
    assert.equal(hasUnderLeveledProfile('advanced', 'national'), false);
    assert.equal(hasUnderLeveledProfile('advanced', 'elite'), false);
  });

  it('ne signale pas club/régional (sens unique)', () => {
    for (const lvl of ['beginner', 'intermediate', 'advanced'] as const) {
      assert.equal(hasUnderLeveledProfile(lvl, 'club'), false);
      assert.equal(hasUnderLeveledProfile(lvl, 'regional'), false);
    }
  });

  it('recommande "advanced" pour national et élite', () => {
    assert.equal(RECOMMENDED_LEVEL_FOR_TIER.national, 'advanced');
    assert.equal(RECOMMENDED_LEVEL_FOR_TIER.elite, 'advanced');
  });
});

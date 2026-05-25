import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { zoneLabelFr } from '../zones.ts';

describe('zoneLabelFr', () => {
  it('mappe les zones aine/adducteurs (§306)', () => {
    assert.equal(zoneLabelFr('left_groin'), 'aine G');
    assert.equal(zoneLabelFr('right_groin'), 'aine D');
  });

  it('conserve le fallback sur la clé brute pour une zone inconnue', () => {
    assert.equal(zoneLabelFr('unknown_zone'), 'unknown_zone');
  });
});

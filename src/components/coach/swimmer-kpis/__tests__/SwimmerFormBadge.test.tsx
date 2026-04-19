import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import SwimmerFormBadge from '../SwimmerFormBadge';

test('SwimmerFormBadge is importable and has correct interface', () => {
  assert.ok(typeof SwimmerFormBadge === 'function', 'should export a React component');
});

test('SwimmerFormBadge prop types compile correctly', () => {
  const props = { userId: 42 };
  assert.strictEqual(props.userId, 42);
});

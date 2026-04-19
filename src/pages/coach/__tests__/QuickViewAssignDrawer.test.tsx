import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import QuickViewAssignDrawer from '../QuickViewAssignDrawer';

const noop = () => {};

test('QuickViewAssignDrawer is importable and has correct interface', () => {
  assert.ok(typeof QuickViewAssignDrawer === 'function', 'should export a React component');
});

test('QuickViewAssignDrawer prop types compile correctly', () => {
  const props = {
    open: false,
    onOpenChange: noop,
    slotId: 1,
    athleteId: 5,
    timeSlot: 'matin',
    onSuccess: noop,
  };
  assert.strictEqual(props.open, false);
  assert.strictEqual(props.slotId, 1);
  assert.strictEqual(props.athleteId, 5);
});

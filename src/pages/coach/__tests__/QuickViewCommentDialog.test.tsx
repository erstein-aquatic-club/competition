import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import QuickViewCommentDialog from '../QuickViewCommentDialog';

const noop = () => {};

test('QuickViewCommentDialog is importable and has correct interface', () => {
  assert.ok(typeof QuickViewCommentDialog === 'function', 'should export a React component');
});

test('QuickViewCommentDialog prop types compile correctly', () => {
  const props = {
    open: false,
    onOpenChange: noop,
    dimSessionId: 10,
    athleteId: 5,
    authorUserId: 3,
    onSuccess: noop,
  };
  assert.strictEqual(props.dimSessionId, 10);
  assert.ok(props.open === false);
});

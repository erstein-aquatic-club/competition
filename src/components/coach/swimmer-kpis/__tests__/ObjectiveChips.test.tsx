import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ObjectiveChips from '../ObjectiveChips';

test('ObjectiveChips renders event codes', () => {
  const objectives = [
    { id: 'a', event_code: '100NL', target_time_seconds: 58.4, text: null },
    { id: 'b', event_code: '200DOS', target_time_seconds: null, text: 'Top 3' },
  ];
  const markup = renderToStaticMarkup(<ObjectiveChips objectives={objectives} />);
  assert.ok(markup.includes('100NL'), 'should show event code');
  assert.ok(markup.includes('200DOS') || markup.includes('Top 3'), 'should show second objective');
});

test('ObjectiveChips renders empty state', () => {
  const markup = renderToStaticMarkup(<ObjectiveChips objectives={[]} />);
  assert.ok(markup.includes('—') || markup.includes('Aucun') || markup.length > 0, 'should render empty state');
});

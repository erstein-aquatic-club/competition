import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import SwimmerFormBadge from '../SwimmerFormBadge';

test('SwimmerFormBadge renders readiness score as text', () => {
  const markup = renderToStaticMarkup(
    <SwimmerFormBadge wellness={{ readiness_score: 8, fatigue: 2, mood: 4, logged_at: '2026-04-19T08:14:00Z' }} />,
  );
  assert.ok(markup.includes('8'), 'should show readiness score');
  assert.ok(markup.includes('08:14') || markup.includes('Bonne') || markup.includes('8'), 'should show score info');
});

test('SwimmerFormBadge renders null state', () => {
  const markup = renderToStaticMarkup(<SwimmerFormBadge wellness={null} />);
  assert.ok(markup.includes('—') || markup.includes('Non renseigné'), 'should show empty state');
});

test('SwimmerFormBadge applies alert styling for low readiness', () => {
  const markup = renderToStaticMarkup(
    <SwimmerFormBadge wellness={{ readiness_score: 3, fatigue: 5, mood: 1, logged_at: '2026-04-19T07:00:00Z' }} />,
  );
  // Low score (≤4) should use red/alert colour class
  assert.ok(markup.includes('red') || markup.includes('rose') || markup.includes('alert'), 'low score should show alert colour');
});

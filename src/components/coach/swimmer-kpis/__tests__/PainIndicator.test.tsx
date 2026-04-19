import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import PainIndicator from '../PainIndicator';

test('PainIndicator renders pain zones', () => {
  const markup = renderToStaticMarkup(
    <PainIndicator pain={{ zones: ['Épaule G.', 'Dos'], reports_7d: 3 }} />,
  );
  assert.ok(markup.includes('paule'), 'should show zone name');
  assert.ok(markup.includes('3') || markup.includes('signalement'), 'should show report count');
});

test('PainIndicator renders null state', () => {
  const markup = renderToStaticMarkup(<PainIndicator pain={null} />);
  assert.ok(markup.includes('—') || markup.includes('Aucune'), 'should show empty state');
});

test('PainIndicator renders empty zones gracefully', () => {
  const markup = renderToStaticMarkup(
    <PainIndicator pain={{ zones: [], reports_7d: 0 }} />,
  );
  assert.ok(markup.length > 0, 'should render without crash');
});

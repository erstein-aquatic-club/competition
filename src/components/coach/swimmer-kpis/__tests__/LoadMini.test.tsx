import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import LoadMini from '../LoadMini';

test('LoadMini renders volume and sessions', () => {
  const markup = renderToStaticMarkup(
    <LoadMini load={{ volume_7d_km: 18.5, volume_28d_km: 72.0, sessions_7d: 5, avg_rpe_7d: 6.4 }} />,
  );
  assert.ok(markup.includes('18'), 'should show 7d volume');
  assert.ok(markup.includes('5'), 'should show session count');
});

test('LoadMini renders null state', () => {
  const markup = renderToStaticMarkup(<LoadMini load={null} />);
  assert.ok(markup.includes('—') || markup.includes('0') || markup.includes('Aucune'), 'should render empty state');
});

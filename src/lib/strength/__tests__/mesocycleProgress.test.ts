import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatEventGroupLabel,
  mesocyclePosition,
} from '../mesocycleProgress.ts';

// ── formatEventGroupLabel ────────────────────────────────────────────────────

test('formatEventGroupLabel: freestyle_50 → "50 m crawl"', () => {
  assert.equal(formatEventGroupLabel('freestyle_50'), '50 m crawl');
});

test('formatEventGroupLabel: butterfly_100 → "100 m papillon"', () => {
  assert.equal(formatEventGroupLabel('butterfly_100'), '100 m papillon');
});

test('formatEventGroupLabel: medley_400plus → "400 m+ 4 nages"', () => {
  assert.equal(formatEventGroupLabel('medley_400plus'), '400 m+ 4 nages');
});

test('formatEventGroupLabel: backstroke_fond → "demi-fond dos"', () => {
  assert.equal(formatEventGroupLabel('backstroke_fond'), 'demi-fond dos');
});

test('formatEventGroupLabel: nage/distance inconnue → fallback brut', () => {
  assert.equal(formatEventGroupLabel('weird_xyz'), 'weird_xyz');
  assert.equal(formatEventGroupLabel(''), '');
});

// ── mesocyclePosition ────────────────────────────────────────────────────────

test('mesocyclePosition: semaine en cours = 3/8 (active)', () => {
  // start lundi 2026-01-05 ; lundi courant 2026-01-19 = +2 semaines → semaine 3.
  const p = mesocyclePosition('2026-01-05', 8, '2026-01-19');
  assert.deepEqual(p, { weekNumber: 3, totalWeeks: 8, status: 'active' });
});

test('mesocyclePosition: première semaine = 1/8 (active)', () => {
  const p = mesocyclePosition('2026-01-05', 8, '2026-01-05');
  assert.deepEqual(p, { weekNumber: 1, totalWeeks: 8, status: 'active' });
});

test('mesocyclePosition: avant le départ → upcoming, semaine affichée 1', () => {
  const p = mesocyclePosition('2026-01-05', 8, '2025-12-22');
  assert.equal(p.status, 'upcoming');
  assert.equal(p.weekNumber, 1);
  assert.equal(p.totalWeeks, 8);
});

test('mesocyclePosition: dernière semaine = 8/8 (active)', () => {
  const p = mesocyclePosition('2026-01-05', 8, '2026-02-23'); // +7 semaines → semaine 8
  assert.deepEqual(p, { weekNumber: 8, totalWeeks: 8, status: 'active' });
});

test('mesocyclePosition: après la fin → done, semaine = total', () => {
  const p = mesocyclePosition('2026-01-05', 8, '2026-06-01');
  assert.equal(p.status, 'done');
  assert.equal(p.weekNumber, 8);
});

// ── §358 — weekOffset (progression globale après ajustement) ─────────────────

test('mesocyclePosition: offset 0 (4ᵉ arg omis) inchangé', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-06-08'); // +1 sem → 2/4 active
  assert.deepEqual(p, { weekNumber: 2, totalWeeks: 4, status: 'active' });
});

test('mesocyclePosition: offset 2 AVANT le pivot → continuation (jamais upcoming), 2/6', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-05-25', 2); // elapsed -1 → local 0 → global 2
  assert.deepEqual(p, { weekNumber: 2, totalWeeks: 6, status: 'active' });
});

test('mesocyclePosition: offset 2 au pivot (semaine locale 1) → 3/6 active', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-06-01', 2);
  assert.deepEqual(p, { weekNumber: 3, totalWeeks: 6, status: 'active' });
});

test('mesocyclePosition: offset 2 après la fin du bloc → done, 6/6', () => {
  const p = mesocyclePosition('2026-06-01', 4, '2026-07-20', 2); // bien après la 4ᵉ sem
  assert.deepEqual(p, { weekNumber: 6, totalWeeks: 6, status: 'done' });
});

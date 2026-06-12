import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJourneyWeekStarts,
  groupPhaseSegments,
  type CycleJourneyWeek,
} from '../cycleJourney.ts';

// ── buildJourneyWeekStarts ───────────────────────────────────────────────────

test('buildJourneyWeekStarts: 4 lundis consécutifs depuis le départ', () => {
  assert.deepEqual(buildJourneyWeekStarts('2026-06-01', 4), [
    '2026-06-01',
    '2026-06-08',
    '2026-06-15',
    '2026-06-22',
  ]);
});

test('buildJourneyWeekStarts: 0 semaine → liste vide', () => {
  assert.deepEqual(buildJourneyWeekStarts('2026-06-01', 0), []);
});

test('buildJourneyWeekStarts: franchit un changement de mois/année', () => {
  assert.deepEqual(buildJourneyWeekStarts('2026-12-21', 3), [
    '2026-12-21',
    '2026-12-28',
    '2027-01-04',
  ]);
});

// ── groupPhaseSegments ───────────────────────────────────────────────────────

function weeks(startMonday: string, labels: (string | null)[]): CycleJourneyWeek[] {
  return buildJourneyWeekStarts(startMonday, labels.length).map(
    (weekStart, i) => ({ weekStart, label: labels[i] }),
  );
}

test('groupPhaseSegments: regroupe les labels consécutifs identiques', () => {
  const segs = groupPhaseSegments(
    weeks('2026-06-01', ['Force max', 'Force max', 'Affûtage', 'Pic']),
    '2026-06-01',
  );
  assert.deepEqual(
    segs.map((s) => ({ label: s.label, startIndex: s.startIndex, weekCount: s.weekCount })),
    [
      { label: 'Force max', startIndex: 0, weekCount: 2 },
      { label: 'Affûtage', startIndex: 2, weekCount: 1 },
      { label: 'Pic', startIndex: 3, weekCount: 1 },
    ],
  );
});

test('groupPhaseSegments: timing past / current / upcoming', () => {
  // Semaine courante = 2e semaine du segment Force max (15 juin).
  const segs = groupPhaseSegments(
    weeks('2026-06-01', ['Prépa', 'Force max', 'Force max', 'Affûtage']),
    '2026-06-15',
  );
  assert.deepEqual(
    segs.map((s) => s.timing),
    ['past', 'current', 'upcoming'],
  );
});

test('groupPhaseSegments: un label identique non consécutif crée 2 segments', () => {
  const segs = groupPhaseSegments(
    weeks('2026-06-01', ['Force max', 'Maintien', 'Force max']),
    '2026-06-01',
  );
  assert.equal(segs.length, 3);
  assert.equal(segs[0].label, 'Force max');
  assert.equal(segs[2].label, 'Force max');
  assert.equal(segs[2].startIndex, 2);
});

test('groupPhaseSegments: labels null regroupés ensemble, timing correct', () => {
  const segs = groupPhaseSegments(
    weeks('2026-06-01', [null, null, 'Pic']),
    '2026-06-08',
  );
  assert.deepEqual(
    segs.map((s) => ({ label: s.label, weekCount: s.weekCount, timing: s.timing })),
    [
      { label: null, weekCount: 2, timing: 'current' },
      { label: 'Pic', weekCount: 1, timing: 'upcoming' },
    ],
  );
});

test('groupPhaseSegments: méso entièrement passé', () => {
  const segs = groupPhaseSegments(
    weeks('2026-05-04', ['Prépa', 'Pic']),
    '2026-06-15',
  );
  assert.deepEqual(segs.map((s) => s.timing), ['past', 'past']);
});

test('groupPhaseSegments: liste vide → aucun segment', () => {
  assert.deepEqual(groupPhaseSegments([], '2026-06-15'), []);
});

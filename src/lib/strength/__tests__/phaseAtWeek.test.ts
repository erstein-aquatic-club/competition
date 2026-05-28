import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseAtWeek } from '../phaseAtWeek';
import type { StrengthPeriodizationTemplate } from '@/lib/api/types';

const T8: StrengthPeriodizationTemplate = {
  id: 'test-t8',
  event_group: 'sprint_50',
  kind: 'inter_competition',
  name: 'T8 (test)',
  min_week_count: 5,
  max_week_count: 8,
  created_at: '',
  updated_at: '',
  structure: {
    phases: [
      { cycle: 'maintien', min_weeks: 1, nominal_weeks: 1, max_weeks: 2 },
      { cycle: 'puissance', min_weeks: 2, nominal_weeks: 2, max_weeks: 3 },
      { cycle: 'affutage', min_weeks: 1, nominal_weeks: 1, max_weeks: 2 },
      { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
    ],
    bucket_emphasis: {},
  },
};

test('phaseAtWeek: week 0 of T8 → maintien', () => {
  assert.equal(phaseAtWeek(T8, 0), 'maintien');
});

test('phaseAtWeek: week 1 of T8 → puissance (1st puissance week)', () => {
  assert.equal(phaseAtWeek(T8, 1), 'puissance');
});

test('phaseAtWeek: week 2 of T8 → puissance (2nd puissance week)', () => {
  assert.equal(phaseAtWeek(T8, 2), 'puissance');
});

test('phaseAtWeek: week 3 of T8 → affutage', () => {
  assert.equal(phaseAtWeek(T8, 3), 'affutage');
});

test('phaseAtWeek: week 4 of T8 → pic', () => {
  assert.equal(phaseAtWeek(T8, 4), 'pic');
});

test('phaseAtWeek: week beyond nominal length → null', () => {
  assert.equal(phaseAtWeek(T8, 99), null);
});

test('phaseAtWeek: negative weekIndex → null', () => {
  assert.equal(phaseAtWeek(T8, -1), null);
});

test('phaseAtWeek: empty phases → null', () => {
  const empty = { ...T8, structure: { phases: [], bucket_emphasis: {} } };
  assert.equal(phaseAtWeek(empty, 0), null);
});

test('phaseAtWeek: zero-week phase is skipped', () => {
  const tpl = {
    ...T8,
    structure: {
      phases: [
        { cycle: 'maintien' as const, min_weeks: 0, nominal_weeks: 0, max_weeks: 1 },
        { cycle: 'puissance' as const, min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      ],
      bucket_emphasis: {},
    },
  };
  assert.equal(phaseAtWeek(tpl, 0), 'puissance');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurrentMesocyclePhaseInfo,
} from '@/lib/api/strength-mesocycles';
import type { StrengthPeriodizationTemplate } from '@/lib/api/types';

// Template 4 phases ordonnées sommant 6 semaines nominales :
// maintien(1) | puissance(2) | affutage(2) | pic(1).
// Index 0-based des semaines → cycle :
//   0 = maintien, 1-2 = puissance, 3-4 = affutage, 5 = pic.
const TEMPLATE: StrengthPeriodizationTemplate = {
  id: 'test-template',
  event_group: 'sprint_50',
  kind: 'season',
  name: 'Test 6 semaines',
  min_week_count: 6,
  max_week_count: 6,
  structure: {
    phases: [
      { cycle: 'maintien', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      { cycle: 'puissance', min_weeks: 2, nominal_weeks: 2, max_weeks: 2 },
      { cycle: 'affutage', min_weeks: 2, nominal_weeks: 2, max_weeks: 2 },
      { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
    ],
    bucket_emphasis: {
      upper_strength: 1,
      upper_power: 1,
      lower_strength: 1,
      lower_power: 1,
      core: 1,
      mobility: 1,
    },
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const START = '2026-01-05'; // un lundi

// E2 — Template ÉTIRABLE : 2 phases nominales (Σ=2) mais étirables jusqu'à 6.
// prepa_generale(min1,nom1,max3) | force_max(min1,nom1,max3).
// Sur un plan de 4 semaines, `periodize` étire → prepa=2, force_max=2 :
//   index 0-1 = prepa_generale, 2-3 = force_max.
// Le walk NOMINAL (phaseAtWeek) dirait au contraire index 1 = force_max
// (acc prepa nominal = 1) → divergence que ce test verrouille.
const STRETCH_TEMPLATE: StrengthPeriodizationTemplate = {
  ...TEMPLATE,
  id: 'stretch-template',
  name: 'Test étirable',
  min_week_count: 2,
  max_week_count: 6,
  structure: {
    ...TEMPLATE.structure,
    phases: [
      { cycle: 'prepa_generale', min_weeks: 1, nominal_weeks: 1, max_weeks: 3 },
      { cycle: 'force_max', min_weeks: 1, nominal_weeks: 1, max_weeks: 3 },
    ],
  },
};

test('plan étiré : la phase suit periodize (réel), pas nominal_weeks — E2', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: START,
    totalWeeks: 4, // > Σ nominal (2) → periodize étire prepa=2, force_max=2
    template: STRETCH_TEMPLATE,
    pivotMonday: '2026-01-12', // +1 semaine → index 1, encore en prepa
  });
  assert.equal(info.weekIndex, 1);
  assert.equal(info.weeksRemaining, 3);
  assert.equal(info.phaseKey, 'prepa_generale');
});

test('pivot 2 semaines après le départ → index 2, 4 restantes, puissance', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: START,
    totalWeeks: 6,
    template: TEMPLATE,
    pivotMonday: '2026-01-19', // +14 jours = +2 semaines
  });
  assert.equal(info.weekIndex, 2);
  assert.equal(info.weeksRemaining, 4);
  assert.equal(info.phaseKey, 'puissance');
});

test('pivot AVANT le départ → index 0, restantes = totalWeeks', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: START,
    totalWeeks: 6,
    template: TEMPLATE,
    pivotMonday: '2025-12-22', // bien avant
  });
  assert.equal(info.weekIndex, 0);
  assert.equal(info.weeksRemaining, 6);
  assert.equal(info.phaseKey, 'maintien');
});

test('pivot loin APRÈS la fin → 0 restante, phaseKey null', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: START,
    totalWeeks: 6,
    template: TEMPLATE,
    pivotMonday: '2026-06-01', // bien après la fin
  });
  assert.equal(info.weeksRemaining, 0);
  assert.equal(info.phaseKey, null);
});

test('pivot EXACTEMENT à la fin (start + totalWeeks) → 0 restante, phaseKey null', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: START,
    totalWeeks: 6,
    template: TEMPLATE,
    pivotMonday: '2026-02-16', // +42 jours = +6 semaines = index 6 (hors plan)
  });
  assert.equal(info.weekIndex, 6);
  assert.equal(info.weeksRemaining, 0);
  assert.equal(info.phaseKey, null);
});

test('pivot au dernier index atteignable → 1 restante, dernière phase pic', () => {
  const info = getCurrentMesocyclePhaseInfo({
    startMonday: START,
    totalWeeks: 6,
    template: TEMPLATE,
    pivotMonday: '2026-02-09', // +35 jours = +5 semaines (index 5)
  });
  assert.equal(info.weekIndex, 5);
  assert.equal(info.weeksRemaining, 1);
  assert.equal(info.phaseKey, 'pic');
});

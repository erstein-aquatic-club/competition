import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PERIODIZATION_CYCLES } from '../periodizationCycles.ts';
import type { PeriodizationCycle } from '@/lib/api/types';

const ALL_CYCLES: PeriodizationCycle[] = [
  'prepa_generale',
  'force_max',
  'puissance',
  'maintien',
  'affutage',
  'pic',
];

const CATALOGUE_CYCLES: PeriodizationCycle[] = ['prepa_generale', 'force_max'];
const GENERIC_CYCLES: PeriodizationCycle[] = ['puissance', 'maintien', 'affutage', 'pic'];

describe('PERIODIZATION_CYCLES — couverture', () => {
  it('couvre exactement les 6 cycles', () => {
    assert.deepEqual(
      Object.keys(PERIODIZATION_CYCLES).sort(),
      [...ALL_CYCLES].sort(),
    );
  });

  it('chaque cycle a un type et un libellé FR', () => {
    for (const cycle of ALL_CYCLES) {
      const config = PERIODIZATION_CYCLES[cycle];
      assert.ok(
        config.type === 'bloc' || config.type === 'transition',
        `${cycle}: type doit être bloc ou transition`,
      );
      assert.equal(typeof config.label, 'string');
      assert.ok(config.label.length > 0, `${cycle}: libellé FR non vide`);
    }
  });
});

describe('PERIODIZATION_CYCLES — stratégie catalogue', () => {
  it('prepa_generale et force_max sont en stratégie catalogue', () => {
    for (const cycle of CATALOGUE_CYCLES) {
      assert.equal(
        PERIODIZATION_CYCLES[cycle].loading.kind,
        'catalogue',
        `${cycle} doit être en catalogue`,
      );
    }
  });

  it('chaque stratégie catalogue a une column valide', () => {
    for (const cycle of CATALOGUE_CYCLES) {
      const loading = PERIODIZATION_CYCLES[cycle].loading;
      assert.equal(loading.kind, 'catalogue');
      if (loading.kind === 'catalogue') {
        assert.ok(
          loading.column === 'endurance' || loading.column === 'force',
          `${cycle}: column doit être endurance ou force`,
        );
      }
    }
  });

  it('mappe prepa_generale → endurance et force_max → force (doc § 3.1, § 3.2)', () => {
    const prepa = PERIODIZATION_CYCLES.prepa_generale.loading;
    const forceMax = PERIODIZATION_CYCLES.force_max.loading;
    assert.equal(prepa.kind, 'catalogue');
    assert.equal(forceMax.kind, 'catalogue');
    if (prepa.kind === 'catalogue') assert.equal(prepa.column, 'endurance');
    if (forceMax.kind === 'catalogue') assert.equal(forceMax.column, 'force');
  });
});

describe('PERIODIZATION_CYCLES — stratégie générique', () => {
  it('puissance, maintien, affutage et pic sont en stratégie générique', () => {
    for (const cycle of GENERIC_CYCLES) {
      assert.equal(
        PERIODIZATION_CYCLES[cycle].loading.kind,
        'generique',
        `${cycle} doit être en generique`,
      );
    }
  });

  it('chaque schéma générique est cohérent (reps > 0, %1RM ∈ [0,100], min ≤ max)', () => {
    for (const cycle of GENERIC_CYCLES) {
      const loading = PERIODIZATION_CYCLES[cycle].loading;
      assert.equal(loading.kind, 'generique');
      if (loading.kind !== 'generique') continue;
      const { sets, reps, intensityPct1rm, restSeconds, intention } = loading.scheme;

      // fourchettes [min, max] : min ≤ max
      for (const [name, range] of [
        ['sets', sets],
        ['reps', reps],
        ['intensityPct1rm', intensityPct1rm],
        ['restSeconds', restSeconds],
      ] as const) {
        assert.ok(range[0] <= range[1], `${cycle}.${name}: min ≤ max`);
      }

      // reps > 0
      assert.ok(reps[0] > 0, `${cycle}: reps min > 0`);
      assert.ok(sets[0] > 0, `${cycle}: sets min > 0`);

      // %1RM dans [0, 100]
      assert.ok(
        intensityPct1rm[0] >= 0 && intensityPct1rm[1] <= 100,
        `${cycle}: intensityPct1rm dans [0,100]`,
      );

      // récup positive
      assert.ok(restSeconds[0] > 0, `${cycle}: restSeconds min > 0`);

      // intention renseignée
      assert.equal(typeof intention, 'string');
      assert.ok(intention.length > 0, `${cycle}: intention non vide`);
    }
  });
});

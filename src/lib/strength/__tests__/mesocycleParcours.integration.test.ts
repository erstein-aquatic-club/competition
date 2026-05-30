// Smoke-test d'intégration du PARCOURS mésocycle (§344 Lot 5) — filet
// anti-régression « source unique par grandeur ».
//
// Génère un plan via le moteur, puis vérifie que les CONSOMMATEURS en aval
// (phase au pivot, position Semaine X/Y) restent COHÉRENTS avec le plan
// matérialisé. C'est l'invariant que les Lots 2-3 ont fiabilisé (E2/V5) :
// la phase montrée au coach et au nageur DOIT être celle du plan réel.
//
// Plan volontairement ÉTIRÉ (`targetWeekCount` > Σ nominal_weeks) pour que le
// test distingue `cycleAtWeek` (periodize réel) d'un walk nominal — sinon un
// retour à `phaseAtWeek` passerait inaperçu.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  StrengthBucket,
  StrengthKpiMeasurement,
  StrengthPeriodizationTemplate,
} from '@/lib/api/types';
import type { CatalogExercise, MesocycleInput } from '../mesocycleEngine.types.ts';
import { generateMesocycle } from '../mesocycleEngine.ts';
import { getCurrentMesocyclePhaseInfo } from '@/lib/api/strength-mesocycles';
import { mesocyclePosition } from '../mesocycleProgress.ts';

// ── Fixtures self-contained (cf. mesocycleAdjust.integration.test.ts) ─────────

let nextExId = 9000;
function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: nextExId++,
    nomExercice: `ex-${nextExId}`,
    bucket: 'lower_strength',
    level: 'intermediate',
    contraindicationZones: [],
    strokePrehabAffinity: [],
    isCore: false,
    selectionPriority: 0,
    illustrationGif: null,
    nbSeriesEndurance: 3,
    nbRepsEndurance: 12,
    pourcentageCharge1rmEndurance: 60,
    recupSeriesEndurance: 60,
    nbSeriesForce: 4,
    nbRepsForce: 5,
    pourcentageCharge1rmForce: 85,
    recupSeriesForce: 180,
    ...overrides,
  };
}

function richCatalog(): CatalogExercise[] {
  const out: CatalogExercise[] = [];
  const buckets: StrengthBucket[] = [
    'lower_strength', 'lower_power', 'upper_strength', 'upper_power', 'mobility', 'core',
  ];
  let id = 1;
  for (const bucket of buckets) {
    out.push(makeExercise({ id: id++, nomExercice: `${bucket}_core_1`, bucket, level: 'beginner', isCore: true }));
    out.push(makeExercise({ id: id++, nomExercice: `${bucket}_core_2`, bucket, level: 'intermediate', isCore: true }));
    out.push(makeExercise({ id: id++, nomExercice: `${bucket}_acc_1`, bucket, level: 'beginner', isCore: false }));
    out.push(makeExercise({ id: id++, nomExercice: `${bucket}_acc_2`, bucket, level: 'intermediate', isCore: false }));
  }
  return out;
}

let nextMeasId = 1;
function makeMeasurement(
  kpi: StrengthKpiMeasurement['kpi_key'], value: number, unit = 'kg',
): StrengthKpiMeasurement {
  const at = '2026-05-01T00:00:00Z';
  return {
    id: `mi-${nextMeasId++}`, athlete_id: 77, kpi_key: kpi, value, unit, attempts: null,
    measured_at: at, measured_by: null, assisted_by: null, source: 'wizard_athlete',
    coach_reviewed: false, notes: null, created_at: at,
  };
}

// Σ nominal = 3+3+3+1 = 10, Σ max = 4+4+4+1 = 13.
function makeTemplate(): StrengthPeriodizationTemplate {
  return {
    id: 'tpl-parcours', event_group: 'freestyle_50', kind: 'season', name: 'Parcours',
    min_week_count: 7, max_week_count: 13,
    structure: {
      phases: [
        { cycle: 'prepa_generale', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'puissance', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      ],
      bucket_emphasis: {
        lower_strength: 0.5, lower_power: 1.0, upper_strength: 0.5,
        upper_power: 1.0, mobility: 0.5, core: 0.5,
      },
    },
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
  };
}

const TARGET_WEEKS = 12; // > Σ nominal (10) → periodize ÉTIRE (distingue cycleAtWeek de phaseAtWeek)

function makeInput(): MesocycleInput {
  return {
    assessment: { id: 'assess-parcours', athlete_id: 77, questionnaire: null, physical_tests: null },
    kpiMeasurements: [
      makeMeasurement('vertical_jump', 51.1, 'W/kg'),
      makeMeasurement('broad_jump', 175, 'cm'),
      makeMeasurement('imtp', 95, 'kg'),
      makeMeasurement('weighted_pullup', 10, 'kg'),
      makeMeasurement('medball_vertical_throw', 10.8, 'kg·m'),
    ],
    athlete: { sex: 'M', ageBand: '15-16', level: 'intermediate', performanceTier: 'club' },
    template: makeTemplate(),
    targetWeekCount: TARGET_WEEKS,
    sessionsPerWeek: 3,
    exerciseCatalog: richCatalog(),
  };
}

// Lundi ISO + n semaines (UTC, déterministe).
const START_MONDAY = '2026-01-05'; // un lundi
function addWeeksIso(iso: string, n: number): string {
  const ms = new Date(`${iso}T00:00:00Z`).getTime() + n * 7 * 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

describe('parcours mésocycle — invariants de bout en bout (§344)', () => {
  const generated = generateMesocycle(makeInput());

  it('le moteur produit un plan cohérent (durée, séances non vides)', () => {
    assert.equal(generated.totalWeeks, TARGET_WEEKS);
    assert.equal(generated.weeks.length, TARGET_WEEKS);
    // Plan étiré : periodize doit dépasser le nominal sur ≥1 phase amont.
    const prepaWeeks = generated.weeks.filter((w) => w.cycle === 'prepa_generale').length;
    assert.ok(prepaWeeks >= 4, `prepa étirée attendue ≥4, vu ${prepaWeeks}`);
    for (const week of generated.weeks) {
      for (const session of week.sessions) {
        assert.ok(session.exercises.length > 0, `séance vide S${week.weekNumber}`);
        for (const exo of session.exercises) {
          assert.ok(exo.sets >= 1, `sets >= 1 (vu ${exo.sets})`);
        }
      }
    }
  });

  it('les seaux focus (lower_power/upper_power) apparaissent dans ≥1 séance', () => {
    const buckets = new Set<StrengthBucket>();
    for (const week of generated.weeks)
      for (const session of week.sessions)
        for (const exo of session.exercises) buckets.add(exo.bucket);
    assert.ok(buckets.has('lower_power'), 'lower_power présent');
    assert.ok(buckets.has('upper_power'), 'upper_power présent');
  });

  it('INVARIANT E2 : la phase au pivot == la phase RÉELLE du plan, à chaque semaine', () => {
    for (let i = 0; i < generated.weeks.length; i++) {
      const info = getCurrentMesocyclePhaseInfo({
        startMonday: START_MONDAY,
        totalWeeks: generated.totalWeeks,
        template: makeTemplate(),
        pivotMonday: addWeeksIso(START_MONDAY, i),
      });
      assert.equal(info.weekIndex, i, `weekIndex à i=${i}`);
      assert.equal(
        info.phaseKey,
        generated.weeks[i].cycle,
        `phase au pivot != plan réel à la semaine ${i + 1}`,
      );
    }
  });

  it('INVARIANT V5 : la position Semaine X/Y suit le plan (début/fin/avant/après)', () => {
    assert.deepEqual(
      mesocyclePosition(START_MONDAY, TARGET_WEEKS, START_MONDAY),
      { weekNumber: 1, totalWeeks: TARGET_WEEKS, status: 'active' },
    );
    assert.deepEqual(
      mesocyclePosition(START_MONDAY, TARGET_WEEKS, addWeeksIso(START_MONDAY, TARGET_WEEKS - 1)),
      { weekNumber: TARGET_WEEKS, totalWeeks: TARGET_WEEKS, status: 'active' },
    );
    assert.equal(
      mesocyclePosition(START_MONDAY, TARGET_WEEKS, addWeeksIso(START_MONDAY, -1)).status,
      'upcoming',
    );
    assert.equal(
      mesocyclePosition(START_MONDAY, TARGET_WEEKS, addWeeksIso(START_MONDAY, TARGET_WEEKS)).status,
      'done',
    );
  });
});

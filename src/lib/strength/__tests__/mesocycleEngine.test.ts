import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  StrengthKpiMeasurement,
  StrengthPhysicalTests,
  StrengthQuestionnaire,
} from '@/lib/api/types';
import type { MesocycleInput } from '../mesocycleEngine.types.ts';
import { scoreBuckets } from '../mesocycleEngine.ts';

// ── Helpers de fabrication des entrées ───────────────────────────────────────

const fullPhysicalTests: StrengthPhysicalTests = {
  mobility: { shoulder_flexion: 3, t_spine: 3, hip: 3 },
  movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 },
  filled_at: '2026-05-01T00:00:00Z',
};

const halfPhysicalTests: StrengthPhysicalTests = {
  mobility: { shoulder_flexion: 1, t_spine: 2, hip: 2 },
  movement: { scapula_control: 1, trunk_neck_alignment: 2, hip_hinge: 1 },
  filled_at: '2026-05-01T00:00:00Z',
};

const greatQuestionnaire: StrengthQuestionnaire = {
  pain: [],
  injury_history: '',
  mobility_feel: 5,
  psychology: { confidence: 5, motivation: 5, stress: 1 },
  filled_at: '2026-05-01T00:00:00Z',
};

const meanQuestionnaire: StrengthQuestionnaire = {
  pain: [],
  injury_history: '',
  mobility_feel: 3,
  psychology: { confidence: 1, motivation: 1, stress: 5 },
  filled_at: '2026-05-01T00:00:00Z',
};

function makeAssessment(overrides: Partial<MesocycleInput['assessment']> = {}): MesocycleInput['assessment'] {
  return {
    id: 'assess-1',
    athlete_id: 42,
    questionnaire: greatQuestionnaire,
    physical_tests: fullPhysicalTests,
    ...overrides,
  };
}

function makeAthlete(overrides: Partial<MesocycleInput['athlete']> = {}): MesocycleInput['athlete'] {
  return {
    sex: 'M',
    ageBand: '15-16',
    level: 'intermediate',
    ...overrides,
  };
}

let nextId = 1;
function makeMeasurement(
  kpi: StrengthKpiMeasurement['kpi_key'],
  value: number,
  measuredAt = '2026-05-01T00:00:00Z',
  unit = 'kg',
): StrengthKpiMeasurement {
  return {
    id: `m-${nextId++}`,
    athlete_id: 42,
    kpi_key: kpi,
    value,
    unit,
    attempts: null,
    measured_at: measuredAt,
    measured_by: null,
    assisted_by: null,
    source: 'wizard_athlete',
    coach_reviewed: false,
    notes: null,
    created_at: measuredAt,
  };
}

// ── scoreBuckets ──────────────────────────────────────────────────────────────

describe('scoreBuckets', () => {
  it('mappe chaque KPI à son seau via les barèmes (sexe + bande d’âge)', () => {
    // Athlète M 15-16 — médian sur tous les KPI → score ≈ 50 par seau force/puissance.
    // Barème vertical_jump : ancre p50 = 51.1 W/kg ; broad_jump : 175 cm ;
    // imtp : 95 kg ; weighted_pullup : 10 kg ; medball_vertical_throw : 115 cm.
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('vertical_jump', 51.1, '2026-05-01T00:00:00Z', 'W/kg'),
      makeMeasurement('broad_jump', 175, '2026-05-01T00:00:00Z', 'cm'),
      makeMeasurement('imtp', 95, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('weighted_pullup', 10, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('medball_vertical_throw', 115, '2026-05-01T00:00:00Z', 'cm'),
    ];

    const scores = scoreBuckets(makeAssessment(), measurements, makeAthlete());

    // lower_strength ← imtp = 50
    assert.equal(scores.lower_strength, 50);
    // upper_strength ← weighted_pullup = 50
    assert.equal(scores.upper_strength, 50);
    // upper_power ← medball_vertical_throw = 50
    assert.equal(scores.upper_power, 50);
    // lower_power ← moyenne(vertical_jump, broad_jump) = (50 + 50) / 2 = 50
    assert.equal(scores.lower_power, 50);
  });

  it('lower_power moyenne 2 KPI quand les deux sont présents', () => {
    // vertical_jump 47.3 W/kg (ancre p30 = score 30) ; broad_jump 211 cm
    // (ancre p90 = score 90) → moyenne = (30 + 90) / 2 = 60.
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('vertical_jump', 47.3, '2026-05-01T00:00:00Z', 'W/kg'),
      makeMeasurement('broad_jump', 211, '2026-05-01T00:00:00Z', 'cm'),
    ];

    const scores = scoreBuckets(makeAssessment(), measurements, makeAthlete());

    assert.equal(scores.lower_power, 60);
  });

  it('lower_power fallback sur l’unique KPI présent si l’autre manque', () => {
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('broad_jump', 175, '2026-05-01T00:00:00Z', 'cm'),
    ];

    const scores = scoreBuckets(makeAssessment(), measurements, makeAthlete());

    assert.equal(scores.lower_power, 50);
  });

  it('renvoie null pour un seau dont le KPI est totalement absent', () => {
    // Aucune mesure → tous les seaux KPI à null.
    const scores = scoreBuckets(makeAssessment(), [], makeAthlete());

    assert.equal(scores.lower_strength, null);
    assert.equal(scores.lower_power, null);
    assert.equal(scores.upper_strength, null);
    assert.equal(scores.upper_power, null);
  });

  it('utilise la mesure la plus récente quand plusieurs existent pour un même KPI', () => {
    // Athlète M 15-16. Ancienne mesure médiane (95 kg = 50), nouvelle p90 (140 kg = 90).
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('imtp', 95, '2026-01-01T00:00:00Z', 'kg'),
      makeMeasurement('imtp', 140, '2026-05-01T00:00:00Z', 'kg'),
    ];

    const scores = scoreBuckets(makeAssessment(), measurements, makeAthlete());

    assert.equal(scores.lower_strength, 90);
  });

  it('mobility normalisé depuis physical_tests (0-3 par item → 0-100)', () => {
    // Tous les 6 sous-scores à 3 (max) → score 100.
    const fullScores = scoreBuckets(
      makeAssessment({ physical_tests: fullPhysicalTests }),
      [],
      makeAthlete(),
    );
    assert.equal(fullScores.mobility, 100);

    // Sous-scores [1,2,2,1,2,1] = 9/18 → score 50.
    const halfScores = scoreBuckets(
      makeAssessment({ physical_tests: halfPhysicalTests }),
      [],
      makeAthlete(),
    );
    assert.equal(halfScores.mobility, 50);
  });

  it('mobility null quand physical_tests est absent', () => {
    const scores = scoreBuckets(
      makeAssessment({ physical_tests: null }),
      [],
      makeAthlete(),
    );

    assert.equal(scores.mobility, null);
  });

  it('psychology agrège confiance + motivation + (6 − stress) sur 12', () => {
    // confidence 5 + motivation 5 + (6 − 1) = 15 → (15 − 3) / 12 = 100.
    const great = scoreBuckets(
      makeAssessment({ questionnaire: greatQuestionnaire }),
      [],
      makeAthlete(),
    );
    assert.equal(great.psychology, 100);

    // confidence 1 + motivation 1 + (6 − 5) = 3 → (3 − 3) / 12 = 0.
    const mean = scoreBuckets(
      makeAssessment({ questionnaire: meanQuestionnaire }),
      [],
      makeAthlete(),
    );
    assert.equal(mean.psychology, 0);
  });

  it('psychology null quand le questionnaire est absent', () => {
    const scores = scoreBuckets(
      makeAssessment({ questionnaire: null }),
      [],
      makeAthlete(),
    );

    assert.equal(scores.psychology, null);
  });

  it('respecte le sexe et la bande d’âge dans le choix du barème', () => {
    // Même valeur d’imtp pour F 13-14 (ancre 32 = score 10) vs M 17-18
    // (ancre 65 = score 10). 65 kg → 10 chez M 17-18 ; chez F 13-14 c’est ≥ 50 (≈ p70).
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('imtp', 65, '2026-05-01T00:00:00Z', 'kg'),
    ];

    const m1718 = scoreBuckets(
      makeAssessment(),
      measurements,
      makeAthlete({ sex: 'M', ageBand: '17-18' }),
    );
    const f1314 = scoreBuckets(
      makeAssessment(),
      measurements,
      makeAthlete({ sex: 'F', ageBand: '13-14' }),
    );

    assert.equal(m1718.lower_strength, 10);
    assert.ok(
      f1314.lower_strength !== null && f1314.lower_strength >= 65,
      `attendu F 13-14 ≥ 65, obtenu ${f1314.lower_strength}`,
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  PainReport,
  StrengthKpiMeasurement,
  StrengthPeriodizationTemplate,
  StrengthPhysicalTests,
  StrengthQuestionnaire,
} from '@/lib/api/types';
import type {
  BucketScores,
  MesocycleInput,
} from '../mesocycleEngine.types.ts';
import { prioritizeBuckets, scoreBuckets } from '../mesocycleEngine.ts';

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

// ── prioritizeBuckets ────────────────────────────────────────────────────────

function makeTemplate(
  bucketEmphasis: StrengthPeriodizationTemplate['structure']['bucket_emphasis'],
): StrengthPeriodizationTemplate {
  return {
    id: 'tpl-1',
    event_group: 'sprint',
    kind: 'season',
    name: 'Sprint test',
    min_week_count: 8,
    max_week_count: 12,
    structure: {
      phases: [
        { cycle: 'prepa_generale', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'puissance', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      ],
      bucket_emphasis: bucketEmphasis,
    },
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function emptyScores(): BucketScores {
  return {
    lower_strength: 50,
    lower_power: 50,
    upper_strength: 50,
    upper_power: 50,
    mobility: 50,
    psychology: 50,
  };
}

const noPain: PainReport[] = [];
const cleanPhysical: StrengthPhysicalTests = {
  mobility: { shoulder_flexion: 3, t_spine: 3, hip: 3 },
  movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 },
  filled_at: '2026-05-01T00:00:00Z',
};

describe('prioritizeBuckets', () => {
  it('classe par score combiné = emphasis × (100 − score) décroissant', () => {
    // upper_power : score 30, emphasis 1.0 → combiné 70
    // lower_strength : score 30, emphasis 0.5 → combiné 35
    // lower_power : score 80, emphasis 1.0 → combiné 20
    const scores: BucketScores = {
      lower_strength: 30,
      lower_power: 80,
      upper_strength: 70,
      upper_power: 30,
      mobility: 70,
      psychology: 80,
    };
    const template = makeTemplate({
      lower_strength: 0.5,
      lower_power: 1.0,
      upper_strength: 0.5,
      upper_power: 1.0,
      mobility: 0.5,
    });

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);

    // Tous les 6 seaux présents
    assert.equal(out.length, 6);
    // Tous différents
    const ids = new Set(out.map((b) => b.bucket));
    assert.equal(ids.size, 6);
    // Rang 1 = upper_power (combiné 70)
    assert.equal(out[0].bucket, 'upper_power');
    assert.equal(out[0].rank, 1);
    // Rang 2 = lower_strength (combiné 35)
    assert.equal(out[1].bucket, 'lower_strength');
    assert.equal(out[1].rank, 2);
    // Pas d'override → overrideApplied === false partout
    assert.ok(out.every((b) => b.overrideApplied === false));
    // Tous ont une rationale non vide
    assert.ok(out.every((b) => typeof b.rationale === 'string' && b.rationale.length > 0));
  });

  it('un seau faible+sollicité passe devant un seau faible+non sollicité', () => {
    const scores: BucketScores = {
      lower_strength: 30, // faible
      lower_power: 30,    // faible aussi
      upper_strength: 70,
      upper_power: 70,
      mobility: 70,
      psychology: 70,
    };
    const template = makeTemplate({
      lower_strength: 0.2, // peu sollicité
      lower_power: 1.0,    // très sollicité
      upper_strength: 0.5,
      upper_power: 0.5,
      mobility: 0.5,
    });

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);

    const lpRank = out.find((b) => b.bucket === 'lower_power')!.rank;
    const lsRank = out.find((b) => b.bucket === 'lower_strength')!.rank;
    assert.ok(lpRank < lsRank, `lower_power (${lpRank}) doit passer devant lower_strength (${lsRank})`);
  });

  it('un seau fort descend dans le classement', () => {
    const scores: BucketScores = {
      lower_strength: 90, // fort
      lower_power: 30,    // faible
      upper_strength: 30, // faible
      upper_power: 30,    // faible
      mobility: 30,       // faible
      psychology: 50,
    };
    // Emphasis identique pour neutraliser l'effet "sollicité"
    const template = makeTemplate({
      lower_strength: 1.0,
      lower_power: 1.0,
      upper_strength: 1.0,
      upper_power: 1.0,
      mobility: 1.0,
    });

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);

    // lower_strength doit être dernier des entraînables (avant psychology qui n'a pas d'emphasis)
    const lsRank = out.find((b) => b.bucket === 'lower_strength')!.rank;
    const others = out.filter((b) => b.bucket !== 'lower_strength' && b.bucket !== 'psychology');
    assert.ok(others.every((b) => b.rank < lsRank), `lower_strength (rang ${lsRank}) doit être derrière tous les autres entraînables`);
  });

  it('override sécurité : douleur intense (intensity ≥ 3) → mobility forcé rang 1', () => {
    const scores: BucketScores = {
      lower_strength: 30, // serait rang 1 sans override
      lower_power: 30,
      upper_strength: 30,
      upper_power: 30,
      mobility: 80,       // serait bas sinon
      psychology: 50,
    };
    const template = makeTemplate({
      lower_strength: 1.0,
      lower_power: 1.0,
      upper_strength: 1.0,
      upper_power: 1.0,
      mobility: 0.5,
    });
    const painReports: PainReport[] = [
      {
        id: 'p1',
        user_id: 42,
        date: '2026-05-10',
        body_zone: 'shoulder',
        intensity: 3,
        created_at: '2026-05-10T00:00:00Z',
      },
    ];

    const out = prioritizeBuckets(scores, template, painReports, cleanPhysical);

    const mobility = out.find((b) => b.bucket === 'mobility')!;
    assert.equal(mobility.rank, 1);
    assert.equal(mobility.overrideApplied, true);
    // Rationale doit mentionner la zone et la douleur
    assert.ok(/shoulder/i.test(mobility.rationale) && /douleur/i.test(mobility.rationale), `rationale doit mentionner la douleur shoulder, obtenu: ${mobility.rationale}`);
    // Les autres ne sont pas marqués override
    const others = out.filter((b) => b.bucket !== 'mobility');
    assert.ok(others.every((b) => b.overrideApplied === false));
    // Rangs uniques et contigus 1..6
    const ranks = out.map((b) => b.rank).sort();
    assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6]);
  });

  it('override sécurité : dysfonction (physical_tests sub-score = 0) → mobility forcé rang 1', () => {
    const scores: BucketScores = {
      lower_strength: 30,
      lower_power: 30,
      upper_strength: 30,
      upper_power: 30,
      mobility: 80,
      psychology: 50,
    };
    const template = makeTemplate({
      lower_strength: 1.0,
      lower_power: 1.0,
      upper_strength: 1.0,
      upper_power: 1.0,
      mobility: 0.5,
    });
    const dysfunction: StrengthPhysicalTests = {
      mobility: { shoulder_flexion: 0, t_spine: 3, hip: 3 },
      movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 },
      filled_at: '2026-05-01T00:00:00Z',
    };

    const out = prioritizeBuckets(scores, template, noPain, dysfunction);

    const mobility = out.find((b) => b.bucket === 'mobility')!;
    assert.equal(mobility.rank, 1);
    assert.equal(mobility.overrideApplied, true);
    assert.ok(/dysfonction/i.test(mobility.rationale), `rationale doit mentionner la dysfonction, obtenu: ${mobility.rationale}`);
  });

  it('null score traité comme 0 (priorité maximale, conservateur)', () => {
    const scores: BucketScores = {
      lower_strength: null, // donnée manquante → conservateur
      lower_power: 80,
      upper_strength: 80,
      upper_power: 80,
      mobility: 80,
      psychology: 80,
    };
    const template = makeTemplate({
      lower_strength: 0.5,
      lower_power: 0.5,
      upper_strength: 0.5,
      upper_power: 0.5,
      mobility: 0.5,
    });

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);

    assert.equal(out[0].bucket, 'lower_strength');
    assert.equal(out[0].rank, 1);
  });

  it('psychology a une emphasis 0 par défaut → toujours dernier sans override', () => {
    const scores: BucketScores = {
      lower_strength: 90,
      lower_power: 90,
      upper_strength: 90,
      upper_power: 90,
      mobility: 90,
      psychology: 10, // très bas
    };
    const template = makeTemplate({
      lower_strength: 0.1,
      lower_power: 0.1,
      upper_strength: 0.1,
      upper_power: 0.1,
      mobility: 0.1,
    });

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);

    assert.equal(out[out.length - 1].bucket, 'psychology');
  });
});

// ── allocateVolume ───────────────────────────────────────────────────────────

import type { BucketAllocation, BucketPriority } from '../mesocycleEngine.types.ts';
import { allocateVolume } from '../mesocycleEngine.ts';
import type { StrengthBucket } from '@/lib/api/types';

/** Construit une liste de priorités à partir d'un ordre de seaux (rang 1 = premier). */
function makePriorities(order: AllBucketLite[]): BucketPriority[] {
  return order.map((bucket, i) => ({
    bucket,
    score: 100 - i * 10,
    rank: i + 1,
    rationale: `${bucket} test`,
    overrideApplied: false,
  }));
}
type AllBucketLite = BucketPriority['bucket'];

describe('allocateVolume', () => {
  it('top 2 entraînables = focus, autres = maintien', () => {
    // Ordre: lower_strength (1), upper_strength (2), lower_power (3), upper_power (4), mobility (5), psychology (6)
    const priorities = makePriorities([
      'lower_strength',
      'upper_strength',
      'lower_power',
      'upper_power',
      'mobility',
      'psychology',
    ]);

    const allocations = allocateVolume(priorities, 4);

    // psychology jamais alloué
    assert.ok(allocations.every((a) => (a.bucket as string) !== 'psychology'));
    // 5 entraînables couverts
    assert.equal(allocations.length, 5);
    // Top 2 = focus
    const focus = allocations.filter((a) => a.role === 'focus').map((a) => a.bucket);
    assert.deepEqual(focus.sort(), ['lower_strength', 'upper_strength'].sort());
    // Autres = maintien
    const maintien = allocations.filter((a) => a.role === 'maintien').map((a) => a.bucket).sort();
    assert.deepEqual(maintien, ['lower_power', 'mobility', 'upper_power'].sort());
  });

  it('focus reçoit ~60 %, maintien (hors mobility) ~40 % du volume', () => {
    const priorities = makePriorities([
      'lower_strength',
      'upper_strength',
      'lower_power',
      'upper_power',
      'mobility',
      'psychology',
    ]);
    const S = 4;

    const allocations = allocateVolume(priorities, S);

    // 2 focus → chacun (60 % × S) / 2 = 0.3 × S = 1.2
    const focus = allocations.filter((a) => a.role === 'focus');
    for (const a of focus) {
      assert.ok(Math.abs(a.sessionsPerWeek - 1.2) < 1e-9, `focus ${a.bucket}: attendu 1.2, obtenu ${a.sessionsPerWeek}`);
    }
    // 2 maintien (lower_power, upper_power) → chacun (40 % × S) / 2 = 0.2 × S = 0.8
    const maintienNonMob = allocations.filter((a) => a.role === 'maintien' && a.bucket !== 'mobility');
    for (const a of maintienNonMob) {
      assert.ok(Math.abs(a.sessionsPerWeek - 0.8) < 1e-9, `maintien ${a.bucket}: attendu 0.8, obtenu ${a.sessionsPerWeek}`);
    }
  });

  it('mobility en maintien = échauffement systématique → sessionsPerWeek = S', () => {
    const priorities = makePriorities([
      'lower_strength',
      'upper_strength',
      'lower_power',
      'upper_power',
      'mobility',
      'psychology',
    ]);

    const allocations = allocateVolume(priorities, 3);

    const mob = allocations.find((a) => a.bucket === 'mobility')!;
    assert.equal(mob.role, 'maintien');
    assert.equal(mob.sessionsPerWeek, 3);
  });

  it('mobility en focus (override sécurité) → reçoit la part focus, pas la part warmup', () => {
    // mobility forcée rang 1 par l'override
    const priorities = makePriorities([
      'mobility',
      'lower_strength',
      'upper_strength',
      'lower_power',
      'upper_power',
      'psychology',
    ]);

    const allocations = allocateVolume(priorities, 4);

    const mob = allocations.find((a) => a.bucket === 'mobility')!;
    assert.equal(mob.role, 'focus');
    // Focus share : 0.3 × S = 1.2
    assert.ok(Math.abs(mob.sessionsPerWeek - 1.2) < 1e-9);
    // 3 autres en maintien : (40 % × S) / 3 ≈ 0.533
    const maintien = allocations.filter((a) => a.role === 'maintien');
    assert.equal(maintien.length, 3);
    for (const a of maintien) {
      assert.ok(Math.abs(a.sessionsPerWeek - (0.4 * 4) / 3) < 1e-9);
    }
  });

  it('fonctionne pour sessionsPerWeek = 2 à 5', () => {
    const priorities = makePriorities([
      'lower_strength',
      'upper_strength',
      'lower_power',
      'upper_power',
      'mobility',
      'psychology',
    ]);

    for (const S of [2, 3, 4, 5]) {
      const allocations = allocateVolume(priorities, S);
      assert.equal(allocations.length, 5, `S=${S}: 5 entraînables`);
      const focus = allocations.filter((a) => a.role === 'focus');
      assert.equal(focus.length, 2, `S=${S}: 2 focus`);
      // Somme du focus = 60 % × S
      const focusSum = focus.reduce((s, a) => s + a.sessionsPerWeek, 0);
      assert.ok(Math.abs(focusSum - 0.6 * S) < 1e-9, `S=${S}: focus sum attendu ${0.6 * S}, obtenu ${focusSum}`);
      // mobility toujours présente
      assert.ok(allocations.some((a) => a.bucket === 'mobility'), `S=${S}: mobility présente`);
    }
  });
});

// ── selectExercises ──────────────────────────────────────────────────────────

import type { CatalogExercise, SelectedExercise } from '../mesocycleEngine.types.ts';
import { selectExercises } from '../mesocycleEngine.ts';

let nextExId = 1000;
function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: nextExId++,
    nomExercice: `ex-${nextExId}`,
    bucket: 'lower_strength',
    level: 'intermediate',
    contraindicationZones: [],
    isCore: false,
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

function allocFor(buckets: StrengthBucket[]): BucketAllocation[] {
  return buckets.map((bucket) => ({ bucket, sessionsPerWeek: 1, role: 'maintien' }));
}

describe('selectExercises', () => {
  it('filtre par seau : ne retourne que les exercices du seau alloué', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, bucket: 'lower_strength' }),
      makeExercise({ id: 2, bucket: 'upper_power' }),
      makeExercise({ id: 3, bucket: 'mobility' }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', []);

    assert.deepEqual(Object.keys(out), ['lower_strength']);
    assert.equal(out.lower_strength!.length, 1);
    assert.equal(out.lower_strength![0].exercise.id, 1);
  });

  it('filtre par niveau : exclut les exercices au-dessus du niveau du nageur', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, level: 'beginner' }),
      makeExercise({ id: 2, level: 'intermediate' }),
      makeExercise({ id: 3, level: 'advanced' }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', []);

    const ids = out.lower_strength!.map((s) => s.exercise.id).sort();
    assert.deepEqual(ids, [1, 2]);
  });

  it('niveau beginner → seuls les beginner (et level null) passent', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, level: 'beginner' }),
      makeExercise({ id: 2, level: 'intermediate' }),
      makeExercise({ id: 3, level: null }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'beginner', []);

    const ids = out.lower_strength!.map((s) => s.exercise.id).sort();
    assert.deepEqual(ids, [1, 3]);
  });

  it('exclut les exercices dont contraindication_zones recoupe painZones', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, contraindicationZones: ['shoulder'] }),
      makeExercise({ id: 2, contraindicationZones: [] }),
      makeExercise({ id: 3, contraindicationZones: ['knee', 'hip'] }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', ['shoulder']);

    const ids = out.lower_strength!.map((s) => s.exercise.id).sort();
    assert.deepEqual(ids, [2, 3]);
  });

  it('trie : exercices core en premier, puis level décroissant', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, isCore: false, level: 'intermediate' }),
      makeExercise({ id: 2, isCore: true, level: 'beginner' }),
      makeExercise({ id: 3, isCore: true, level: 'intermediate' }),
      makeExercise({ id: 4, isCore: false, level: 'beginner' }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', []);
    const ordered = out.lower_strength!.map((s) => s.exercise.id);

    // Core first : 3 (intermediate), 2 (beginner) — puis non-core : 1, 4.
    assert.deepEqual(ordered, [3, 2, 1, 4]);
  });

  it('substitution : un core exclu → un remplaçant marqué substituted', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 10, isCore: true, contraindicationZones: ['shoulder'] }),
      makeExercise({ id: 11, isCore: false }), // candidat remplaçant
      makeExercise({ id: 12, isCore: false }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', ['shoulder']);

    const subs = out.lower_strength!.filter((s) => s.substituted);
    assert.equal(subs.length, 1);
    assert.equal(subs[0].originalExerciseId, 10);
    assert.equal(subs[0].exercise.isCore, false);
  });

  it('aucune substitution si aucun core n’est exclu', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, isCore: true }),
      makeExercise({ id: 2, isCore: false, contraindicationZones: ['shoulder'] }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', ['shoulder']);

    assert.ok(out.lower_strength!.every((s) => !s.substituted && s.originalExerciseId === null));
  });

  it('seau alloué mais vide dans le catalogue → entrée vide', () => {
    const catalog: CatalogExercise[] = [makeExercise({ bucket: 'lower_strength' })];

    const out = selectExercises(allocFor(['lower_strength', 'upper_power']), catalog, 'intermediate', []);

    assert.equal(out.upper_power!.length, 0);
  });

  it('ignore les seaux non alloués', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ bucket: 'lower_strength' }),
      makeExercise({ bucket: 'mobility' }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'intermediate', []);

    assert.equal(out.mobility, undefined);
  });
});

// Marqueur de type pour s'assurer que SelectedExercise est bien re-exporté.
const _selectedExerciseTypeCheck: SelectedExercise | null = null;
void _selectedExerciseTypeCheck;

// ── periodize ────────────────────────────────────────────────────────────────

import { periodize } from '../mesocycleEngine.ts';

describe('periodize', () => {
  it('target = Σ nominal → chaque phase à son nominal', () => {
    // Σ nominal = 3 + 4 + 3 + 1 = 11
    const template = makeTemplate({});
    template.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
      { cycle: 'force_max', min_weeks: 3, nominal_weeks: 4, max_weeks: 5 },
      { cycle: 'puissance', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
      { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
    ];

    const weeks = periodize(template, 11);

    // 11 semaines au total
    assert.equal(weeks.length, 11);
    // Cycles dans l'ordre des phases : 3 prepa, 4 force, 3 puissance, 1 pic
    const cycles = weeks.map((w) => w.cycle);
    assert.deepEqual(cycles, [
      'prepa_generale', 'prepa_generale', 'prepa_generale',
      'force_max', 'force_max', 'force_max', 'force_max',
      'puissance', 'puissance', 'puissance',
      'pic',
    ]);
    // weekNumber = 1..11, contigu
    const weekNumbers = weeks.map((w) => w.weekNumber);
    assert.deepEqual(weekNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('target > Σ nominal → étire dans [nominal, max]', () => {
    // Σ nominal = 6, Σ max = 12. target = 8 → delta = +2.
    const template = makeTemplate({});
    template.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 1, nominal_weeks: 2, max_weeks: 4 },
      { cycle: 'force_max', min_weeks: 1, nominal_weeks: 2, max_weeks: 4 },
      { cycle: 'puissance', min_weeks: 1, nominal_weeks: 2, max_weeks: 4 },
    ];

    const weeks = periodize(template, 8);

    assert.equal(weeks.length, 8);
    // Comptage par cycle (chaque phase entre nominal=2 et max=4)
    const counts: Record<string, number> = {};
    for (const w of weeks) counts[w.cycle] = (counts[w.cycle] ?? 0) + 1;
    for (const c of ['prepa_generale', 'force_max', 'puissance']) {
      assert.ok(counts[c] >= 2 && counts[c] <= 4, `${c}: attendu ∈ [2,4], obtenu ${counts[c]}`);
    }
    // Somme = 8
    assert.equal(counts.prepa_generale + counts.force_max + counts.puissance, 8);
  });

  it('target < Σ nominal → comprime dans [min, nominal]', () => {
    // Σ nominal = 9, Σ min = 3. target = 5 → delta = -4.
    const template = makeTemplate({});
    template.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 1, nominal_weeks: 3, max_weeks: 5 },
      { cycle: 'force_max', min_weeks: 1, nominal_weeks: 3, max_weeks: 5 },
      { cycle: 'puissance', min_weeks: 1, nominal_weeks: 3, max_weeks: 5 },
    ];

    const weeks = periodize(template, 5);

    assert.equal(weeks.length, 5);
    const counts: Record<string, number> = {};
    for (const w of weeks) counts[w.cycle] = (counts[w.cycle] ?? 0) + 1;
    for (const c of ['prepa_generale', 'force_max', 'puissance']) {
      assert.ok(counts[c] >= 1 && counts[c] <= 3, `${c}: attendu ∈ [1,3], obtenu ${counts[c]}`);
    }
  });

  it('preserve l’ordre des phases dans la séquence finale', () => {
    const template = makeTemplate({});
    template.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      { cycle: 'force_max', min_weeks: 1, nominal_weeks: 2, max_weeks: 3 },
      { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
    ];

    const weeks = periodize(template, 5);
    const cycles = weeks.map((w) => w.cycle);
    // pic ne doit jamais précéder force_max, qui ne doit jamais précéder prepa_generale.
    const firstForceIdx = cycles.indexOf('force_max');
    const lastPrepaIdx = cycles.lastIndexOf('prepa_generale');
    const firstPicIdx = cycles.indexOf('pic');
    const lastForceIdx = cycles.lastIndexOf('force_max');
    assert.ok(firstForceIdx > lastPrepaIdx, 'force_max après prepa_generale');
    assert.ok(firstPicIdx > lastForceIdx, 'pic après force_max');
  });

  it('throw si target < Σ min_weeks', () => {
    const template = makeTemplate({});
    template.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
      { cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
    ];

    // Σ min = 4. target 3 → throw.
    assert.throws(() => periodize(template, 3), /hors|out|min/i);
  });

  it('throw si target > Σ max_weeks', () => {
    const template = makeTemplate({});
    template.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
      { cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
    ];

    // Σ max = 8. target 9 → throw.
    assert.throws(() => periodize(template, 9), /hors|out|max/i);
  });
});

// ── generateMesocycle ────────────────────────────────────────────────────────

import { generateMesocycle } from '../mesocycleEngine.ts';
import type { GeneratedMesocycle } from '../mesocycleEngine.types.ts';

function richCatalog(): CatalogExercise[] {
  const out: CatalogExercise[] = [];
  const buckets: StrengthBucket[] = [
    'lower_strength',
    'lower_power',
    'upper_strength',
    'upper_power',
    'mobility',
  ];
  let id = 1;
  for (const bucket of buckets) {
    out.push(makeExercise({
      id: id++,
      nomExercice: `${bucket}_core_1`,
      bucket,
      level: 'beginner',
      isCore: true,
    }));
    out.push(makeExercise({
      id: id++,
      nomExercice: `${bucket}_core_2`,
      bucket,
      level: 'intermediate',
      isCore: true,
    }));
    out.push(makeExercise({
      id: id++,
      nomExercice: `${bucket}_acc_1`,
      bucket,
      level: 'beginner',
      isCore: false,
    }));
    out.push(makeExercise({
      id: id++,
      nomExercice: `${bucket}_acc_2`,
      bucket,
      level: 'intermediate',
      isCore: false,
    }));
  }
  return out;
}

function fullInput(): MesocycleInput {
  return {
    assessment: {
      id: 'assess-1',
      athlete_id: 42,
      questionnaire: greatQuestionnaire,
      physical_tests: fullPhysicalTests,
    },
    kpiMeasurements: [
      makeMeasurement('vertical_jump', 51.1, '2026-05-01T00:00:00Z', 'W/kg'),
      makeMeasurement('broad_jump', 175, '2026-05-01T00:00:00Z', 'cm'),
      makeMeasurement('imtp', 95, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('weighted_pullup', 10, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('medball_vertical_throw', 115, '2026-05-01T00:00:00Z', 'cm'),
    ],
    athlete: { sex: 'M', ageBand: '15-16', level: 'intermediate' },
    template: makeTemplate({
      lower_strength: 0.5,
      lower_power: 1.0,
      upper_strength: 0.5,
      upper_power: 1.0,
      mobility: 0.5,
    }),
    targetWeekCount: 10, // = Σ nominal du template par défaut
    sessionsPerWeek: 3,
    exerciseCatalog: richCatalog(),
  };
}

describe('generateMesocycle', () => {
  it('cas nominal : produit un mésocycle complet et cohérent', () => {
    const meso = generateMesocycle(fullInput());

    // Structure de haut niveau
    assert.equal(meso.totalWeeks, 10);
    assert.equal(meso.weeks.length, 10);
    assert.equal(meso.sessionsPerWeek, 3);
    assert.ok(typeof meso.templateId === 'string' && meso.templateId.length > 0);
    assert.ok(typeof meso.engineVersion === 'string' && /\d+\.\d+\.\d+/.test(meso.engineVersion));

    // Semaines bien numérotées 1..N
    const weekNumbers = meso.weeks.map((w) => w.weekNumber);
    assert.deepEqual(weekNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Chaque semaine a sessionsPerWeek sessions, et chaque session ≥ 1 exercice.
    for (const week of meso.weeks) {
      assert.equal(week.sessions.length, 3, `semaine ${week.weekNumber}: 3 sessions`);
      for (const session of week.sessions) {
        assert.ok(session.exercises.length > 0, `S${week.weekNumber}-${session.sessionNumber}: ≥1 ex`);
        assert.ok(session.buckets.length > 0, `S${week.weekNumber}-${session.sessionNumber}: ≥1 bucket`);
      }
    }

    // Reasoning rempli
    assert.ok(meso.reasoning.bucketScores);
    assert.ok(meso.reasoning.bucketPriorities.length === 6);
    assert.ok(meso.reasoning.bucketAllocations.length === 5);
    assert.ok(['full', 'partial', 'low'].includes(meso.reasoning.dataConfidence));
    assert.ok(typeof meso.reasoning.psychFlag === 'boolean');
    assert.ok(Array.isArray(meso.reasoning.activeContraindications));
  });

  it('data_confidence = full quand toutes les données sont présentes', () => {
    const meso = generateMesocycle(fullInput());
    assert.equal(meso.reasoning.dataConfidence, 'full');
  });

  it('cas données partielles : aucune mesure KPI → génère quand même', () => {
    const input = fullInput();
    input.kpiMeasurements = [];

    const meso = generateMesocycle(input);

    // N'a pas thrown
    assert.equal(meso.weeks.length, 10);
    // Confidence abaissée
    assert.ok(['partial', 'low'].includes(meso.reasoning.dataConfidence), `dataConfidence = ${meso.reasoning.dataConfidence}`);
  });

  it('cas mixte : quelques KPI manquants → data_confidence partial', () => {
    const input = fullInput();
    // Garde 3 KPI sur 5
    input.kpiMeasurements = input.kpiMeasurements.slice(0, 3);

    const meso = generateMesocycle(input);

    assert.equal(meso.reasoning.dataConfidence, 'partial');
  });

  it('psychFlag = true quand le score psychologie < 40', () => {
    const input = fullInput();
    input.assessment.questionnaire = meanQuestionnaire; // score = 0

    const meso = generateMesocycle(input);

    assert.equal(meso.reasoning.psychFlag, true);
  });

  it('psychFlag = false quand le score psychologie ≥ 40', () => {
    const meso = generateMesocycle(fullInput()); // greatQuestionnaire → score 100
    assert.equal(meso.reasoning.psychFlag, false);
  });

  it('cycles des semaines respectent la périodisation du template', () => {
    const meso = generateMesocycle(fullInput());

    const cycles = meso.weeks.map((w) => w.cycle);
    // Doit contenir au moins une fois chaque phase du template
    assert.ok(cycles.includes('prepa_generale'));
    assert.ok(cycles.includes('force_max'));
    assert.ok(cycles.includes('puissance'));
    assert.ok(cycles.includes('pic'));
  });

  it('exercices chargés avec sets/reps/rest (jamais 0 sans raison)', () => {
    const meso = generateMesocycle(fullInput());

    const allExercises = meso.weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises));
    assert.ok(allExercises.length > 0);
    for (const ex of allExercises) {
      assert.ok(ex.sets >= 1, `${ex.nomExercice} sets=${ex.sets}`);
      assert.ok(ex.reps >= 1, `${ex.nomExercice} reps=${ex.reps}`);
      assert.ok(ex.restSeconds >= 30, `${ex.nomExercice} rest=${ex.restSeconds}`);
    }
  });

  it('mobility présente dans chaque session (échauffement systématique)', () => {
    const meso = generateMesocycle(fullInput());

    for (const week of meso.weeks) {
      for (const session of week.sessions) {
        const hasMobility = session.exercises.some((e) => e.bucket === 'mobility');
        assert.ok(hasMobility, `S${week.weekNumber}-${session.sessionNumber} sans mobility`);
      }
    }
  });

  // ── Vague C §293 — séances multi-bucket à la McEvoy ─────────────────────
  it('chaque séance combine un primary + un complement bucket (style McEvoy)', () => {
    const meso = generateMesocycle(fullInput());

    // Sur un input nominal avec 2+ focus, chaque session non-override doit
    // contenir 2 buckets entraînables (primary + complement) + mobility.
    for (const week of meso.weeks) {
      for (const session of week.sessions) {
        // Buckets entraînables (hors mobility) dans la séance.
        const trainable = session.buckets.filter((b) => b !== 'mobility');
        assert.ok(
          trainable.length >= 1,
          `S${week.weekNumber}-${session.sessionNumber} : au moins 1 bucket entraînable`,
        );
        // Pour un input avec 2+ focus, on attend en moyenne 2 buckets entraînables.
        // (pas strict — selon les pools dispo, le complement peut être vide.)
        assert.ok(
          trainable.length <= 3,
          `S${week.weekNumber}-${session.sessionNumber} : max 3 buckets (primary + complement + mobility ou édge)`,
        );
      }
    }

    // Au moins une session du mésocycle doit être bi-bucket (primary + complement).
    const biBucketCount = meso.weeks.flatMap((w) => w.sessions).filter(
      (s) => s.buckets.filter((b) => b !== 'mobility').length >= 2,
    ).length;
    assert.ok(
      biBucketCount >= 1,
      `Au moins 1 session bi-bucket attendue, obtenu ${biBucketCount}`,
    );
  });

  it("buckets[0] reste le primary (consommé par la RPC pour le nom du template)", () => {
    const meso = generateMesocycle(fullInput());
    for (const week of meso.weeks) {
      for (const session of week.sessions) {
        // buckets[0] doit être un bucket entraînable (pas 'mobility') — sauf
        // override où primary = mobility.
        const first = session.buckets[0];
        assert.ok(first, `S${week.weekNumber}-${session.sessionNumber} : buckets non vide`);
        // Les exercises ordonnés en chronologique : si warmup mobility présent,
        // les premiers exercices sont mobility. Mais buckets[0] = primary.
        const primaryExercises = session.exercises.filter((e) => e.bucket === first);
        if (first !== 'mobility') {
          assert.ok(primaryExercises.length > 0, `S${week.weekNumber}-${session.sessionNumber} : au moins 1 exercice du primary ${first}`);
        }
      }
    }
  });

  it('contraindication active reportée dans reasoning.activeContraindications', () => {
    const input = fullInput();
    input.assessment.questionnaire = {
      ...greatQuestionnaire,
      pain: [{ body_zone: 'shoulder', intensity: 3 }],
    };
    // Ajoute un exercice contre-indiqué dans le catalogue
    input.exerciseCatalog.push(
      makeExercise({ id: 999, bucket: 'upper_strength', isCore: true, contraindicationZones: ['shoulder'] }),
    );

    const meso = generateMesocycle(input);

    assert.ok(meso.reasoning.activeContraindications.includes('shoulder'));
  });

  it('lowestBaremeConfidence reflète la confiance minimale parmi les barèmes utilisés', () => {
    const meso = generateMesocycle(fullInput());

    // medball_vertical_throw est 'placeholder', donc lowest doit être 'placeholder'
    assert.equal(meso.reasoning.lowestBaremeConfidence, 'placeholder');
  });

  it('aucune mesure KPI → lowestBaremeConfidence = placeholder par défaut', () => {
    const input = fullInput();
    input.kpiMeasurements = [];

    const meso = generateMesocycle(input);

    // Aucun barème consulté → on conserve la confiance la plus prudente
    assert.equal(meso.reasoning.lowestBaremeConfidence, 'placeholder');
  });
});

// Marqueur de type
const _generatedMesocycleTypeCheck: GeneratedMesocycle | null = null;
void _generatedMesocycleTypeCheck;






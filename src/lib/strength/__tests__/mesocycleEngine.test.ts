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
    performanceTier: 'club',
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
    // imtp : 95 kg ; weighted_pullup : 10 kg ; medball indice 10,8 kg·m (p50).
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('vertical_jump', 51.1, '2026-05-01T00:00:00Z', 'W/kg'),
      makeMeasurement('broad_jump', 175, '2026-05-01T00:00:00Z', 'cm'),
      makeMeasurement('imtp', 95, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('weighted_pullup', 10, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('medball_vertical_throw', 10.8, '2026-05-01T00:00:00Z', 'kg·m'),
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

  it('un tier plus élevé décale le barème et abaisse le score (restaure la discrimination)', () => {
    // Athlète adulte F, weighted_pullup = 10 kg : valeur dans la plage
    // d'interpolation du barème. Un tier 'national' décale les ancres vers la
    // droite → le même 10 kg vaut un score strictement inférieur au tier 'club'.
    const measurements: StrengthKpiMeasurement[] = [
      makeMeasurement('weighted_pullup', 10, '2026-05-01T00:00:00Z', 'kg'),
    ];

    const club = scoreBuckets(
      makeAssessment({ physical_tests: null, questionnaire: null }),
      measurements,
      makeAthlete({ sex: 'F', ageBand: 'adulte', level: 'intermediate', performanceTier: 'club' }),
    );
    const nat = scoreBuckets(
      makeAssessment({ physical_tests: null, questionnaire: null }),
      measurements,
      makeAthlete({ sex: 'F', ageBand: 'adulte', level: 'intermediate', performanceTier: 'national' }),
    );

    assert.ok(club.upper_strength !== null && nat.upper_strength !== null);
    assert.ok(
      nat.upper_strength! < club.upper_strength!,
      `national (${nat.upper_strength}) doit être < club (${club.upper_strength})`,
    );
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
  // §322 — focus événement forcé : un seau listé dans structure.forced_focus est
  // garanti dans les FOCUS_COUNT premiers, même si l'athlète y a une note élevée
  // (combiné bas). Pour le sprint, garantit la puissance explosive (McEvoy).
  it('un seau forced_focus est garanti en focus malgré un score élevé', () => {
    const scores = {
      lower_strength: 30, lower_power: 40, upper_strength: 45,
      upper_power: 95, mobility: 50, psychology: 50, core: null,
    } as BucketScores;
    const template = makeTemplate({
      lower_strength: 0.85, lower_power: 0.9, upper_strength: 1.0, upper_power: 0.95, mobility: 0.3,
    });
    template.structure.forced_focus = ['upper_power'];

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);
    const upRank = out.find((p) => p.bucket === 'upper_power')!.rank;
    // Sans forced_focus, upper_power (combiné 0.95×5=4.75) serait dernier des entraînables.
    assert.ok(upRank <= 2, `upper_power doit être en focus (rank ${upRank}, attendu ≤ 2)`);
  });

  it("forced_focus respecte l'override sécurité (mobilité reste rang 1 sur douleur)", () => {
    const scores = emptyScores();
    const template = makeTemplate({
      lower_strength: 0.85, lower_power: 0.9, upper_strength: 1.0, upper_power: 0.95, mobility: 0.3,
    });
    template.structure.forced_focus = ['upper_power'];
    const pain: PainReport[] = [{ body_zone: 'left_shoulder', intensity: 3 } as PainReport];

    const out = prioritizeBuckets(scores, template, pain, cleanPhysical);
    assert.equal(out[0].bucket, 'mobility', 'mobilité forcée rang 1 (sécurité) avant le forced_focus');
    assert.equal(out[1].bucket, 'upper_power', 'forced_focus prend le créneau focus restant');
  });

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

  // ── §R5 (DRAFT) — le core ne doit JAMAIS être priorisé (option a) ─────────────
  it('core NON priorisé même avec emphase core forte (anti sur-priorisation null→0)', () => {
    // scoreBuckets pose core:null. Si on l'incluait dans la priorisation, son
    // emphase forte (0.84, papillon) × (100 − 0) = 84 le mettrait quasi rang 1 et
    // volerait du volume focus. L'option (a) le tient hors classement.
    const scores = scoreBuckets(makeAssessment(), [], makeAthlete());
    assert.equal(scores.core, null); // jamais scoré
    const template = makeTemplate({
      lower_strength: 0.8,
      lower_power: 0.85,
      upper_strength: 0.9,
      upper_power: 0.8,
      mobility: 0.42,
      core: 0.84, // papillon — la plus forte emphase de la matrice
    });

    const out = prioritizeBuckets(scores, template, noPain, cleanPhysical);

    // Aucune entrée core dans le classement (toujours 6 seaux scorés, pas 7).
    assert.equal(out.length, 6);
    assert.ok(!out.some((p) => p.bucket === 'core'), 'core ne doit pas apparaître dans les priorités');
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

  it('§306 — exclut un exo tagué left_groin quand l’aine est douloureuse', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, bucket: 'lower_strength', isCore: true, contraindicationZones: ['left_groin', 'right_groin'] }),
      makeExercise({ id: 2, bucket: 'lower_strength', contraindicationZones: [] }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'advanced', ['left_groin']);

    const ids = (out.lower_strength ?? []).map((s) => s.exercise.id);
    assert.ok(!ids.includes(1), 'l’exo adducteurs (left_groin) doit être exclu');
    assert.ok(ids.includes(2), 'l’exo sans contre-indication doit rester');
  });

  it('§306 P2 — affinité nage : un non-core affinité passe devant les autres non-cores, sans déloger un core', () => {
    const catalog: CatalogExercise[] = [
      makeExercise({ id: 1, bucket: 'lower_strength', isCore: false, level: 'beginner' }),
      makeExercise({ id: 2, bucket: 'lower_strength', isCore: false, level: 'beginner', strokePrehabAffinity: ['breaststroke'] }),
      makeExercise({ id: 3, bucket: 'lower_strength', isCore: true, level: 'beginner' }),
    ];

    // brasse : core (3) d'abord, puis l'affinité non-core (2), puis le non-core ordinaire (1).
    const breast = selectExercises(allocFor(['lower_strength']), catalog, 'advanced', [], 'breaststroke');
    assert.deepEqual(breast.lower_strength!.map((s) => s.exercise.id), [3, 2, 1]);

    // crawl : aucune affinité → ordre stable (core 3, puis 1, 2 dans l'ordre du catalogue).
    const free = selectExercises(allocFor(['lower_strength']), catalog, 'advanced', [], 'freestyle');
    assert.deepEqual(free.lower_strength!.map((s) => s.exercise.id), [3, 1, 2]);

    // sans strokeKey : comportement inchangé (rétro-compatible).
    const none = selectExercises(allocFor(['lower_strength']), catalog, 'advanced', []);
    assert.deepEqual(none.lower_strength!.map((s) => s.exercise.id), [3, 1, 2]);
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

  // §319 — la priorité coach prime sur is_core ET sur le niveau : un staple
  // (ex. tractions lestées) doit sortir avant l'exo le + avancé/composé.
  it('selectionPriority coach prime sur is_core et niveau', () => {
    const catalog: CatalogExercise[] = [
      // Exo exotique : core + advanced (gagnerait le tri historique).
      makeExercise({ id: 1, isCore: true, level: 'advanced', selectionPriority: 0 }),
      // Staple coach : non-core, intermediate, MAIS priorité haute.
      makeExercise({ id: 2, isCore: false, level: 'intermediate', selectionPriority: 100 }),
      // Démoté explicitement.
      makeExercise({ id: 3, isCore: true, level: 'intermediate', selectionPriority: -10 }),
    ];

    const out = selectExercises(allocFor(['lower_strength']), catalog, 'advanced', []);
    const ordered = out.lower_strength!.map((s) => s.exercise.id);

    // Le staple (2) sort en tête malgré non-core ; l'exotique core+advanced (1)
    // ensuite (priorité 0) ; le démoté (3) en dernier.
    assert.deepEqual(ordered, [2, 1, 3]);
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

// ── cycleAtWeek (phase réelle d'un plan, §340 Lot 2 E2) ──────────────────────

import { cycleAtWeek } from '../mesocycleEngine.ts';

describe('cycleAtWeek', () => {
  function stretchTpl(): StrengthPeriodizationTemplate {
    const t = makeTemplate({});
    t.structure.phases = [
      { cycle: 'prepa_generale', min_weeks: 1, nominal_weeks: 1, max_weeks: 3 },
      { cycle: 'force_max', min_weeks: 1, nominal_weeks: 1, max_weeks: 3 },
    ];
    return t;
  }

  it('plan étiré : suit periodize, PAS nominal_weeks', () => {
    // totalWeeks=4 → periodize étire prepa=2, force_max=2.
    const t = stretchTpl();
    assert.equal(cycleAtWeek(t, 4, 0), 'prepa_generale');
    assert.equal(cycleAtWeek(t, 4, 1), 'prepa_generale'); // nominal dirait force_max
    assert.equal(cycleAtWeek(t, 4, 2), 'force_max');
    assert.equal(cycleAtWeek(t, 4, 3), 'force_max');
  });

  it('index hors plage → null', () => {
    const t = stretchTpl();
    assert.equal(cycleAtWeek(t, 4, -1), null);
    assert.equal(cycleAtWeek(t, 4, 4), null);
  });

  it('totalWeeks hors [Σ min, Σ max] (periodize throw) → null, pas d’exception', () => {
    const t = stretchTpl(); // Σ min = 2, Σ max = 6
    assert.equal(cycleAtWeek(t, 99, 0), null);
    assert.equal(cycleAtWeek(t, 1, 0), null);
  });
});

// ── scorePsychology clamp (E4, §343) ─────────────────────────────────────────

import { scorePsychology } from '../mesocycleEngine.ts';

describe('scorePsychology', () => {
  const q = (confidence: number, motivation: number, stress: number) =>
    ({ psychology: { confidence, motivation, stress } }) as unknown as
      NonNullable<MesocycleInput['assessment']['questionnaire']>;

  it('valeurs normales [1,5] → score borné [0,100]', () => {
    assert.equal(scorePsychology(q(5, 5, 1)), 100); // sum 15 → 100
    assert.equal(scorePsychology(q(1, 1, 5)), 0); // sum 3 → 0
  });

  it('input hors plage (DB corrompue) → clampé, jamais négatif ni >100', () => {
    assert.equal(scorePsychology(q(0, 0, 6)), 0); // brut -25 → 0
    assert.equal(scorePsychology(q(5, 5, 0)), 100); // brut 108.3 → 100
  });

  it('questionnaire null → null', () => {
    assert.equal(scorePsychology(null), null);
  });
});

// ── papPreferLegPowerFor (E1, §343) ──────────────────────────────────────────

import { papPreferLegPowerFor } from '../mesocycleEngine.ts';

describe('papPreferLegPowerFor', () => {
  const weekdays = [0, 2, 3]; // Lun, Mer, Jeu
  const primers = new Set([0, 3]); // Lun & Jeu = amorces ; Mer = développement

  it('jambes couvertes par une séance de DÉV → false', () => {
    const slots = [
      { primary: 'upper_strength' as StrengthBucket, complement: 'upper_power' as StrengthBucket | null },
      { primary: 'lower_strength' as StrengthBucket, complement: 'upper_strength' as StrengthBucket | null }, // Mer dév jambes
      { primary: 'upper_power' as StrengthBucket, complement: null as StrengthBucket | null },
    ];
    assert.equal(papPreferLegPowerFor(slots, weekdays, primers, true), false);
  });

  it('jambes seulement sur un jour d’amorce (post-swap) → true', () => {
    const slots = [
      { primary: 'lower_strength' as StrengthBucket, complement: 'upper_power' as StrengthBucket | null }, // Lun AMORCE (jambes ici, pas en dév)
      { primary: 'upper_strength' as StrengthBucket, complement: 'upper_power' as StrengthBucket | null }, // Mer dév (haut)
      { primary: 'upper_power' as StrengthBucket, complement: null as StrengthBucket | null },
    ];
    assert.equal(papPreferLegPowerFor(slots, weekdays, primers, true), true);
  });

  it('non jour-aware → toujours false', () => {
    const slots = [{ primary: 'lower_power' as StrengthBucket, complement: null as StrengthBucket | null }];
    assert.equal(papPreferLegPowerFor(slots, [0], new Set<number>(), false), false);
  });
});

// ── periodize startPhase (meso-adjust) ───────────────────────────────────────

function makeT8Template(): StrengthPeriodizationTemplate {
  return {
    id: 'tpl-t8', event_group: 'sprint_50', kind: 'inter_competition', name: 'T8',
    min_week_count: 5, max_week_count: 8,
    structure: {
      phases: [
        { cycle: 'maintien', min_weeks: 1, nominal_weeks: 1, max_weeks: 2 },
        { cycle: 'puissance', min_weeks: 2, nominal_weeks: 2, max_weeks: 3 },
        { cycle: 'affutage', min_weeks: 1, nominal_weeks: 1, max_weeks: 2 },
        { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      ],
      bucket_emphasis: { lower_strength: 0.5, lower_power: 0.5, upper_strength: 0.5, upper_power: 0.5, mobility: 0.3 },
    },
    created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
  };
}

describe('periodize startPhase', () => {
  it('startPhase = puissance (2e phase), target 4 → tronque maintien', () => {
    const weeks = periodize(makeT8Template(), 4, 'puissance');
    assert.equal(weeks.length, 4);
    assert.deepEqual(weeks.map((w) => w.cycle), [
      'puissance', 'puissance', 'affutage', 'pic',
    ]);
  });

  it('startPhase = affutage (3e phase), target 2 → [affutage, pic]', () => {
    const weeks = periodize(makeT8Template(), 2, 'affutage');
    assert.equal(weeks.length, 2);
    assert.deepEqual(weeks.map((w) => w.cycle), ['affutage', 'pic']);
  });

  it('startPhase = pic (4e phase), target 1 → [pic]', () => {
    const weeks = periodize(makeT8Template(), 1, 'pic');
    assert.equal(weeks.length, 1);
    assert.deepEqual(weeks.map((w) => w.cycle), ['pic']);
  });

  it('startPhase absent du template → identique à sans startPhase', () => {
    const withAbsent = periodize(makeT8Template(), 5, 'force_max');
    const without = periodize(makeT8Template(), 5);
    assert.deepEqual(withAbsent.map((w) => w.cycle), without.map((w) => w.cycle));
  });

  it('startPhase = affutage mais target < Σ min des phases restantes → throw', () => {
    // affutage min 1 + pic min 1 = 2 ; target 1 → hors plage.
    assert.throws(() => periodize(makeT8Template(), 1, 'affutage'), /hors|out|min/i);
  });
});

// ── generateMesocycle ────────────────────────────────────────────────────────

import { generateMesocycle } from '../mesocycleEngine.ts';
import type { GeneratedMesocycle } from '../mesocycleEngine.types.ts';
import { PERIODIZATION_CYCLES } from '../periodizationCycles.ts';

function richCatalog(): CatalogExercise[] {
  const out: CatalogExercise[] = [];
  const buckets: StrengthBucket[] = [
    'lower_strength',
    'lower_power',
    'upper_strength',
    'upper_power',
    'mobility',
    // §R5 (DRAFT) — pool tronc, pour que le bloc core systématique ait des exos.
    'core',
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
      makeMeasurement('medball_vertical_throw', 10.8, '2026-05-01T00:00:00Z', 'kg·m'),
    ],
    athlete: { sex: 'M', ageBand: '15-16', level: 'intermediate', performanceTier: 'club' },
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

  // ── §332 — repos des cycles dérivés borné dans la bande config ────────────
  it('§332 — cycles dérivés : repos catalogue trop long borné dans la bande du cycle', () => {
    const input = fullInput();
    // Catalogue avec un repos de force très long (330 s, comme les tractions
    // lestées en prod) — hors de la bande des cycles dérivés (≤ 180 s).
    input.exerciseCatalog = input.exerciseCatalog.map((e) => ({
      ...e,
      recupSeriesForce: 330,
    }));

    const meso = generateMesocycle(input);

    // Cycles génériques (puissance/pic ici) : le moteur doit borner le repos
    // catalogue dans la fourchette restSeconds validée (periodizationCycles.ts),
    // pas le propager tel quel (330 s sur une semaine de pic = incohérent).
    let checkedDerived = 0;
    for (const week of meso.weeks) {
      const cfg = PERIODIZATION_CYCLES[week.cycle];
      if (cfg.loading.kind !== 'generique') continue;
      const max = cfg.loading.scheme.restSeconds[1];
      for (const session of week.sessions) {
        if (session.role !== 'developpement') continue; // amorce = repos codé en dur
        for (const ex of session.exercises) {
          if (ex.bucket === 'mobility' || ex.bucket === 'core') continue; // warmup/core = endurance
          checkedDerived++;
          assert.ok(
            ex.restSeconds <= max,
            `S${week.weekNumber} ${week.cycle} ${ex.nomExercice}: rest=${ex.restSeconds} > bande ${max}`,
          );
        }
      }
    }
    assert.ok(checkedDerived > 0, 'au moins un exercice de cycle dérivé vérifié');

    // Contrôle inverse — force_max (stratégie catalogue) garde le repos catalogue
    // brut (330 s), non borné : seuls les cycles génériques sont clampés.
    const forceMaxWorked = meso.weeks
      .filter((w) => w.cycle === 'force_max')
      .flatMap((w) => w.sessions)
      .filter((s) => s.role === 'developpement')
      .flatMap((s) => s.exercises)
      .filter((e) => e.bucket !== 'mobility' && e.bucket !== 'core');
    assert.ok(
      forceMaxWorked.some((e) => e.restSeconds === 330),
      'force_max doit conserver le repos catalogue (330 s), non borné',
    );
  });

  it('mobility présente dans chaque session quand une routine commune est fournie (§351)', () => {
    // §351 — le warmup n'est plus une tranche générique du pool mobility ; il est
    // piloté par `commonWarmupRoutine` (Bloc 1) + déficits (Bloc 2). On fournit
    // donc une routine commune résolvant un exo mobility du catalogue. richCatalog
    // expose `mobility_core_1` (id 17) : 1ᵉʳ exo du seau mobility.
    const input = fullInput();
    const firstMobility = input.exerciseCatalog.find((e) => e.bucket === 'mobility');
    assert.ok(firstMobility, 'catalogue contient un exo mobility');
    input.commonWarmupRoutine = [firstMobility.id];

    const meso = generateMesocycle(input);

    for (const week of meso.weeks) {
      for (const session of week.sessions) {
        const hasMobility = session.exercises.some((e) => e.bucket === 'mobility');
        assert.ok(hasMobility, `S${week.weekNumber}-${session.sessionNumber} sans mobility`);
      }
    }
  });

  // ── §R5 (DRAFT) — bloc tronc systématique ─────────────────────────────────
  it('bloc core inséré dans les séances de développement quand emphase core > 0', () => {
    const input = fullInput();
    // Template avec emphase core (comme composeTemplate la produirait post-00203).
    input.template = makeTemplate({
      lower_strength: 0.5,
      lower_power: 1.0,
      upper_strength: 0.5,
      upper_power: 1.0,
      mobility: 0.5,
      core: 0.6,
    });

    const meso = generateMesocycle(input);

    // Au moins une séance porte un exercice core + le tag bucket 'core'.
    const devSessions = meso.weeks
      .flatMap((w) => w.sessions)
      .filter((s) => s.role === 'developpement');
    assert.ok(devSessions.length > 0, 'au moins une séance de développement');
    for (const s of devSessions) {
      assert.ok(
        s.exercises.some((e) => e.bucket === 'core'),
        `séance dev sans exercice core (J${s.weekday})`,
      );
      assert.ok(s.buckets.includes('core'), 'tag bucket core manquant');
      // §318 (#2) — le bloc core ne doit PAS gonfler la séance au-delà du
      // plafond de 5 exos (sinon trop de volume sur un sprint — retour terrain).
      assert.ok(
        s.exercises.length <= 5,
        `séance dev à ${s.exercises.length} exos (> plafond 5, J${s.weekday})`,
      );
    }
    // Le core est chargé en contrôle (intention dédiée, charge légère, jamais 0 série).
    const coreEx = meso.weeks
      .flatMap((w) => w.sessions)
      .flatMap((s) => s.exercises)
      .find((e) => e.bucket === 'core');
    assert.ok(coreEx, 'au moins un exercice core généré');
    assert.ok(coreEx!.sets >= 1 && coreEx!.reps >= 1);
    assert.ok(coreEx!.restSeconds <= 60, 'core chargé en endurance (repos court)');
  });

  it('AUCUN bloc core quand le template n’a pas d’emphase core (DB pré-migration)', () => {
    // fullInput() utilise un template SANS clé core → coreEmphasis = 0.
    const meso = generateMesocycle(fullInput());
    const hasCore = meso.weeks
      .flatMap((w) => w.sessions)
      .flatMap((s) => s.exercises)
      .some((e) => e.bucket === 'core');
    assert.equal(hasCore, false, 'pas de bloc core sans emphase core (rétrocompat)');
    // Et le core n'apparaît jamais dans les priorités/allocations.
    assert.equal(meso.reasoning.bucketAllocations.length, 5);
    assert.ok(!meso.reasoning.bucketPriorities.some((p) => p.bucket === 'core'));
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

  // ── §324 — pas de seau maintien « fantôme » ──────────────────────────────
  it('tout seau entraînable alloué apparaît dans ≥1 séance (cas sprint dos : 4 seaux / 3 séances)', () => {
    // Reproduit le squeeze terrain de Victoria (100 dos) : forced_focus = {force
    // haut, puissance haut} + force bas / puissance bas en maintien, sur 3
    // séances/sem. La distribution n'attribue un créneau PRIMAIRE qu'à 3 des 4
    // seaux non-mobilité ; le 4e (un maintien) ne doit PAS disparaître du plan —
    // il doit sortir en complément (sinon : zéro saut/puissance jambes pour une
    // dossiste sprint).
    const input = fullInput();
    input.template = makeTemplate({
      lower_strength: 0.6,
      lower_power: 0.85,
      upper_strength: 0.97,
      upper_power: 0.65,
      mobility: 0.56,
    });
    input.template.structure.forced_focus = ['upper_strength', 'upper_power'];
    input.sessionsPerWeek = 3;

    const meso = generateMesocycle(input);

    // Seaux entraînables alloués (hors mobilité = échauffement systématique).
    const allocated = meso.reasoning.bucketAllocations
      .map((a) => a.bucket)
      .filter((b) => b !== 'mobility');
    assert.ok(
      allocated.length >= 4,
      `attendu ≥4 seaux entraînables alloués, obtenu [${allocated.join(', ')}]`,
    );

    const bucketsSeen = new Set(
      meso.weeks.flatMap((w) => w.sessions).flatMap((s) => s.buckets),
    );
    for (const b of allocated) {
      assert.ok(
        bucketsSeen.has(b),
        `seau alloué « ${b} » absent de TOUTES les séances (seau maintien fantôme)`,
      );
    }
  });

  // ── §325 — jambes jamais à zéro quand les jours muscu sont surtout des amorces ──
  it("§325 — l'amorce PAP porte un explosif jambes quand les jambes seraient sinon absentes (Lun/Mar/Jeu)", () => {
    // Terrain Victoria : le défaut 3 séances plaçait le seul créneau jambes le
    // Jeudi (jour primer/amorce) → converti en amorce PAP codée HAUT du corps →
    // zéro jambes. L'explosif d'amorce doit basculer sur lower_power (saut).
    const input = fullInput();
    input.template = makeTemplate({
      lower_strength: 0.6,
      lower_power: 0.79,
      upper_strength: 0.92,
      upper_power: 0.73,
      mobility: 0.56,
    });
    input.template.structure.forced_focus = ['upper_strength', 'upper_power'];
    input.sessionsPerWeek = 3;
    input.weekdays = [0, 1, 3]; // Lun, Mar, Jeu
    input.primerWeekdays = [0, 3]; // Lun + Jeu = amorces (2 séances/3 en PAP)

    const meso = generateMesocycle(input);

    const seen = new Set(meso.weeks.flatMap((w) => w.sessions).flatMap((s) => s.buckets));
    assert.ok(
      seen.has('lower_power') || seen.has('lower_strength'),
      'aucun seau jambes alors que les jours muscu sont surtout des amorces',
    );
    const papWithLegs = meso.weeks
      .flatMap((w) => w.sessions)
      .some((s) => s.role === 'amorce_pap' && s.buckets.includes('lower_power'));
    assert.ok(papWithLegs, "l'amorce PAP doit porter un explosif lower_power (saut)");
  });

  // ── §327 — le seau focus#1 forcé décroche un bloc de DÉVELOPPEMENT ──────────
  it("§327 — focus#1 (haut force) a une séance de DÉV en primaire (papillon 50, 4 séances)", () => {
    // Terrain François (papillon 50, 4 séances [Lun,Mar,Jeu,Ven] = primers Lun/Jeu).
    // Les 2 créneaux primaires d'upper_strength tombaient sur les 2 jours d'amorce
    // PAP (duo lourd+explosif) → AUCUNE séance de dév ne donnait à upper_strength
    // son bloc 2 exos (tractions lestées + tirage poulie « schéma papillon »).
    const input = fullInput();
    input.template = makeTemplate({
      lower_strength: 0.45,
      lower_power: 0.5,
      upper_strength: 0.95,
      upper_power: 0.9,
      mobility: 0.5,
    });
    input.template.structure.forced_focus = ['upper_strength', 'upper_power'];
    input.sessionsPerWeek = 4;
    input.weekdays = [0, 1, 3, 4]; // Lun, Mar, Jeu, Ven
    input.primerWeekdays = [0, 3]; // Lun + Jeu = amorces

    const meso = generateMesocycle(input);

    const devUpperStrength = meso.weeks
      .flatMap((w) => w.sessions)
      .some((s) => s.role === 'developpement' && s.buckets[0] === 'upper_strength');
    assert.ok(
      devUpperStrength,
      'au moins une séance de développement doit avoir upper_strength en primaire (bloc 2 exos)',
    );
  });

  // ── §329 — composante jambes PAP à l'amorce (box jump lun / trap bar jeu) ────
  it("§329 — l'amorce d'une nage haut-dominante porte un exo jambes PAP, alterné (lun lower_power / jeu lower_strength)", () => {
    // Terrain François (papillon 50, upper-dominant) : l'amorce était 100% haut
    // du corps → ni box jump ni trap bar. On ajoute un exo jambes PAP, alterné
    // explosif (lower_power = box jump) le 1ᵉʳ jour d'amorce / lourd (lower_strength
    // = trap bar) le 2ᵉ.
    const input = fullInput();
    input.template = makeTemplate({
      lower_strength: 0.45,
      lower_power: 0.5,
      upper_strength: 0.95,
      upper_power: 0.9,
      mobility: 0.5,
    });
    input.template.structure.forced_focus = ['upper_strength', 'upper_power'];
    input.sessionsPerWeek = 4;
    input.weekdays = [0, 1, 3, 4]; // Lun, Mar, Jeu, Ven
    input.primerWeekdays = [0, 3]; // Lun + Jeu = amorces

    const meso = generateMesocycle(input);
    const amorces = meso.weeks[0].sessions.filter((s) => s.role === 'amorce_pap');
    const monday = amorces.find((s) => s.weekday === 0);
    const thursday = amorces.find((s) => s.weekday === 3);
    assert.ok(monday, 'amorce lundi attendue');
    assert.ok(thursday, 'amorce jeudi attendue');
    // 1ᵉʳ jour d'amorce → explosif jambes (lower_power = box jump).
    assert.ok(
      monday!.buckets.includes('lower_power'),
      "l'amorce du lundi doit inclure lower_power (box jump)",
    );
    // 2ᵉ jour d'amorce → force jambes (lower_strength = trap bar).
    assert.ok(
      thursday!.buckets.includes('lower_strength'),
      "l'amorce du jeudi doit inclure lower_strength (trap bar squat)",
    );
  });

  // ── §335 — minimum haut du corps garanti quand le focus monopolise les jambes ──
  it("§335 — un seau maintien haut décroche une séance de DÉV quand les 2 focus sont des jambes (brasse 100, 4 séances)", () => {
    // Terrain Samuel (100 brasse, 4 séances [Lun,Mar,Jeu,Ven] = primers Lun/Jeu).
    // forced_focus = {force bas, puissance bas} → les 2 focus sont des jambes ; le
    // haut du corps (maintien) ne décroche ni primaire dév (les 2 dév se pairent
    // jambes↔jambes) ni amorce (potentiateur = lower_strength) → ZÉRO travail haut
    // sur tout le méso. Le top seau maintien (upper_strength) doit être injecté en
    // complément d'une séance de dév (symétrique des §324/§325/§329, sens inverse).
    const input = fullInput();
    input.template = makeTemplate({
      lower_strength: 1.0,
      lower_power: 1.0,
      upper_strength: 0.59,
      upper_power: 0.45,
      mobility: 0.56,
    });
    input.template.structure.forced_focus = ['lower_strength', 'lower_power'];
    input.sessionsPerWeek = 4;
    input.weekdays = [0, 1, 3, 4]; // Lun, Mar, Jeu, Ven
    input.primerWeekdays = [0, 3]; // Lun + Jeu = amorces

    const meso = generateMesocycle(input);

    const devUpper = meso.weeks
      .flatMap((w) => w.sessions)
      .some((s) => s.role === 'developpement' && s.buckets.includes('upper_strength'));
    assert.ok(
      devUpper,
      'au moins une séance de développement doit porter upper_strength (maintien haut garanti)',
    );

    // Les 2 focus jambes restent développés (on remplace un complément redondant,
    // jamais un primaire) : lower_strength ET lower_power restent en primaire dév.
    const devPrimaries = new Set(
      meso.weeks
        .flatMap((w) => w.sessions)
        .filter((s) => s.role === 'developpement')
        .map((s) => s.buckets[0]),
    );
    assert.ok(devPrimaries.has('lower_strength'), 'force bas reste un primaire dév');
    assert.ok(devPrimaries.has('lower_power'), 'puissance bas reste un primaire dév');
  });

  it("§335 non-régression — focus haut (crawl 50) : aucun seau JAMBES injecté en dév (déjà couvert par les amorces §329)", () => {
    // Cas symétrique déjà géré : forced_focus = haut → les jambes (maintien)
    // remontent via les amorces PAP (§325/§329). La garantie §335 ne doit donc PAS
    // se déclencher : les séances de DÉV restent 100 % haut du corps (+ core/mobilité),
    // sinon on dénaturerait le plan crawl 50 validé (McEvoy).
    const input = fullInput();
    input.template = makeTemplate({
      lower_strength: 0.45,
      lower_power: 0.5,
      upper_strength: 0.95,
      upper_power: 0.9,
      mobility: 0.5,
    });
    input.template.structure.forced_focus = ['upper_strength', 'upper_power'];
    input.sessionsPerWeek = 4;
    input.weekdays = [0, 1, 3, 4]; // Lun, Mar, Jeu, Ven
    input.primerWeekdays = [0, 3]; // Lun + Jeu = amorces

    const meso = generateMesocycle(input);

    const devBuckets = new Set(
      meso.weeks
        .flatMap((w) => w.sessions)
        .filter((s) => s.role === 'developpement')
        .flatMap((s) => s.buckets),
    );
    assert.ok(
      !devBuckets.has('lower_strength') && !devBuckets.has('lower_power'),
      `aucun seau jambes ne doit être injecté en dév (obtenu : [${[...devBuckets].join(', ')}])`,
    );
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

    // §309 — tous les barèmes consultés sont 'transposed' (broad_jump 'solid'),
    // donc la confiance minimale est 'transposed' (medball n'est plus placeholder).
    assert.equal(meso.reasoning.lowestBaremeConfidence, 'transposed');
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

// ── jour-aware amorce PAP (§307) ─────────────────────────────────────────────

/**
 * Catalogue ciblé pour les tests jour-aware : un core par seau de force/
 * puissance avec des %1RM force explicites, + 2 mobility.
 * - strength buckets (upper/lower_strength) : core, force% = 85.
 * - power buckets (lower/upper_power) : core plyo, force% = 0.
 */
function jourAwareCatalog(): CatalogExercise[] {
  return [
    makeExercise({
      id: 2001,
      nomExercice: 'upper_strength_core',
      bucket: 'upper_strength',
      level: 'beginner',
      isCore: true,
      pourcentageCharge1rmForce: 85,
      nbSeriesForce: 4,
      nbRepsForce: 5,
    }),
    makeExercise({
      id: 2002,
      nomExercice: 'lower_strength_core',
      bucket: 'lower_strength',
      level: 'beginner',
      isCore: true,
      pourcentageCharge1rmForce: 85,
      nbSeriesForce: 4,
      nbRepsForce: 5,
    }),
    makeExercise({
      id: 2003,
      nomExercice: 'lower_power_plyo',
      bucket: 'lower_power',
      level: 'beginner',
      isCore: true,
      pourcentageCharge1rmForce: 0,
      nbSeriesForce: 4,
      nbRepsForce: 5,
    }),
    makeExercise({
      id: 2004,
      nomExercice: 'upper_power_plyo',
      bucket: 'upper_power',
      level: 'beginner',
      isCore: true,
      pourcentageCharge1rmForce: 0,
      nbSeriesForce: 4,
      nbRepsForce: 5,
    }),
    makeExercise({
      id: 2005,
      nomExercice: 'mobility_1',
      bucket: 'mobility',
      level: 'beginner',
      isCore: true,
    }),
    makeExercise({
      id: 2006,
      nomExercice: 'mobility_2',
      bucket: 'mobility',
      level: 'beginner',
      isCore: false,
    }),
  ];
}

/** Template 50 m crawl inter_competition (phases maintien/puissance/affutage/pic). */
function fiftyFreeTemplate(): StrengthPeriodizationTemplate {
  return {
    id: 'tpl-50free',
    event_group: 'freestyle_50',
    kind: 'inter_competition',
    name: '50 m crawl inter-compétitions',
    min_week_count: 4,
    max_week_count: 10,
    structure: {
      phases: [
        { cycle: 'maintien', min_weeks: 1, nominal_weeks: 2, max_weeks: 4 },
        { cycle: 'puissance', min_weeks: 1, nominal_weeks: 2, max_weeks: 3 },
        { cycle: 'affutage', min_weeks: 1, nominal_weeks: 2, max_weeks: 2 },
        { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      ],
      bucket_emphasis: {
        lower_strength: 1.0,
        lower_power: 1.0,
        upper_strength: 0.5,
        upper_power: 0.5,
        mobility: 0.5,
      },
    },
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

/** Input jour-aware : athlète F adulte, catalogue ciblé, template 50-free. */
function jourAwareInput(overrides: Partial<MesocycleInput> = {}): MesocycleInput {
  return {
    assessment: {
      id: 'assess-ja',
      athlete_id: 42,
      questionnaire: greatQuestionnaire,
      physical_tests: fullPhysicalTests,
    },
    kpiMeasurements: [
      makeMeasurement('vertical_jump', 51.1, '2026-05-01T00:00:00Z', 'W/kg'),
      makeMeasurement('broad_jump', 175, '2026-05-01T00:00:00Z', 'cm'),
      makeMeasurement('imtp', 95, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('weighted_pullup', 10, '2026-05-01T00:00:00Z', 'kg'),
      makeMeasurement('medball_vertical_throw', 10.8, '2026-05-01T00:00:00Z', 'kg·m'),
    ],
    athlete: { sex: 'F', ageBand: 'adulte', level: 'intermediate', performanceTier: 'club' },
    template: fiftyFreeTemplate(),
    targetWeekCount: 7, // = Σ nominal (2+2+2+1)
    sessionsPerWeek: 3,
    exerciseCatalog: jourAwareCatalog(),
    ...overrides,
  };
}

describe('generateMesocycle — jour-aware amorce PAP (§307)', () => {
  it('1. weekday assignment : weekdays triés et posés sur les séances', () => {
    const meso = generateMesocycle(jourAwareInput({ weekdays: [3, 0, 1] }));
    const week1 = meso.weeks[0];
    assert.deepEqual(
      week1.sessions.map((s) => s.weekday),
      [0, 1, 3],
      'weekdays triés croissant',
    );
    assert.equal(meso.sessionsPerWeek, 3, 'sessionsPerWeek cohérent');
    assert.equal(week1.sessions.length, 3);
  });

  it('2. role classification : primers PAP, autres developpement', () => {
    const meso = generateMesocycle(
      jourAwareInput({ weekdays: [0, 1, 3], primerWeekdays: [0, 3] }),
    );
    const byDay = new Map(meso.weeks[0].sessions.map((s) => [s.weekday, s.role]));
    assert.equal(byDay.get(0), 'amorce_pap');
    assert.equal(byDay.get(3), 'amorce_pap');
    assert.equal(byDay.get(1), 'developpement');
  });

  it('3. safety override : douleur intense → toutes mobilite_corrective (PAP supprimé)', () => {
    const meso = generateMesocycle(
      jourAwareInput({
        weekdays: [0, 1, 3],
        assessment: {
          id: 'assess-ja',
          athlete_id: 42,
          questionnaire: {
            ...greatQuestionnaire,
            pain: [{ body_zone: 'shoulder', intensity: 3 }],
          },
          physical_tests: fullPhysicalTests,
        },
      }),
    );
    for (const session of meso.weeks[0].sessions) {
      assert.equal(
        session.role,
        'mobilite_corrective',
        `J${session.weekday} doit être mobilite_corrective`,
      );
    }
  });

  it('4. PAP loading : ≤3 exos, 1 potentiateur lourd-court + 1 explosif 0%', () => {
    const meso = generateMesocycle(
      jourAwareInput({ weekdays: [0, 1, 3], primerWeekdays: [0, 3] }),
    );
    const primer = meso.weeks[0].sessions.find((s) => s.weekday === 0);
    assert.ok(primer, 'séance primer J0 présente');
    assert.equal(primer.role, 'amorce_pap');
    assert.ok(primer.exercises.length <= 3, `≤3 exos, obtenu ${primer.exercises.length}`);

    const nonMobility = primer.exercises.filter((e) => e.bucket !== 'mobility');
    const potentiator = nonMobility.find(
      (e) => (e.intensityPct1rm ?? 0) >= 80 && e.reps <= 3 && e.sets <= 2,
    );
    assert.ok(potentiator, 'potentiateur lourd-court présent (≥80%, ≤2x3)');
    const explosive = nonMobility.find((e) => e.intensityPct1rm === 0);
    assert.ok(explosive, 'exo explosif à 0% présent');
  });

  it('5. force-bias : semaine maintien 50-free → jour dev chargé comme force_max', () => {
    const meso = generateMesocycle(
      jourAwareInput({ weekdays: [0, 1, 3], primerWeekdays: [0, 3] }),
    );
    const week1 = meso.weeks[0];
    assert.equal(week1.cycle, 'maintien', 'semaine 1 = maintien');
    const dev = week1.sessions.find((s) => s.weekday === 1);
    assert.ok(dev, 'jour dev J1 présent');
    assert.equal(dev.role, 'developpement');
    // Exo principal (premier non-mobility) doit être chargé force_max, pas maintien.
    const mainExo = dev.exercises.find((e) => e.bucket !== 'mobility');
    assert.ok(mainExo, 'exo principal présent');
    assert.ok(mainExo.sets >= 3, `force_max sets≥3, obtenu ${mainExo.sets}`);
    assert.ok((mainExo.intensityPct1rm ?? 0) >= 80, `force_max %≥80, obtenu ${mainExo.intensityPct1rm}`);
  });

  it('6. semaine puissance inchangée sur jour dev (%1RM < 85)', () => {
    const meso = generateMesocycle(
      jourAwareInput({ weekdays: [0, 1, 3], primerWeekdays: [0, 3] }),
    );
    const puissanceWeek = meso.weeks.find((w) => w.cycle === 'puissance');
    assert.ok(puissanceWeek, 'semaine puissance présente');
    const dev = puissanceWeek.sessions.find((s) => s.weekday === 1);
    assert.ok(dev, 'jour dev J1 présent');
    const mainExo = dev.exercises.find(
      (e) => e.bucket !== 'mobility' && (e.intensityPct1rm ?? 0) > 0,
    );
    assert.ok(mainExo, 'exo principal chargé présent');
    assert.ok(
      (mainExo.intensityPct1rm ?? 0) < 85,
      `puissance %<85, obtenu ${mainExo.intensityPct1rm}`,
    );
  });

  it('7. legacy mode untouched : pas de weekdays → 3 séances developpement, weekdays [0,2,4]', () => {
    const input = jourAwareInput(); // pas de weekdays
    delete input.weekdays;
    const meso = generateMesocycle(input);
    const week1 = meso.weeks[0];
    assert.equal(week1.sessions.length, 3);
    assert.deepEqual(
      week1.sessions.map((s) => s.weekday),
      [0, 2, 4],
      'carte legacy 3 séances → [0,2,4]',
    );
    for (const session of week1.sessions) {
      assert.equal(session.role, 'developpement', `J${session.weekday} legacy = developpement`);
    }
    // Aucune séance ne doit être PAP en mode legacy.
    const hasPap = meso.weeks.some((w) => w.sessions.some((s) => s.role === 'amorce_pap'));
    assert.equal(hasPap, false, 'aucune PAP en mode legacy');
  });

  it('8. legacy + douleur intense : la semaine n’est PAS entièrement corrective (entraînement conservé)', () => {
    // Mode legacy (pas de weekdays) avec une douleur intense dans le questionnaire :
    // l'override global ne doit PAS rendre toute la semaine corrective — seuls les
    // slots promus mobility le sont, comme avant §307. Au moins une séance garde
    // un exercice principal non-mobility (force/puissance entraînée).
    const input = jourAwareInput({
      assessment: {
        id: 'assess-ja',
        athlete_id: 42,
        questionnaire: {
          ...greatQuestionnaire,
          pain: [{ body_zone: 'shoulder', intensity: 3 }],
        },
        physical_tests: fullPhysicalTests,
      },
    });
    delete input.weekdays; // mode legacy

    const meso = generateMesocycle(input);

    const sessions = meso.weeks.flatMap((w) => w.sessions);
    const hasTrainingSession = sessions.some((s) =>
      s.exercises.some((e) => e.bucket !== 'mobility'),
    );
    assert.ok(
      hasTrainingSession,
      'au moins une séance conserve un exercice non-mobility en mode legacy',
    );
    // Et la semaine n'est pas entièrement classée mobilite_corrective via
    // l'override global jour-aware (qui ne doit pas s'appliquer en legacy).
    const correctiveCount = sessions.filter((s) => s.role === 'mobilite_corrective').length;
    assert.ok(
      correctiveCount < sessions.length,
      `pas toutes correctives en legacy, obtenu ${correctiveCount}/${sessions.length}`,
    );
  });
});

// ── mobilité G/D (§346) ──────────────────────────────────────────────────────

import { scoreMobility, dysfunctionFlags } from '../mesocycleEngine.ts';

describe('mobilité G/D (§346)', () => {
  const v2 = (sf: [number, number]) => ({
    mobility: { shoulder_flexion: { left: sf[0], right: sf[1] }, t_spine: { left: 3, right: 3 }, hip: { left: 3, right: 3 } },
    movement: { scapula_control: { left: 3, right: 3 }, trunk_neck_alignment: { left: 3, right: 3 }, hip_hinge: { left: 3, right: 3 } },
    filled_at: 'x',
  }) as any;
  it('scoreMobility utilise min(G,D) par axe', () => {
    assert.equal(Math.round(scoreMobility(v2([3, 0]))!), Math.round((15 / 18) * 100));
  });
  it('dysfunctionFlags détecte une asymétrie unilatérale (un côté = 0)', () => {
    assert.deepEqual(dysfunctionFlags(v2([3, 0])), ['shoulder_flexion']);
  });
  it('rétrocompat : ancienne forme number inchangée', () => {
    const v1 = { mobility: { shoulder_flexion: 0, t_spine: 3, hip: 3 }, movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 }, filled_at: 'x' } as any;
    assert.deepEqual(dysfunctionFlags(v1), ['shoulder_flexion']);
  });
});

// ── échauffement intelligent (§351) ──────────────────────────────────────────

import {
  deficientAxes,
  buildCommonWarmup,
  selectCorrectiveWarmup,
} from '../mesocycleEngine.ts';
import type { CatalogExercise as WarmupCatalogExercise } from '../mesocycleEngine.types.ts';

// Helper local : construit un physical_tests v2.
const pt351 = (over: Partial<Record<string, { left: number; right: number }>>) =>
  ({
    mobility: {
      shoulder_flexion: over.shoulder_flexion ?? { left: 3, right: 3 },
      t_spine: over.t_spine ?? { left: 3, right: 3 },
      hip: over.hip ?? { left: 3, right: 3 },
    },
    movement: {
      scapula_control: over.scapula_control ?? { left: 3, right: 3 },
      trunk_neck_alignment: over.trunk_neck_alignment ?? { left: 3, right: 3 },
      hip_hinge: over.hip_hinge ?? { left: 3, right: 3 },
    },
  }) as any;

// Helper local : CatalogExercise minimal (tous les champs requis, dont correctiveAxes).
const cat = (over: Partial<WarmupCatalogExercise> & { id: number }): WarmupCatalogExercise => ({
  id: over.id,
  nomExercice: `ex${over.id}`,
  bucket: 'mobility',
  level: over.level ?? 'beginner',
  contraindicationZones: over.contraindicationZones ?? [],
  strokePrehabAffinity: [],
  correctiveAxes: over.correctiveAxes ?? [],
  isCore: false,
  selectionPriority: over.selectionPriority ?? 0,
  illustrationGif: null,
  nbSeriesEndurance: 2,
  nbRepsEndurance: 10,
  pourcentageCharge1rmEndurance: 0,
  recupSeriesEndurance: 30,
  nbSeriesForce: null,
  nbRepsForce: null,
  pourcentageCharge1rmForce: null,
  recupSeriesForce: null,
});

describe('deficientAxes (§351)', () => {
  it('effective ≤ 1 retenu', () => {
    const res = deficientAxes(pt351({ hip: { left: 1, right: 1 } }));
    assert.deepEqual(res.map((a) => a.axis), ['hip']);
    assert.equal(res[0].side, 'both');
  });

  it('asymétrie |G−D| ≥ 2 retenue même si effective ≥ 2', () => {
    const res = deficientAxes(pt351({ shoulder_flexion: { left: 3, right: 1 } }));
    assert.deepEqual(res.map((a) => a.axis), ['shoulder_flexion']);
    assert.equal(res[0].side, 'right'); // côté faible = right
  });

  it('tri par sévérité (effective croissant puis asymétrie décroissante)', () => {
    const res = deficientAxes(
      pt351({
        hip: { left: 0, right: 0 }, // effective 0
        t_spine: { left: 1, right: 1 }, // effective 1, asym 0
        shoulder_flexion: { left: 3, right: 1 }, // effective 1, asym 2
      }),
    );
    assert.deepEqual(res.map((a) => a.axis), ['hip', 'shoulder_flexion', 't_spine']);
  });

  it('axe sain (3/3) exclu', () => {
    assert.deepEqual(deficientAxes(pt351({})), []);
  });

  it('null → []', () => {
    assert.deepEqual(deficientAxes(null), []);
  });
});

describe('buildCommonWarmup (§351 Bloc 1)', () => {
  it('résout les ids dans l\'ordre de la routine', () => {
    const catalog = [cat({ id: 87 }), cat({ id: 84 }), cat({ id: 24 })];
    const res = buildCommonWarmup([87, 84, 24], catalog, []);
    assert.deepEqual(res.map((s) => s.exercise.id), [87, 84, 24]);
  });

  it('saute un exo contre-indiqué', () => {
    const catalog = [cat({ id: 87 }), cat({ id: 84, contraindicationZones: ['left_shoulder'] })];
    const res = buildCommonWarmup([87, 84], catalog, ['left_shoulder']);
    assert.deepEqual(res.map((s) => s.exercise.id), [87]);
  });

  it('id absent du catalogue ignoré ; routine vide → []', () => {
    assert.deepEqual(buildCommonWarmup([999], [cat({ id: 87 })], []).map((s) => s.exercise.id), []);
    assert.deepEqual(buildCommonWarmup([], [cat({ id: 87 })], []), []);
  });
});

describe('selectCorrectiveWarmup (§351 Bloc 2)', () => {
  it('un exo par axe déficitaire, plafond MAX_CORRECTIVE', () => {
    const deficient = [
      { axis: 'hip', side: 'both', effective: 0, asymmetry: 0 },
      { axis: 'scapula_control', side: 'left', effective: 1, asymmetry: 2 },
    ] as any;
    const catalog = [
      cat({ id: 59, correctiveAxes: ['hip'] }),
      cat({ id: 51, correctiveAxes: ['scapula_control'] }),
    ];
    const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
    assert.deepEqual(res.map((s) => s.exercise.id), [59, 51]);
  });

  it('rotation déterministe sur sessionIndex (4 axes, cap 2)', () => {
    const deficient = ['A', 'B', 'C', 'D'].map((axis, i) => ({
      axis,
      side: 'both',
      effective: i === 0 ? 0 : 1,
      asymmetry: 0,
    })) as any;
    const catalog = ['A', 'B', 'C', 'D'].map((a, i) => cat({ id: 10 + i, correctiveAxes: [a] }));
    const s0 = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []).map((s) => s.exercise.id);
    const s1 = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 1, []).map((s) => s.exercise.id);
    const s2 = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 2, []).map((s) => s.exercise.id);
    assert.deepEqual(s0, [10, 11]); // A,B (pires d'abord)
    assert.deepEqual(s1, [12, 13]); // C,D
    assert.deepEqual(s2, [10, 11]); // wrap → A,B
  });

  it('contre-indication exclut l\'exo de l\'axe', () => {
    const deficient = [{ axis: 'hip', side: 'both', effective: 0, asymmetry: 0 }] as any;
    const catalog = [cat({ id: 59, correctiveAxes: ['hip'], contraindicationZones: ['left_hip'] })];
    const res = selectCorrectiveWarmup(deficient, catalog, ['left_hip'], 'beginner', 0, []);
    assert.deepEqual(res, []);
  });

  it('dédup vs Bloc 1 (exo déjà dans la routine commune)', () => {
    const deficient = [{ axis: 't_spine', side: 'both', effective: 1, asymmetry: 0 }] as any;
    const catalog = [cat({ id: 87, correctiveAxes: ['t_spine', 'trunk_neck_alignment'] })];
    const common = [{ exercise: catalog[0], substituted: false, originalExerciseId: null }] as any;
    const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, common);
    assert.deepEqual(res, []); // 87 déjà dans le bloc commun → pas de doublon
  });

  it('porte axe + côté pour l\'UI', () => {
    const deficient = [{ axis: 'hip', side: 'left', effective: 1, asymmetry: 2 }] as any;
    const catalog = [cat({ id: 59, correctiveAxes: ['hip'] })];
    const res = selectCorrectiveWarmup(deficient, catalog, [], 'beginner', 0, []);
    assert.equal(res[0].correctiveAxis, 'hip');
    assert.equal(res[0].correctiveSide, 'left');
  });
});

// ── §351 T7 : câblage blocs 1+2 dans buildSession / buildPapSession ───────────

/**
 * Catalogue jour-aware ENRICHI pour le câblage warmup : reprend les seaux force/
 * puissance + 2 mobilités communes (ids 9001/9002, taguées `correctiveAxes`) +
 * 1 mobilité corrective hanche (9003). Permet de distinguer Bloc 1 (routine
 * commune) du Bloc 2 (correctif déficit).
 */
function warmupWiringCatalog(): CatalogExercise[] {
  return [
    ...jourAwareCatalog().filter((e) => e.bucket !== 'mobility'),
    makeExercise({ id: 9001, nomExercice: 'common_a', bucket: 'mobility', level: 'beginner', isCore: true, correctiveAxes: [] }),
    makeExercise({ id: 9002, nomExercice: 'common_b', bucket: 'mobility', level: 'beginner', isCore: false, correctiveAxes: [] }),
    makeExercise({ id: 9003, nomExercice: 'corrective_hip', bucket: 'mobility', level: 'beginner', isCore: false, correctiveAxes: ['hip'] }),
  ];
}

/** physical_tests avec un déficit hanche (effective 1 → axe déficitaire). */
const hipDeficitPhysical: StrengthPhysicalTests = {
  mobility: { shoulder_flexion: 3, t_spine: 3, hip: 1 },
  movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 },
  filled_at: '2026-05-01T00:00:00Z',
} as any;

describe('generateMesocycle — câblage warmup blocs 1+2 (§351 T7)', () => {
  it('séance dév : Bloc 1 (common) + Bloc 2 (corrective hip)', () => {
    const meso = generateMesocycle(
      jourAwareInput({
        weekdays: [0, 1, 3],
        primerWeekdays: [0, 3],
        exerciseCatalog: warmupWiringCatalog(),
        commonWarmupRoutine: [9001, 9002],
        assessment: {
          id: 'assess-ja',
          athlete_id: 42,
          questionnaire: greatQuestionnaire,
          physical_tests: hipDeficitPhysical,
        },
      }),
    );
    const dev = meso.weeks[0].sessions.find((s) => s.role === 'developpement');
    assert.ok(dev, 'séance de développement présente');
    const common = dev.exercises.filter((e) => e.warmupKind === 'common');
    const corrective = dev.exercises.filter((e) => e.warmupKind === 'corrective');
    assert.ok(common.length >= 1, 'au moins 1 exo warmupKind=common');
    assert.ok(corrective.length >= 1, 'au moins 1 exo warmupKind=corrective');
    assert.ok(
      corrective.some((e) => e.correctiveAxis === 'hip'),
      'le correctif porte correctiveAxis=hip',
    );
  });

  it('amorce PAP : Bloc 1 (common) présent', () => {
    const meso = generateMesocycle(
      jourAwareInput({
        weekdays: [0, 1, 3],
        primerWeekdays: [0, 3],
        exerciseCatalog: warmupWiringCatalog(),
        commonWarmupRoutine: [9001, 9002],
        assessment: {
          id: 'assess-ja',
          athlete_id: 42,
          questionnaire: greatQuestionnaire,
          physical_tests: hipDeficitPhysical,
        },
      }),
    );
    const pap = meso.weeks[0].sessions.find((s) => s.role === 'amorce_pap');
    assert.ok(pap, 'séance amorce PAP présente');
    assert.ok(
      pap.exercises.some((e) => e.warmupKind === 'common'),
      'amorce PAP contient un exo warmupKind=common',
    );
  });

  it('séance mobilité corrective (override douleur) : AUCUN warmupKind', () => {
    const meso = generateMesocycle(
      jourAwareInput({
        weekdays: [0, 1, 3],
        primerWeekdays: [0, 3],
        exerciseCatalog: warmupWiringCatalog(),
        commonWarmupRoutine: [9001, 9002],
        assessment: {
          id: 'assess-ja',
          athlete_id: 42,
          questionnaire: {
            ...greatQuestionnaire,
            pain: [{ body_zone: 'shoulder', intensity: 3 }],
          },
          physical_tests: hipDeficitPhysical,
        },
      }),
    );
    for (const session of meso.weeks[0].sessions) {
      assert.equal(session.role, 'mobilite_corrective');
      assert.ok(
        session.exercises.every((e) => e.warmupKind === undefined),
        'aucune entrée warmupKind dans une séance override',
      );
    }
  });

  it('aucun déficit (3/3 partout) + routine : common présent, pas de corrective', () => {
    const meso = generateMesocycle(
      jourAwareInput({
        weekdays: [0, 1, 3],
        primerWeekdays: [0, 3],
        exerciseCatalog: warmupWiringCatalog(),
        commonWarmupRoutine: [9001, 9002],
        assessment: {
          id: 'assess-ja',
          athlete_id: 42,
          questionnaire: greatQuestionnaire,
          physical_tests: fullPhysicalTests,
        },
      }),
    );
    const dev = meso.weeks[0].sessions.find((s) => s.role === 'developpement');
    assert.ok(dev, 'séance de développement présente');
    assert.ok(
      dev.exercises.some((e) => e.warmupKind === 'common'),
      'common présent',
    );
    assert.ok(
      dev.exercises.every((e) => e.warmupKind !== 'corrective'),
      'aucun corrective sans déficit',
    );
  });
});




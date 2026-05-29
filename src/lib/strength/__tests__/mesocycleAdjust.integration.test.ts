import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  StrengthBucket,
  StrengthKpiMeasurement,
  StrengthPeriodizationTemplate,
} from '@/lib/api/types';
import type { CatalogExercise, MesocycleInput } from '../mesocycleEngine.types.ts';
import { generateMesocycle } from '../mesocycleEngine.ts';
import { applyAdjustmentFactors } from '../adjustmentFactors.ts';

// Fixtures self-contained (decouplage volontaire du gros fichier de tests du
// moteur — on ne reutilise pas ses helpers locaux non exportes).

let nextExId = 5000;
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

// 6 seaux × {2 core + 2 acc} = 24 exos — pool suffisant pour des seances pleines.
function richCatalog(): CatalogExercise[] {
  const out: CatalogExercise[] = [];
  const buckets: StrengthBucket[] = [
    'lower_strength',
    'lower_power',
    'upper_strength',
    'upper_power',
    'mobility',
    'core',
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
  kpi: StrengthKpiMeasurement['kpi_key'],
  value: number,
  unit = 'kg',
): StrengthKpiMeasurement {
  const measuredAt = '2026-05-01T00:00:00Z';
  return {
    id: `mi-${nextMeasId++}`,
    athlete_id: 77,
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

// 4 phases ordonnees → la troncature mi-cycle est testable (slice depuis
// 'puissance' laisse puissance[2/3/4] + pic[1/1/1] = plage [3, 5]).
function makeTemplate(): StrengthPeriodizationTemplate {
  return {
    id: 'tpl-integ',
    event_group: 'sprint',
    kind: 'season',
    name: 'Integration sprint',
    min_week_count: 7,
    max_week_count: 13,
    structure: {
      phases: [
        { cycle: 'prepa_generale', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'puissance', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
        { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
      ],
      bucket_emphasis: {
        lower_strength: 0.5,
        lower_power: 1.0,
        upper_strength: 0.5,
        upper_power: 1.0,
        mobility: 0.5,
        core: 0.5,
      },
    },
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function makeInput(overrides: Partial<MesocycleInput> = {}): MesocycleInput {
  return {
    assessment: {
      id: 'assess-integ',
      athlete_id: 77,
      questionnaire: null,
      physical_tests: null,
    },
    // KPIs non-null pour que les barimes produisent des scores → seaux focus
    // peuples → seances avec exercices (sinon assertions de facteurs vacuous).
    kpiMeasurements: [
      makeMeasurement('vertical_jump', 51.1, 'W/kg'),
      makeMeasurement('broad_jump', 175, 'cm'),
      makeMeasurement('imtp', 95, 'kg'),
      makeMeasurement('weighted_pullup', 10, 'kg'),
      makeMeasurement('medball_vertical_throw', 10.8, 'kg·m'),
    ],
    athlete: { sex: 'M', ageBand: '15-16', level: 'intermediate', performanceTier: 'club' },
    template: makeTemplate(),
    targetWeekCount: 10,
    sessionsPerWeek: 3,
    exerciseCatalog: richCatalog(),
    ...overrides,
  };
}

// Aplatit un plan en valeurs scalaires (deep-copie implicite) — sert a comparer
// avant/apres ajustement sans risque d'aliasing avec l'objet source.
type FlatExo = { sets: number; pct: number | null };
function flattenPlan(plan: ReturnType<typeof generateMesocycle>): FlatExo[] {
  return plan.weeks.flatMap((w) =>
    w.sessions.flatMap((s) =>
      s.exercises.map((e) => ({ sets: e.sets, pct: e.intensityPct1rm })),
    ),
  );
}

describe('mesocycle adjust — integration generate + factors', () => {
  it('adjust mid-cycle: truncated + factors applied', () => {
    // Slice depuis 'puissance' → plage [3, 5] ; on vise 4 semaines.
    const targetWeekCount = 4;
    const input = makeInput({ startPhase: 'puissance', targetWeekCount });

    const generated = generateMesocycle(input);

    // Troncature honoree : la 1ere semaine demarre bien sur 'puissance'.
    assert.equal(generated.weeks[0].cycle, 'puissance');
    assert.equal(generated.totalWeeks, targetWeekCount);

    // Snapshot AVANT l'ajustement (valeurs scalaires copiees) pour prouver la
    // mutation sans risque d'aliasing — un pass-through degenere serait sinon
    // vert (les invariants sets>=1 / pct<=100 ne testent pas l'effet des facteurs).
    const before = flattenPlan(generated);

    const adjusted = applyAdjustmentFactors(generated, 0.8, 0.9);

    let exercisesSeen = 0;
    let sessionWithExercises = 0;
    for (const week of adjusted.weeks) {
      for (const session of week.sessions) {
        if (session.exercises.length > 0) sessionWithExercises++;
        for (const exo of session.exercises) {
          exercisesSeen++;
          assert.ok(exo.sets >= 1, `sets clampe >= 1 (vu ${exo.sets})`);
          if (exo.intensityPct1rm != null && exo.intensityPct1rm > 0) {
            assert.ok(
              exo.intensityPct1rm <= 100,
              `intensityPct1rm clampe <= 100 (vu ${exo.intensityPct1rm})`,
            );
          }
        }
      }
    }

    // Non-vacuite : au moins une seance avec des exercices.
    assert.ok(sessionWithExercises > 0, 'au moins une seance peuplee');
    assert.ok(exercisesSeen > 0, 'au moins un exercice ajuste');

    // Les facteurs (0.8/0.9) DOIVENT modifier au moins un exercice — bloque un
    // pass-through degenere qui ignorerait ses arguments. Avec sets 3-4 et pct
    // ~60-85, un delta d'arrondi est quasi certain (non-flaky).
    const after = flattenPlan(adjusted);
    assert.equal(after.length, before.length);
    const changed = before.some(
      (b, i) => b.sets !== after[i].sets || b.pct !== after[i].pct,
    );
    assert.ok(changed, 'les facteurs doivent modifier au moins un exercice');
  });

  it('identity factors == generate alone', () => {
    const input = makeInput(); // template plein, pas de startPhase
    const direct = generateMesocycle(input);
    const adjusted = applyAdjustmentFactors(direct, 1.0, 1.0);

    const before = flattenPlan(direct);
    const after = flattenPlan(adjusted);

    assert.ok(before.length > 0, 'plan non vide');
    assert.deepEqual(after, before);
  });
});

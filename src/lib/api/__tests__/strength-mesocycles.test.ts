import assert from 'node:assert/strict';
import { describe, it, before, beforeEach, mock } from 'node:test';

import type {
  GeneratedMesocycle,
  MesocycleInput,
} from '@/lib/strength/mesocycleEngine.types';

let fromImpl: (...args: unknown[]) => unknown;
let rpcImpl: (...args: unknown[]) => unknown;

before(async () => {
  const real = await import('../client.ts');
  mock.module('../client.ts', {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
        rpc: (...args: unknown[]) => rpcImpl(...args),
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => {
    throw new Error('fromImpl not configured for this test');
  };
  rpcImpl = () => {
    throw new Error('rpcImpl not configured for this test');
  };
});

// ── Fixtures partagées ────────────────────────────────────────────────────

const TEMPLATE_ID = 'c0000000-0000-0000-0000-000000000001';
const ASSESS_ID = 'a0000000-0000-0000-0000-000000000001';

function makeMinimalInput(): MesocycleInput {
  return {
    assessment: {
      id: ASSESS_ID,
      athlete_id: 42,
      questionnaire: {
        pain: [],
        injury_history: '',
        mobility_feel: 5,
        psychology: { confidence: 5, motivation: 5, stress: 1 },
        filled_at: '2026-05-01T00:00:00Z',
      },
      physical_tests: {
        mobility: { shoulder_flexion: 3, t_spine: 3, hip: 3 },
        movement: { scapula_control: 3, trunk_neck_alignment: 3, hip_hinge: 3 },
        filled_at: '2026-05-01T00:00:00Z',
      },
    },
    kpiMeasurements: [],
    athlete: { sex: 'M', ageBand: '15-16', level: 'intermediate', performanceTier: 'club' },
    template: {
      id: TEMPLATE_ID,
      event_group: 'sprint',
      kind: 'season',
      name: 'Sprint 8 sem',
      min_week_count: 4,
      max_week_count: 12,
      structure: {
        phases: [
          { cycle: 'prepa_generale', min_weeks: 1, nominal_weeks: 2, max_weeks: 3 },
          { cycle: 'force_max', min_weeks: 1, nominal_weeks: 2, max_weeks: 3 },
          { cycle: 'pic', min_weeks: 1, nominal_weeks: 1, max_weeks: 1 },
        ],
        bucket_emphasis: { lower_strength: 1, upper_strength: 1, mobility: 0.5 },
      },
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
    },
    targetWeekCount: 5,
    sessionsPerWeek: 2,
    exerciseCatalog: [
      {
        id: 100,
        nomExercice: 'Squat dos',
        bucket: 'lower_strength',
        level: 'intermediate',
        contraindicationZones: [],
        isCore: true,
        illustrationGif: null,
        nbSeriesEndurance: 3, nbRepsEndurance: 12, pourcentageCharge1rmEndurance: 60, recupSeriesEndurance: 60,
        nbSeriesForce: 4, nbRepsForce: 5, pourcentageCharge1rmForce: 85, recupSeriesForce: 180,
      },
      {
        id: 101,
        nomExercice: 'Étirements bassin',
        bucket: 'mobility',
        level: 'beginner',
        contraindicationZones: [],
        isCore: false,
        illustrationGif: null,
        nbSeriesEndurance: 1, nbRepsEndurance: 10, pourcentageCharge1rmEndurance: null, recupSeriesEndurance: 30,
        nbSeriesForce: null, nbRepsForce: null, pourcentageCharge1rmForce: null, recupSeriesForce: null,
      },
      {
        id: 102,
        nomExercice: 'Traction lestée',
        bucket: 'upper_strength',
        level: 'intermediate',
        contraindicationZones: [],
        isCore: true,
        illustrationGif: null,
        nbSeriesEndurance: 3, nbRepsEndurance: 10, pourcentageCharge1rmEndurance: 50, recupSeriesEndurance: 60,
        nbSeriesForce: 4, nbRepsForce: 5, pourcentageCharge1rmForce: 85, recupSeriesForce: 180,
      },
    ],
  };
}

// ── generateMesocyclePreview ─────────────────────────────────────────────

describe('generateMesocyclePreview', () => {
  it('exécute le moteur sans I/O et retourne un GeneratedMesocycle complet', async () => {
    const { generateMesocyclePreview } = await import('../strength-mesocycles.ts');
    const input = makeMinimalInput();

    const out = generateMesocyclePreview(input);

    assert.equal(out.totalWeeks, 5);
    assert.equal(out.sessionsPerWeek, 2);
    assert.equal(out.templateId, TEMPLATE_ID);
    assert.equal(out.weeks.length, 5);
    assert.ok(typeof out.engineVersion === 'string' && /\d+\.\d+\.\d+/.test(out.engineVersion));
    assert.ok(out.reasoning.bucketScores);
  });
});

// ── applyMesocycle ────────────────────────────────────────────────────────

describe('applyMesocycle', () => {
  it("appelle la RPC apply_strength_mesocycle avec les bons paramètres et renvoie l'UUID", async () => {
    const { generateMesocyclePreview, applyMesocycle } = await import('../strength-mesocycles.ts');
    const input = makeMinimalInput();
    const generated = generateMesocyclePreview(input);

    let capturedFn: unknown;
    let capturedArgs: Record<string, unknown> | undefined;
    rpcImpl = (fn: unknown, args: unknown) => {
      capturedFn = fn;
      capturedArgs = args as Record<string, unknown>;
      return Promise.resolve({ data: 'd0000000-0000-0000-0000-000000000099', error: null });
    };

    const id = await applyMesocycle(input, generated, '2026-06-01');

    assert.equal(id, 'd0000000-0000-0000-0000-000000000099');
    assert.equal(capturedFn, 'apply_strength_mesocycle');
    // Paramètres scalaires
    assert.equal(capturedArgs?.p_athlete_id, 42);
    assert.equal(capturedArgs?.p_assessment_id, ASSESS_ID);
    // §305 : id de template composé synthétique → p_template_id NULL.
    // L'event_group (qui porte 'freestyle_100' etc.) est inchangé.
    assert.equal(capturedArgs?.p_template_id, null);
    assert.equal(capturedArgs?.p_event_group, 'sprint');
    assert.equal(capturedArgs?.p_kind, 'season');
    assert.equal(capturedArgs?.p_target_week_count, 5);
    assert.equal(capturedArgs?.p_sessions_per_week, 2);
    assert.equal(capturedArgs?.p_start_week_monday, '2026-06-01');
    assert.equal(capturedArgs?.p_engine_version, generated.engineVersion);
    // Reasoning passé brut (le moteur l'a déjà construit)
    assert.deepEqual(capturedArgs?.p_bucket_priorities, generated.reasoning);
  });

  it("sérialise weeks au format snake_case attendu par la RPC", async () => {
    const { generateMesocyclePreview, applyMesocycle } = await import('../strength-mesocycles.ts');
    const input = makeMinimalInput();
    const generated = generateMesocyclePreview(input);

    let capturedWeeks: unknown;
    rpcImpl = (_fn: unknown, args: unknown) => {
      capturedWeeks = (args as Record<string, unknown>).p_weeks;
      return Promise.resolve({ data: 'uuid-x', error: null });
    };

    await applyMesocycle(input, generated, '2026-06-01');

    const weeks = capturedWeeks as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(weeks));
    assert.equal(weeks.length, 5);

    const firstWeek = weeks[0];
    assert.equal(typeof firstWeek.week_number, 'number');
    assert.equal(typeof firstWeek.cycle, 'string');
    assert.ok(Array.isArray(firstWeek.sessions));

    const sessions = firstWeek.sessions as Array<Record<string, unknown>>;
    assert.ok(sessions.length > 0);
    const firstSession = sessions[0];
    assert.equal(typeof firstSession.session_number, 'number');
    assert.ok(Array.isArray(firstSession.exercises));

    const exercises = firstSession.exercises as Array<Record<string, unknown>>;
    assert.ok(exercises.length > 0);
    const ex = exercises[0];
    // Vérifie le mapping camelCase → snake_case
    assert.ok('exercise_id' in ex);
    assert.ok('is_core' in ex);
    assert.ok('intensity_pct_1rm' in ex);
    assert.ok('rest_seconds' in ex);
    assert.ok('original_exercise_id' in ex);
    // Et qu'on n'a pas laissé fuiter les noms camelCase
    assert.equal((ex as Record<string, unknown>).exerciseId, undefined);
    assert.equal((ex as Record<string, unknown>).isCore, undefined);
  });

  it("convertit un Date en chaîne YYYY-MM-DD pour p_start_week_monday", async () => {
    const { generateMesocyclePreview, applyMesocycle } = await import('../strength-mesocycles.ts');
    const input = makeMinimalInput();
    const generated = generateMesocyclePreview(input);

    let capturedDate: unknown;
    rpcImpl = (_fn: unknown, args: unknown) => {
      capturedDate = (args as Record<string, unknown>).p_start_week_monday;
      return Promise.resolve({ data: 'uuid-x', error: null });
    };

    // Lundi 1er juin 2026 (mois = 5, 0-indexed)
    await applyMesocycle(input, generated, new Date(2026, 5, 1));

    assert.equal(capturedDate, '2026-06-01');
  });

  it('lève si la RPC renvoie une erreur', async () => {
    const { generateMesocyclePreview, applyMesocycle } = await import('../strength-mesocycles.ts');
    const input = makeMinimalInput();
    const generated = generateMesocyclePreview(input);

    rpcImpl = () =>
      Promise.resolve({ data: null, error: { message: 'not authorized' } });

    await assert.rejects(
      () => applyMesocycle(input, generated, '2026-06-01'),
      /not authorized/i,
    );
  });
});

// ── revertMesocycle ──────────────────────────────────────────────────────

describe('revertMesocycle', () => {
  it('appelle revert_strength_mesocycle avec p_mesocycle_id', async () => {
    const { revertMesocycle } = await import('../strength-mesocycles.ts');

    let capturedFn: unknown;
    let capturedArgs: Record<string, unknown> | undefined;
    rpcImpl = (fn: unknown, args: unknown) => {
      capturedFn = fn;
      capturedArgs = args as Record<string, unknown>;
      return Promise.resolve({ data: null, error: null });
    };

    await revertMesocycle('d0000000-0000-0000-0000-000000000099');

    assert.equal(capturedFn, 'revert_strength_mesocycle');
    assert.deepEqual(capturedArgs, { p_mesocycle_id: 'd0000000-0000-0000-0000-000000000099' });
  });

  it("propage l'erreur quand la RPC échoue", async () => {
    const { revertMesocycle } = await import('../strength-mesocycles.ts');
    rpcImpl = () =>
      Promise.resolve({ data: null, error: { message: 'only active can be reverted' } });

    await assert.rejects(() => revertMesocycle('uuid'), /only active/i);
  });
});

// ── getMesocycle ─────────────────────────────────────────────────────────

describe('getMesocycle', () => {
  it('SELECT * WHERE id = $1 → maybeSingle', async () => {
    const { getMesocycle } = await import('../strength-mesocycles.ts');

    let capturedTable: unknown;
    let capturedId: unknown;
    fromImpl = (table: unknown) => {
      capturedTable = table;
      return {
        select: () => ({
          eq: (_col: string, value: unknown) => {
            capturedId = value;
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: value, athlete_id: 42, status: 'active' },
                  error: null,
                }),
            };
          },
        }),
      };
    };

    const out = await getMesocycle('uuid-x');

    assert.equal(capturedTable, 'strength_mesocycles');
    assert.equal(capturedId, 'uuid-x');
    assert.equal(out?.id, 'uuid-x');
    assert.equal(out?.status, 'active');
  });

  it('renvoie null si maybeSingle renvoie data null', async () => {
    const { getMesocycle } = await import('../strength-mesocycles.ts');
    fromImpl = () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });
    const out = await getMesocycle('uuid-x');
    assert.equal(out, null);
  });
});

// ── getActiveMesocycle ───────────────────────────────────────────────────

describe('getActiveMesocycle', () => {
  it("filtre status='active', trie desc, limit 1", async () => {
    const { getActiveMesocycle } = await import('../strength-mesocycles.ts');

    const eqCalls: Array<{ col: string; value: unknown }> = [];
    let orderCol: string | undefined;
    let limitN: number | undefined;
    fromImpl = () => ({
      select: () => ({
        eq: (col: string, value: unknown) => {
          eqCalls.push({ col, value });
          return {
            eq: (col2: string, value2: unknown) => {
              eqCalls.push({ col: col2, value: value2 });
              return {
                order: (col3: string) => {
                  orderCol = col3;
                  return {
                    limit: (n: number) => {
                      limitN = n;
                      return Promise.resolve({
                        data: [{ id: 'uuid-x', athlete_id: 42, status: 'active' }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      }),
    });

    const out = await getActiveMesocycle(42);

    assert.equal(out?.id, 'uuid-x');
    assert.deepEqual(eqCalls, [
      { col: 'athlete_id', value: 42 },
      { col: 'status', value: 'active' },
    ]);
    assert.equal(orderCol, 'created_at');
    assert.equal(limitN, 1);
  });

  it('renvoie null si pas de mésocycle actif', async () => {
    const { getActiveMesocycle } = await import('../strength-mesocycles.ts');
    fromImpl = () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    });
    const out = await getActiveMesocycle(42);
    assert.equal(out, null);
  });
});

// ── listMesocycles ───────────────────────────────────────────────────────

describe('listMesocycles', () => {
  it('liste les mésocycles du nageur triés desc', async () => {
    const { listMesocycles } = await import('../strength-mesocycles.ts');

    const eqCalls: Array<{ col: string; value: unknown }> = [];
    fromImpl = () => ({
      select: () => ({
        eq: (col: string, value: unknown) => {
          eqCalls.push({ col, value });
          return {
            order: () =>
              Promise.resolve({
                data: [
                  { id: 'uuid-2', athlete_id: 42, status: 'active' },
                  { id: 'uuid-1', athlete_id: 42, status: 'reverted' },
                ],
                error: null,
              }),
          };
        },
      }),
    });

    const out = await listMesocycles(42);

    assert.equal(out.length, 2);
    assert.equal(out[0].id, 'uuid-2');
    assert.deepEqual(eqCalls, [{ col: 'athlete_id', value: 42 }]);
  });
});

// ── applyMesocycle : template_id NULL pour un template composé (§305) ──────

describe('applyMesocycle — §305 template composé', () => {
  it("force p_template_id=null et propage l'event_group composé tel quel", async () => {
    const { generateMesocyclePreview, applyMesocycle } = await import('../strength-mesocycles.ts');
    const input = makeMinimalInput();
    // Simule un template composé (composeTemplate) : id synthétique non-uuid,
    // event_group de la forme '<stroke>_<distance>'.
    input.template = {
      ...input.template,
      id: 'freestyle_100_season',
      event_group: 'freestyle_100',
    };
    const generated = generateMesocyclePreview(input);

    let capturedArgs: Record<string, unknown> | undefined;
    rpcImpl = (_fn: unknown, args: unknown) => {
      capturedArgs = args as Record<string, unknown>;
      return Promise.resolve({ data: 'uuid-z', error: null });
    };

    await applyMesocycle(input, generated, '2026-06-01');

    // L'id synthétique ne doit JAMAIS fuiter dans p_template_id (colonne uuid).
    assert.equal(capturedArgs?.p_template_id, null);
    assert.notEqual(capturedArgs?.p_template_id, 'freestyle_100_season');
    // L'event_group composé est transmis intact.
    assert.equal(capturedArgs?.p_event_group, 'freestyle_100');
  });
});

// ── getStrokeSignatures (§305) ─────────────────────────────────────────────

describe('getStrokeSignatures', () => {
  it('SELECT * sur strength_stroke_signatures, map vers la forme typée', async () => {
    let capturedTable: unknown;
    fromImpl = (table: unknown) => {
      capturedTable = table;
      return {
        select: () =>
          Promise.resolve({
            data: [
              {
                stroke_key: 'freestyle',
                label: 'Crawl',
                mult: {
                  lower_strength: 1,
                  lower_power: 1,
                  upper_strength: 1,
                  upper_power: 1,
                  mobility: 1,
                },
              },
              {
                stroke_key: 'breaststroke',
                label: 'Brasse',
                mult: {
                  lower_strength: 1.214,
                  lower_power: 1.333,
                  upper_strength: 0.611,
                  upper_power: 0.75,
                  mobility: 1.333,
                },
              },
            ],
            error: null,
          }),
      };
    };

    const { getStrokeSignatures } = await import('../strength-mesocycles.ts');
    const out = await getStrokeSignatures();

    assert.equal(capturedTable, 'strength_stroke_signatures');
    assert.equal(out.length, 2);
    assert.equal(out[0].stroke_key, 'freestyle');
    assert.equal(out[0].label, 'Crawl');
    assert.equal(out[0].mult.lower_strength, 1);
    assert.equal(out[1].stroke_key, 'breaststroke');
    assert.equal(out[1].mult.mobility, 1.333);
  });

  it("renvoie [] quand la table est vide (data null)", async () => {
    fromImpl = () => ({ select: () => Promise.resolve({ data: null, error: null }) });
    const { getStrokeSignatures } = await import('../strength-mesocycles.ts');
    assert.deepEqual(await getStrokeSignatures(), []);
  });

  it("lève si Supabase renvoie une erreur", async () => {
    fromImpl = () => ({
      select: () => Promise.resolve({ data: null, error: { message: 'boom signatures' } }),
    });
    const { getStrokeSignatures } = await import('../strength-mesocycles.ts');
    await assert.rejects(() => getStrokeSignatures(), /boom signatures/i);
  });
});

// ── getDistanceProfiles (§305) ─────────────────────────────────────────────

describe('getDistanceProfiles', () => {
  it('SELECT * sur strength_distance_profiles, map (emphasis/structure jsonb)', async () => {
    let capturedTable: unknown;
    fromImpl = (table: unknown) => {
      capturedTable = table;
      return {
        select: () =>
          Promise.resolve({
            data: [
              {
                distance_key: '100',
                kind: 'season',
                label: '100 m',
                emphasis: {
                  lower_strength: 0.82,
                  lower_power: 0.85,
                  upper_strength: 0.97,
                  upper_power: 0.6,
                  mobility: 0.42,
                },
                structure: {
                  phases: [
                    { cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 },
                  ],
                },
                min_week_count: 8,
                max_week_count: 15,
              },
            ],
            error: null,
          }),
      };
    };

    const { getDistanceProfiles } = await import('../strength-mesocycles.ts');
    const out = await getDistanceProfiles();

    assert.equal(capturedTable, 'strength_distance_profiles');
    assert.equal(out.length, 1);
    const p = out[0];
    assert.equal(p.distance_key, '100');
    assert.equal(p.kind, 'season');
    assert.equal(p.label, '100 m');
    assert.equal(p.emphasis.upper_strength, 0.97);
    assert.equal(p.min_week_count, 8);
    assert.equal(p.max_week_count, 15);
    assert.equal(p.structure.phases.length, 1);
    assert.equal(p.structure.phases[0].cycle, 'force_max');
  });

  it("renvoie [] quand la table est vide (data null)", async () => {
    fromImpl = () => ({ select: () => Promise.resolve({ data: null, error: null }) });
    const { getDistanceProfiles } = await import('../strength-mesocycles.ts');
    assert.deepEqual(await getDistanceProfiles(), []);
  });

  it("lève si Supabase renvoie une erreur", async () => {
    fromImpl = () => ({
      select: () => Promise.resolve({ data: null, error: { message: 'boom profiles' } }),
    });
    const { getDistanceProfiles } = await import('../strength-mesocycles.ts');
    await assert.rejects(() => getDistanceProfiles(), /boom profiles/i);
  });
});

// ── Sentinels TypeScript ──────────────────────────────────────────────────

const _typeCheckGenerated: GeneratedMesocycle | null = null;
void _typeCheckGenerated;

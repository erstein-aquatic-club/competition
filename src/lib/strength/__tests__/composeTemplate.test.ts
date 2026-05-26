import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeTemplate } from '../composeTemplate.ts';
import type { StrokeSignature, DistanceProfile } from '../mesocycleEngine.types.ts';
import type { StrengthBucket, PeriodizationStructure } from '@/lib/api/types';

// ── Fixtures (§305) ──────────────────────────────────────────────────────────

// Emphases canoniques par distance (ancrées crawl).
// §R5 (DRAFT) — la clé `core` reflète la matrice proposée (À VALIDER COACH) :
// 50→0.45, 200→0.60, 400+→0.65, fond→0.70 (cf. design R5 §1.2).
const E50: Record<StrengthBucket, number> = {
  lower_strength: 0.85,
  lower_power: 0.9,
  upper_strength: 1.0,
  upper_power: 0.5,
  mobility: 0.3,
  core: 0.45,
};
const E200: Record<StrengthBucket, number> = {
  lower_strength: 0.7,
  lower_power: 0.75,
  upper_strength: 0.9,
  upper_power: 0.8,
  mobility: 0.6,
  core: 0.6,
};
const E400: Record<StrengthBucket, number> = {
  lower_strength: 0.8,
  lower_power: 0.6,
  upper_strength: 1.0,
  upper_power: 0.65,
  mobility: 0.8,
  core: 0.65,
};

// Multiplicateurs par nage (crawl ≡ 1.0).
// §R5 (DRAFT) — `core` : crawl 1.0, papillon 1.40, dos 1.25, brasse 0.85, 4N 1.30.
const FREE_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.0,
  lower_power: 1.0,
  upper_strength: 1.0,
  upper_power: 1.0,
  mobility: 1.0,
  core: 1.0,
};
const BREAST_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.214,
  lower_power: 1.333,
  upper_strength: 0.611,
  upper_power: 0.75,
  mobility: 1.333,
  core: 0.85,
};
const DOS_MULT: Record<StrengthBucket, number> = {
  lower_strength: 0.857,
  lower_power: 0.933,
  upper_strength: 0.944,
  upper_power: 1.125,
  mobility: 1.333,
  core: 1.25,
};
const MEDLEY_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.071,
  lower_power: 1.067,
  upper_strength: 0.944,
  upper_power: 1.0,
  mobility: 1.333,
  core: 1.3,
};
const FLY_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.0,
  lower_power: 1.15,
  upper_strength: 1.0,
  upper_power: 1.35,
  mobility: 1.35,
  core: 1.4,
};

const structure: PeriodizationStructure = {
  phases: [{ cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 }],
  bucket_emphasis: {},
};

const sig = (
  stroke_key: StrokeSignature['stroke_key'],
  label: string,
  mult: Record<StrengthBucket, number>,
): StrokeSignature => ({ stroke_key, label, mult });
const profile = (
  distance_key: DistanceProfile['distance_key'],
  label: string,
  emphasis: Record<StrengthBucket, number>,
): DistanceProfile => ({
  distance_key,
  kind: 'season',
  label,
  emphasis,
  structure,
  min_week_count: 8,
  max_week_count: 16,
});

const FREESTYLE = sig('freestyle', 'Crawl', FREE_MULT);
const BREASTSTROKE = sig('breaststroke', 'Brasse', BREAST_MULT);
const BACKSTROKE = sig('backstroke', 'Dos', DOS_MULT);
const MEDLEY = sig('medley', '4 nages', MEDLEY_MULT);
const BUTTERFLY = sig('butterfly', 'Papillon', FLY_MULT);

// Audit 2026-05-26 (R4) — emphase demi-fond (≥ 800 m), distincte du 400 m.
// Rétablit l'ancien template demi-fond : moins de puissance jambes, préhab max.
// §R5 (DRAFT) — core fond 0.70 (économie posturale soutenue).
const EFOND: Record<StrengthBucket, number> = {
  lower_strength: 0.75,
  lower_power: 0.4,
  upper_strength: 1.0,
  upper_power: 0.45,
  mobility: 1.0,
  core: 0.7,
};

const D50 = profile('50', '50m', E50);
const D200 = profile('200', '200m', E200);
const D400 = profile('400plus', '400m', E400);
const DFOND = profile('fond', '800 m / 1500 m', EFOND);

// Tolérance : emphase composée à ±0.01 (arrondi 2 décimales + clamp).
const TOL = 0.01;
const closeBuckets = (
  actual: Record<StrengthBucket, number>,
  expected: Record<StrengthBucket, number>,
): void => {
  for (const b of Object.keys(expected) as StrengthBucket[]) {
    assert.ok(
      Math.abs(actual[b] - expected[b]) < TOL,
      `${b} : attendu ≈ ${expected[b]}, obtenu ${actual[b]}`,
    );
  }
};

// ── Régression : 6 reproductions composées (emphase × mult) ──────────────────

describe('composeTemplate — reproductions de calibration (§305)', () => {
  it('crawl × 50 → emphase sprint_50', () => {
    const t = composeTemplate(D50, FREESTYLE, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.85,
      lower_power: 0.9,
      upper_strength: 1.0,
      upper_power: 0.5,
      mobility: 0.3,
    });
  });

  it('crawl × 200 → emphase 200', () => {
    const t = composeTemplate(D200, FREESTYLE, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.7,
      lower_power: 0.75,
      upper_strength: 0.9,
      upper_power: 0.8,
      mobility: 0.6,
    });
  });

  it('crawl × 400plus → emphase fond', () => {
    const t = composeTemplate(D400, FREESTYLE, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.8,
      lower_power: 0.6,
      upper_strength: 1.0,
      upper_power: 0.65,
      mobility: 0.8,
    });
  });

  it('brasse × 200 → emphase brasse', () => {
    const t = composeTemplate(D200, BREASTSTROKE, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.85,
      lower_power: 1.0,
      upper_strength: 0.55,
      upper_power: 0.6,
      mobility: 0.8,
    });
  });

  it('dos × 200 → emphase dos', () => {
    const t = composeTemplate(D200, BACKSTROKE, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.6,
      lower_power: 0.7,
      upper_strength: 0.85,
      upper_power: 0.9,
      mobility: 0.8,
    });
  });

  it('medley × 200 → emphase 4 nages', () => {
    const t = composeTemplate(D200, MEDLEY, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.75,
      lower_power: 0.8,
      upper_strength: 0.85,
      upper_power: 0.8,
      mobility: 0.8,
    });
  });

  // Audit 2026-05-26 (R4) — le fond doit composer une emphase demi-fond, PAS
  // celle du 400 m : moins de lower_power, mobilité (préhab) au maximum.
  it('crawl × fond → emphase demi-fond, distincte du 400 m', () => {
    const t = composeTemplate(DFOND, FREESTYLE, 'season');
    closeBuckets(t.structure.bucket_emphasis as Record<StrengthBucket, number>, {
      lower_strength: 0.75,
      lower_power: 0.4,
      upper_strength: 1.0,
      upper_power: 0.45,
      mobility: 1.0,
    });
    assert.equal(t.event_group, 'freestyle_fond');
    // Invariant R4 : fond ≠ 400plus (sinon la régression fond est ré-introduite).
    const fond = t.structure.bucket_emphasis as Record<StrengthBucket, number>;
    assert.ok(fond.lower_power < E400.lower_power, 'fond doit avoir moins de lower_power que 400plus');
    assert.ok(fond.mobility > E400.mobility, 'fond doit avoir plus de mobilité que 400plus');
  });
});

// ── Clamp + propagation des métadonnées ──────────────────────────────────────

describe('composeTemplate — clamp & métadonnées (§305)', () => {
  it('clampe lower_power à 1.0 (brasse × 50 : 0.9 × 1.333 = 1.2 → 1)', () => {
    const t = composeTemplate(D50, BREASTSTROKE, 'season');
    assert.equal(t.structure.bucket_emphasis.lower_power, 1);
  });

  it('propage event_group, kind, min_week_count', () => {
    const t = composeTemplate(D50, BREASTSTROKE, 'season');
    assert.equal(t.event_group, 'breaststroke_50');
    assert.equal(t.kind, 'season');
    assert.equal(t.min_week_count, 8);
  });

  // §323 — forced_focus stroke-aware : sur un SPRINT (50/100) le focus forcé vient
  // de la nage (crawl/pap → haut ; brasse → bas) ; hors sprint, aucun forçage.
  it('forced_focus stroke-aware : sprint = nage, hors-sprint = aucun', () => {
    const crawlSprint: StrokeSignature = {
      stroke_key: 'freestyle', label: 'Crawl', mult: FREE_MULT,
      forcedFocus: ['upper_strength', 'upper_power'],
    };
    const breastSprint: StrokeSignature = {
      stroke_key: 'breaststroke', label: 'Brasse', mult: BREAST_MULT,
      forcedFocus: ['lower_strength', 'lower_power'],
    };
    assert.deepEqual(
      composeTemplate(D50, crawlSprint, 'season').structure.forced_focus,
      ['upper_strength', 'upper_power'],
    );
    assert.deepEqual(
      composeTemplate(D50, breastSprint, 'season').structure.forced_focus,
      ['lower_strength', 'lower_power'],
    );
    // 200 m n'est pas un sprint → pas de forçage (le score pilote le focus).
    assert.deepEqual(
      composeTemplate(D200, crawlSprint, 'season').structure.forced_focus ?? [],
      [],
    );
  });
});

// ── §R5 (DRAFT) — seau core (tronc/gainage) — À VALIDER COACH ──────────────────

describe('composeTemplate — seau core (R5, DRAFT — valeurs à valider coach)', () => {
  it('crawl × distances → emphase core ancrée crawl (matrice §1.2)', () => {
    assert.equal(composeTemplate(D50, FREESTYLE, 'season').structure.bucket_emphasis.core, 0.45);
    assert.equal(composeTemplate(D200, FREESTYLE, 'season').structure.bucket_emphasis.core, 0.6);
    assert.equal(composeTemplate(D400, FREESTYLE, 'season').structure.bucket_emphasis.core, 0.65);
    assert.equal(composeTemplate(DFOND, FREESTYLE, 'season').structure.bucket_emphasis.core, 0.7);
  });

  it('papillon = le plus haut core de la matrice (ondulation dauphin)', () => {
    // 200 : 0.60 × 1.40 = 0.84. fond : 0.70 × 1.40 = 0.98 (≤ 1.0, pas de clamp).
    assert.equal(composeTemplate(D200, BUTTERFLY, 'season').structure.bucket_emphasis.core, 0.84);
    assert.equal(composeTemplate(DFOND, BUTTERFLY, 'season').structure.bucket_emphasis.core, 0.98);
  });

  it('4 nages > dos > crawl > brasse en core (200 m)', () => {
    const c = (s: typeof FREESTYLE) =>
      composeTemplate(D200, s, 'season').structure.bucket_emphasis.core as number;
    // medley 0.78, dos 0.75, crawl 0.60, brasse 0.51.
    assert.ok(c(MEDLEY) > c(BACKSTROKE), '4N doit dépasser le dos');
    assert.ok(c(BACKSTROKE) > c(FREESTYLE), 'dos doit dépasser le crawl');
    assert.ok(c(FREESTYLE) > c(BREASTSTROKE), 'crawl doit dépasser la brasse');
    assert.equal(c(BREASTSTROKE), 0.51);
  });

  it('le core ne descend jamais à 0 (socle permanent, toutes nages/distances)', () => {
    for (const stroke of [FREESTYLE, BUTTERFLY, BACKSTROKE, BREASTSTROKE, MEDLEY]) {
      for (const dist of [D50, D200, D400, DFOND]) {
        const core = composeTemplate(dist, stroke, 'season').structure.bucket_emphasis.core as number;
        assert.ok(core > 0, `core doit rester > 0 (${stroke.label} × ${dist.label} = ${core})`);
      }
    }
  });

  it('rétrocompat : profil/signature sans clé core → emphase core 0 (pas de NaN)', () => {
    // Simule des lignes DB pré-migration 00203 (pas de clé `core`).
    const legacyProfile = {
      ...D200,
      emphasis: { lower_strength: 0.7, lower_power: 0.75, upper_strength: 0.9, upper_power: 0.8, mobility: 0.6 } as Record<StrengthBucket, number>,
    };
    const legacySig = {
      ...FREESTYLE,
      mult: { lower_strength: 1, lower_power: 1, upper_strength: 1, upper_power: 1, mobility: 1 } as Record<StrengthBucket, number>,
    };
    const t = composeTemplate(legacyProfile, legacySig, 'season');
    assert.equal(t.structure.bucket_emphasis.core, 0);
    assert.ok(!Number.isNaN(t.structure.bucket_emphasis.core));
    // Les 5 seaux historiques restent corrects.
    assert.equal(t.structure.bucket_emphasis.lower_strength, 0.7);
  });
});

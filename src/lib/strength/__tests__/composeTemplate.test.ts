import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeTemplate } from '../composeTemplate.ts';
import type { StrokeSignature, DistanceProfile } from '../mesocycleEngine.types.ts';
import type { StrengthBucket, PeriodizationStructure } from '@/lib/api/types';

// ── Fixtures (§305) ──────────────────────────────────────────────────────────

// Emphases canoniques par distance (ancrées crawl).
const E50: Record<StrengthBucket, number> = {
  lower_strength: 0.85,
  lower_power: 0.9,
  upper_strength: 1.0,
  upper_power: 0.5,
  mobility: 0.3,
};
const E200: Record<StrengthBucket, number> = {
  lower_strength: 0.7,
  lower_power: 0.75,
  upper_strength: 0.9,
  upper_power: 0.8,
  mobility: 0.6,
};
const E400: Record<StrengthBucket, number> = {
  lower_strength: 0.8,
  lower_power: 0.6,
  upper_strength: 1.0,
  upper_power: 0.65,
  mobility: 0.8,
};

// Multiplicateurs par nage (crawl ≡ 1.0).
const FREE_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.0,
  lower_power: 1.0,
  upper_strength: 1.0,
  upper_power: 1.0,
  mobility: 1.0,
};
const BREAST_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.214,
  lower_power: 1.333,
  upper_strength: 0.611,
  upper_power: 0.75,
  mobility: 1.333,
};
const DOS_MULT: Record<StrengthBucket, number> = {
  lower_strength: 0.857,
  lower_power: 0.933,
  upper_strength: 0.944,
  upper_power: 1.125,
  mobility: 1.333,
};
const MEDLEY_MULT: Record<StrengthBucket, number> = {
  lower_strength: 1.071,
  lower_power: 1.067,
  upper_strength: 0.944,
  upper_power: 1.0,
  mobility: 1.333,
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

const D50 = profile('50', '50m', E50);
const D200 = profile('200', '200m', E200);
const D400 = profile('400plus', '400m+', E400);

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
});

import { describe, it, expect } from 'vitest';
import { composeTemplate } from '../composeTemplate';
import type { StrokeSignature, DistanceProfile } from '../mesocycleEngine.types';
import type { StrengthBucket, PeriodizationStructure } from '@/lib/api/types';

// ── Fixtures (§305) ──────────────────────────────────────────────────────────

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

const structure: PeriodizationStructure = {
  phases: [{ cycle: 'force_max', min_weeks: 2, nominal_weeks: 3, max_weeks: 4 }],
  bucket_emphasis: {},
};

const FREESTYLE: StrokeSignature = {
  stroke_key: 'freestyle',
  label: 'Crawl',
  mult: FREE_MULT,
};

const BREASTSTROKE: StrokeSignature = {
  stroke_key: 'breaststroke',
  label: 'Brasse',
  mult: BREAST_MULT,
};

const D50: DistanceProfile = {
  distance_key: '50',
  kind: 'season',
  label: '50m',
  emphasis: E50,
  structure,
  min_week_count: 8,
  max_week_count: 16,
};

const D200: DistanceProfile = {
  distance_key: '200',
  kind: 'season',
  label: '200m',
  emphasis: E200,
  structure,
  min_week_count: 8,
  max_week_count: 16,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('composeTemplate', () => {
  it('crawl × 50 reproduit exactement l’emphase sprint_50', () => {
    const tpl = composeTemplate(D50, FREESTYLE, 'season');
    expect(tpl.structure.bucket_emphasis).toEqual({
      lower_strength: 0.85,
      lower_power: 0.9,
      upper_strength: 1.0,
      upper_power: 0.5,
      mobility: 0.3,
    });
  });

  it('brasse × 200 reproduit l’emphase brasse à ±0.01', () => {
    const tpl = composeTemplate(D200, BREASTSTROKE, 'season');
    const be = tpl.structure.bucket_emphasis;
    expect(be.lower_strength).toBeCloseTo(0.85, 2);
    expect(be.lower_power).toBeCloseTo(1.0, 2);
    expect(be.upper_strength).toBeCloseTo(0.55, 2);
    expect(be.upper_power).toBeCloseTo(0.6, 2);
    expect(be.mobility).toBeCloseTo(0.8, 2);
  });

  it('clampe à 1.0 et propage event_group, kind, min_week_count', () => {
    const tpl = composeTemplate(D50, BREASTSTROKE, 'season');
    // lower_power : 0.9 × 1.333 = 1.2 → clampé à 1
    expect(tpl.structure.bucket_emphasis.lower_power).toBe(1);
    expect(tpl.event_group).toBe('breaststroke_50');
    expect(tpl.kind).toBe('season');
    expect(tpl.min_week_count).toBe(8);
  });
});

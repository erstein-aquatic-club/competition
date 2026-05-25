/**
 * composeTemplate — Taxonomie nage × distance (§305).
 *
 * Construit un objet « template-like » (consommé tel quel par
 * `mesocycleEngine.ts`) à partir de deux axes :
 *  - une *distance* (emphase canonique ancrée crawl + arc de périodisation) ;
 *  - une *nage* (multiplicateur par seau vs crawl ; crawl ≡ 1.0).
 *
 * Formule : `bucket_emphasis[b] = clamp01(round2(distance.emphasis[b] × stroke.mult[b]))`.
 * Le crawl ayant tous ses multiplicateurs à 1.0, la composition reproduit
 * exactement les templates crawl existants.
 *
 * Fonction pure, sans I/O.
 */

import type { StrokeSignature, DistanceProfile } from './mesocycleEngine.types';
import type {
  StrengthBucket,
  StrengthPeriodizationTemplate,
  PeriodizationTemplateKind,
} from '@/lib/api/types';

const EMPHASIS_BUCKETS: StrengthBucket[] = [
  'lower_strength',
  'lower_power',
  'upper_strength',
  'upper_power',
  'mobility',
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compose un template-like (consommé tel quel par mesocycleEngine) depuis une
 *  distance (emphase ancrée crawl + arc) et une nage (multiplicateur par seau). §305. */
export function composeTemplate(
  profile: DistanceProfile,
  signature: StrokeSignature,
  kind: PeriodizationTemplateKind,
): StrengthPeriodizationTemplate {
  const bucket_emphasis = Object.fromEntries(
    EMPHASIS_BUCKETS.map((b) => [b, clamp01(round2(profile.emphasis[b] * signature.mult[b]))]),
  ) as Record<StrengthBucket, number>;
  return {
    id: `${signature.stroke_key}_${profile.distance_key}_${kind}`,
    event_group: `${signature.stroke_key}_${profile.distance_key}`,
    kind,
    name: `${signature.label} ${profile.label}`,
    min_week_count: profile.min_week_count,
    max_week_count: profile.max_week_count,
    structure: { phases: profile.structure.phases, bucket_emphasis },
    created_at: '',
    updated_at: '',
  };
}

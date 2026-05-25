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

// §R5 (DRAFT 2026-05-26) — `core` ajouté : 6ᵉ seau « tronc/gainage ». Composé
// comme les autres (profil.emphasis.core × signature.mult.core). Les valeurs
// vivent en DB (00203, NON appliquée) — À VALIDER COACH. Tant que la DB ne porte
// pas la clé `core`, `composeTemplate` la lit comme `undefined` → géré ci-dessous
// (emphase 0, rétrocompatible).
const EMPHASIS_BUCKETS: StrengthBucket[] = [
  'lower_strength',
  'lower_power',
  'upper_strength',
  'upper_power',
  'mobility',
  'core',
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
    EMPHASIS_BUCKETS.map((b) => {
      // §R5 — rétrocompat : tant que la DB ne porte pas la clé `core`
      // (migration 00203 non appliquée), `emphasis[b]`/`mult[b]` valent
      // `undefined` → on retombe sur 0 (resp. 1.0 pour le mult, neutre) plutôt
      // que NaN. Les 5 seaux historiques ne sont pas affectés.
      const emphasis = profile.emphasis[b] ?? 0;
      const mult = signature.mult[b] ?? 1;
      return [b, clamp01(round2(emphasis * mult))];
    }),
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

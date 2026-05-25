/**
 * Détection du profil muscu « sous-calibré » : ambition de performance élevée
 * (tier national/élite) mais niveau de pratique resté sous « confirmé »
 * (advanced) → le pool d'exercices avancés (tractions lestées, haltérophilie,
 * pliométrie avancée) n'est jamais servi par `selectExercises`. §304 (écart GA
 * de l'audit 2026-05-25). Helper pur, sans état.
 */
import type { PerformanceTier } from '@/lib/strength/kpiBaremes';

export type { PerformanceTier };
export type PracticeLevel = 'beginner' | 'intermediate' | 'advanced';

/** Niveau de pratique recommandé pour exploiter pleinement un tier donné. */
export const RECOMMENDED_LEVEL_FOR_TIER: Record<PerformanceTier, PracticeLevel> = {
  club: 'beginner', // pas de contrainte
  regional: 'intermediate',
  national: 'advanced',
  elite: 'advanced',
};

/**
 * `true` quand l'ambition de performance dépasse le niveau d'exercices :
 * tier ∈ {national, elite} ET niveau ≠ advanced. Sens unique — l'inverse
 * (niveau élevé / tier bas) n'est pas un problème et n'est pas signalé.
 */
export function hasUnderLeveledProfile(
  level: PracticeLevel,
  tier: PerformanceTier,
): boolean {
  return (tier === 'national' || tier === 'elite') && level !== 'advanced';
}

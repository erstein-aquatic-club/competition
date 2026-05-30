import type {
  PeriodizationCycle,
  StrengthPeriodizationTemplate,
} from '@/lib/api/types';

/**
 * Given a periodization template and a 0-based week index, return the cycle
 * at that week by walking **nominal_weeks** of each phase in order.
 *
 * Returns null if weekIndex is out of range.
 *
 * ⚠️ Walk NOMINAL : ne reflète PAS l'étirement/compression appliqué par
 * `periodize` quand `totalWeeks ≠ Σ nominal_weeks`. Pour la phase réelle d'un
 * plan matérialisé, utiliser `cycleAtWeek(template, totalWeeks, idx)`
 * (mesocycleEngine.ts) — source unique fidèle à `periodize` (§340 Lot 2, E2).
 * Conservé pour ses tests et comme référence du mapping nominal.
 */
export function phaseAtWeek(
  template: StrengthPeriodizationTemplate,
  weekIndex0: number,
): PeriodizationCycle | null {
  if (weekIndex0 < 0) return null;
  let acc = 0;
  for (const phase of template.structure.phases) {
    acc += phase.nominal_weeks;
    if (weekIndex0 < acc) return phase.cycle;
  }
  return null;
}

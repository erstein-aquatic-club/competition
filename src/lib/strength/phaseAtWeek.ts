import type {
  PeriodizationCycle,
  StrengthPeriodizationTemplate,
} from '@/lib/api/types';

/**
 * Given a periodization template and a 0-based week index, return the cycle
 * at that week (walking nominal_weeks of each phase in order).
 *
 * Returns null if weekIndex is out of range. Used by the mid-cycle adjust
 * feature to preserve the phase sequence when re-rolling from a pivot.
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

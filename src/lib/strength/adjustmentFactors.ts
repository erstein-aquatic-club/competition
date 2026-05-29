import type { GeneratedMesocycle } from './mesocycleEngine.types';

/**
 * Post-processing applied AFTER generateMesocycle() to scale sets and
 * intensityPct1rm by coach-driven factors (mid-cycle adjust feature).
 *
 * Rules :
 *  - sets *= volumeFactor → round → clamp >= 1
 *  - intensityPct1rm *= intensityFactor → round → clamp [0, 100]
 *  - intensityPct1rm of 0 or null stays intact (plio / BW, scaling meaningless)
 *  - throws on factor <= 0 (defensive — UI sliders clamp upstream anyway)
 *  - pure : returns a new plan, original is not mutated
 */
export function applyAdjustmentFactors(
  plan: GeneratedMesocycle,
  volumeFactor: number,
  intensityFactor: number,
): GeneratedMesocycle {
  if (!(volumeFactor > 0)) throw new Error('volumeFactor must be > 0');
  if (!(intensityFactor > 0)) throw new Error('intensityFactor must be > 0');

  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => ({
        ...session,
        exercises: session.exercises.map((exo) => ({
          ...exo,
          sets: Math.max(1, Math.round(exo.sets * volumeFactor)),
          intensityPct1rm:
            exo.intensityPct1rm == null || exo.intensityPct1rm === 0
              ? exo.intensityPct1rm
              : Math.max(0, Math.min(100, Math.round(exo.intensityPct1rm * intensityFactor))),
        })),
      })),
    })),
  };
}

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
 *
 * §375 — Scoping : seules les séances `developpement` sont scalées.
 * Exclusions volontaires :
 *  - `amorce_pap` : dose PAP fixe par doctrine (2×2 lourd + 2×3 explosif,
 *    fraîcheur avant le sprint bassin) — la moduler casserait l'intention.
 *  - `mobilite_corrective` : prescription de sécurité (override douleur/
 *    dysfonction), pas une charge d'entraînement à doser.
 *  - Exercices d'échauffement (warmupKind != null) : Blocs 1-3 §351-352,
 *    dose d'activation fixe quel que soit le volume cible du coach.
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
      sessions: week.sessions.map((session) => {
        // §375 — hors scope du scaling coach :
        //  - amorce_pap : dose PAP fixe par doctrine (2×2 lourd + 2×3 explosif,
        //    fraîcheur avant le sprint bassin) — la moduler casserait l'intention ;
        //  - mobilite_corrective : prescription de sécurité (override douleur/
        //    dysfonction), pas une charge d'entraînement à doser.
        if (session.role === 'amorce_pap' || session.role === 'mobilite_corrective') {
          return session;
        }
        return {
          ...session,
          exercises: session.exercises.map((exo) =>
            // §375 — l'échauffement (Blocs 1-3 §351-352, tagué warmupKind) garde
            // sa dose d'activation, quel que soit le volume cible du coach.
            exo.warmupKind != null
              ? exo
              : {
                  ...exo,
                  sets: Math.max(1, Math.round(exo.sets * volumeFactor)),
                  intensityPct1rm:
                    exo.intensityPct1rm == null || exo.intensityPct1rm === 0
                      ? exo.intensityPct1rm
                      : Math.max(0, Math.min(100, Math.round(exo.intensityPct1rm * intensityFactor))),
                },
          ),
        };
      }),
    })),
  };
}

/**
 * Barèmes KPI du Bilan Muscu — population de référence : SCOLAIRE GÉNÉRALE.
 *
 * 1 KPI sur 5 (`broad_jump`) repose sur des normes publiées réelles ; les
 * 4 autres sont transposés (`vertical_jump`, `weighted_pullup`, `imtp`) ou
 * de simples placeholders à calibrer (`medball_vertical_throw`).
 *
 * Source détaillée et raisonnement : `docs/plans/bilan-muscu-baremes-sources.md`.
 * Barèmes validés par le coach le 2026-05-17 (3 bandes d'âge — pas de bilan
 * avant 13 ans ; valeurs filles réelles par bande ; flag de confiance).
 *
 * §293 : le barème `vertical_jump` est passé d'une hauteur (cm) à une
 * puissance relative (W/kg) — voir `bilan-muscu-barème-puissance-detente.md`.
 */

/**
 * Un barème = une liste d'ancres `[valeurBrute, score]` triées par
 * valeurBrute croissante (dérivées des percentiles de normes publiées).
 */
export type Bareme = readonly (readonly [number, number])[];

/**
 * Convertit une mesure brute en score [0, 100] par interpolation linéaire
 * par morceaux entre les ancres du barème.
 *
 *  - `value` sous la première ancre  → score de la première ancre (plancher) ;
 *  - `value` au-dessus de la dernière → extrapolation de la pente du dernier
 *    segment (p90→100), pas de plateau plat à la dernière ancre ;
 *  - entre deux ancres                → interpolation linéaire ;
 *  - le résultat est borné à [0, 100].
 *
 * Lève une `Error` si le barème compte moins de 2 ancres.
 */
export function kpiScore(bareme: Bareme, value: number): number {
  if (bareme.length < 2) {
    throw new Error('kpiScore: bareme needs at least 2 anchors');
  }
  const clamp = (s: number): number => Math.min(100, Math.max(0, s));

  const first = bareme[0];
  const last = bareme[bareme.length - 1];
  if (value <= first[0]) return clamp(first[1]);
  if (value >= last[0]) {
    // Extrapole la pente du dernier segment au-delà de l'ancre haute (p90→100),
    // pour que les profils > p90 restent discriminables (au lieu de saturer à 90).
    const [xPrev, sPrev] = bareme[bareme.length - 2];
    const [xLast, sLast] = last;
    const slope = (sLast - sPrev) / (xLast - xPrev);
    return clamp(sLast + (value - xLast) * slope);
  }

  for (let i = 1; i < bareme.length; i++) {
    const [x0, s0] = bareme[i - 1];
    const [x1, s1] = bareme[i];
    if (value <= x1) {
      const ratio = (value - x0) / (x1 - x0);
      return clamp(s0 + ratio * (s1 - s0));
    }
  }
  // Inatteignable : value est borné par les gardes ci-dessus.
  return clamp(last[1]);
}

import type { StrengthKpiKey } from '@/lib/api/types';

/** Niveau de confiance d'un barème — voir docs/plans/bilan-muscu-baremes-sources.md. */
export type BaremeConfidence = 'solid' | 'transposed' | 'placeholder';

/** Bandes d'âge du Bilan Muscu (pas de bilan avant 13 ans). */
export type AgeBand = '13-14' | '15-16' | '17-18';

export type BaremeSex = 'M' | 'F';

/** Un barème + son niveau de confiance. */
export interface BaremeEntry {
  anchors: Bareme;
  confidence: BaremeConfidence;
}

/**
 * Barèmes par KPI × sexe × bande d'âge.
 *
 * Transcrit depuis `docs/plans/bilan-muscu-baremes-sources.md` (§ 4-8) :
 * chaque barème reprend les ancres p10/p30/p50/p70/p90 → scores 10/30/50/70/90
 * des tranches A2/A3/A4 du document. La tranche A1 (11-12) du document est
 * volontairement OMISE (décision coach 2026-05-17 : pas de bilan avant 13 ans).
 */
export const KPI_BAREMES: Record<
  StrengthKpiKey,
  Record<BaremeSex, Record<AgeBand, BaremeEntry>>
> = {
  // § 5 — détente verticale : PUISSANCE RELATIVE (W/kg) — TRANSPOSÉ.
  // Mesurée en puissance depuis le §293 (et non plus en hauteur cm). Ancres =
  // percentiles de puissance CMJ de Rodrigues et al. 2024 (Frontiers in
  // Pediatrics, 736 jeunes 13-18 ans), agrégés par bande d'âge. Forme solide,
  // niveau absolu à calibrer sur le club → confiance `transposed`.
  // Voir docs/plans/bilan-muscu-barème-puissance-detente.md.
  vertical_jump: {
    M: {
      '13-14': {
        anchors: [[36.9, 10], [41.3, 30], [44.7, 50], [48.5, 70], [55.3, 90]],
        confidence: 'transposed',
      },
      '15-16': {
        anchors: [[42.2, 10], [47.3, 30], [51.1, 50], [55.4, 70], [62.5, 90]],
        confidence: 'transposed',
      },
      '17-18': {
        anchors: [[46.3, 10], [51.7, 30], [55.7, 50], [60.2, 70], [67.8, 90]],
        confidence: 'transposed',
      },
    },
    F: {
      '13-14': {
        anchors: [[33.6, 10], [36.9, 30], [39.6, 50], [42.5, 70], [47.1, 90]],
        confidence: 'transposed',
      },
      '15-16': {
        anchors: [[34.1, 10], [37.7, 30], [40.5, 50], [43.6, 70], [48.3, 90]],
        confidence: 'transposed',
      },
      '17-18': {
        anchors: [[35.1, 10], [39.3, 30], [42.6, 50], [46.1, 70], [51.3, 90]],
        confidence: 'transposed',
      },
    },
  },

  // § 4 — standing broad jump (cm) — normes publiées (Petrigna et al. 2020).
  broad_jump: {
    M: {
      '13-14': {
        anchors: [[133, 10], [153, 30], [167, 50], [181, 70], [197, 90]],
        confidence: 'solid',
      },
      '15-16': {
        anchors: [[134, 10], [159, 30], [175, 50], [191, 70], [211, 90]],
        confidence: 'solid',
      },
      '17-18': {
        anchors: [[148, 10], [168, 30], [187, 50], [203, 70], [224, 90]],
        confidence: 'solid',
      },
    },
    F: {
      '13-14': {
        anchors: [[116, 10], [128, 30], [140, 50], [153, 70], [173, 90]],
        confidence: 'solid',
      },
      '15-16': {
        anchors: [[107, 10], [124, 30], [135, 50], [149, 70], [170, 90]],
        confidence: 'solid',
      },
      '17-18': {
        anchors: [[98, 10], [113, 30], [125, 50], [139, 70], [163, 90]],
        confidence: 'solid',
      },
    },
  },

  // § 7 — mid-thigh pull charge max (kg) — TRANSPOSÉ.
  imtp: {
    M: {
      '13-14': {
        anchors: [[40, 10], [55, 30], [70, 50], [90, 70], [110, 90]],
        confidence: 'transposed',
      },
      '15-16': {
        anchors: [[55, 10], [75, 30], [95, 50], [115, 70], [140, 90]],
        confidence: 'transposed',
      },
      '17-18': {
        anchors: [[65, 10], [90, 30], [110, 50], [130, 70], [155, 90]],
        confidence: 'transposed',
      },
    },
    F: {
      '13-14': {
        anchors: [[32, 10], [42, 30], [55, 50], [68, 70], [85, 90]],
        confidence: 'transposed',
      },
      '15-16': {
        anchors: [[40, 10], [52, 30], [65, 50], [80, 70], [100, 90]],
        confidence: 'transposed',
      },
      '17-18': {
        anchors: [[45, 10], [58, 30], [72, 50], [88, 70], [110, 90]],
        confidence: 'transposed',
      },
    },
  },

  // § 6 — charge additionnelle traction (kg) — TRANSPOSÉ.
  weighted_pullup: {
    M: {
      '13-14': {
        anchors: [[-5, 10], [0, 30], [5, 50], [12.5, 70], [22.5, 90]],
        confidence: 'transposed',
      },
      '15-16': {
        anchors: [[0, 10], [5, 30], [10, 50], [17.5, 70], [30, 90]],
        confidence: 'transposed',
      },
      '17-18': {
        anchors: [[0, 10], [5, 30], [12.5, 50], [20, 70], [35, 90]],
        confidence: 'transposed',
      },
    },
    F: {
      '13-14': {
        anchors: [[-10, 10], [-2.5, 30], [0, 50], [5, 70], [12.5, 90]],
        confidence: 'transposed',
      },
      '15-16': {
        anchors: [[-7.5, 10], [0, 30], [2.5, 50], [7.5, 70], [17.5, 90]],
        confidence: 'transposed',
      },
      '17-18': {
        anchors: [[-5, 10], [0, 30], [5, 50], [10, 70], [20, 90]],
        confidence: 'transposed',
      },
    },
  },

  // § 8 — lancer vertical médecine-ball 10 kg, hauteur (cm) — PLACEHOLDER.
  medball_vertical_throw: {
    M: {
      '13-14': {
        anchors: [[45, 10], [65, 30], [85, 50], [105, 70], [130, 90]],
        confidence: 'placeholder',
      },
      '15-16': {
        anchors: [[65, 10], [90, 30], [115, 50], [140, 70], [170, 90]],
        confidence: 'placeholder',
      },
      '17-18': {
        anchors: [[80, 10], [110, 30], [135, 50], [160, 70], [195, 90]],
        confidence: 'placeholder',
      },
    },
    F: {
      '13-14': {
        anchors: [[30, 10], [42, 30], [55, 50], [70, 70], [88, 90]],
        confidence: 'placeholder',
      },
      '15-16': {
        anchors: [[38, 10], [52, 30], [68, 50], [84, 70], [105, 90]],
        confidence: 'placeholder',
      },
      '17-18': {
        anchors: [[45, 10], [60, 30], [78, 50], [95, 70], [118, 90]],
        confidence: 'placeholder',
      },
    },
  },
};

/** Bande d'âge pour un âge donné. `null` si < 13 ans (pas de bilan). */
export function ageBandFor(age: number): AgeBand | null {
  if (age < 13) return null;
  if (age <= 14) return '13-14';
  if (age <= 16) return '15-16';
  return '17-18';
}

/** Récupère le barème d'un KPI pour un sexe et une bande d'âge. */
export function getBareme(
  kpiKey: StrengthKpiKey,
  sex: BaremeSex,
  ageBand: AgeBand,
): BaremeEntry {
  return KPI_BAREMES[kpiKey][sex][ageBand];
}

/**
 * Niveau de confiance du barème d'un KPI, **invariant** par sexe et bande d'âge
 * (une même source alimente toutes les entrées d'un KPI). Permet d'afficher la
 * fiabilité du barème dès la saisie (recap wizard) et pas seulement à l'aperçu
 * du mésocycle. §301.
 *
 * Rappel : seul `broad_jump` est `solid` (normes publiées) ; `vertical_jump`,
 * `imtp`, `weighted_pullup` sont `transposed` ; `medball_vertical_throw` est
 * `placeholder` (à calibrer).
 */
export function baremeConfidenceFor(kpiKey: StrengthKpiKey): BaremeConfidence {
  return KPI_BAREMES[kpiKey].M['15-16'].confidence;
}

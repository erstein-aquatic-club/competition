/**
 * Moteur de génération du mésocycle Bilan Muscu — Chantier C+D (§293).
 *
 * Fonctions pures, sans I/O, testées unitairement. Interface-pivot :
 * `GeneratedMesocycle` (cf. mesocycleEngine.types.ts).
 *
 * @see docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md §5
 */

import type {
  StrengthKpiKey,
  StrengthKpiMeasurement,
} from '@/lib/api/types';
import { getBareme, kpiScore } from './kpiBaremes';
import type {
  BucketScores,
  MesocycleInput,
} from './mesocycleEngine.types.ts';

/** Sélectionne la mesure la plus récente pour chaque KPI. */
function latestByKpi(
  measurements: StrengthKpiMeasurement[],
): Partial<Record<StrengthKpiKey, StrengthKpiMeasurement>> {
  const out: Partial<Record<StrengthKpiKey, StrengthKpiMeasurement>> = {};
  for (const m of measurements) {
    const prev = out[m.kpi_key];
    if (!prev || m.measured_at > prev.measured_at) {
      out[m.kpi_key] = m;
    }
  }
  return out;
}

/** Score 0-100 d'un KPI via le barème (sexe + bande d'âge), ou null si absent. */
function scoreKpi(
  kpi: StrengthKpiKey,
  latest: Partial<Record<StrengthKpiKey, StrengthKpiMeasurement>>,
  athlete: MesocycleInput['athlete'],
): number | null {
  const m = latest[kpi];
  if (!m) return null;
  const bareme = getBareme(kpi, athlete.sex, athlete.ageBand);
  return kpiScore(bareme.anchors, m.value);
}

/** Moyenne des scores non-null. `null` si tous sont null. */
function meanScore(scores: (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Score mobilité 0-100 depuis le bilan coach (`physical_tests`).
 *
 * 6 sous-scores (mobility × 3 + movement × 3), chacun 0-3 → somme / 18 × 100.
 * `null` si le bilan est absent.
 */
function scoreMobility(
  physicalTests: MesocycleInput['assessment']['physical_tests'],
): number | null {
  if (!physicalTests) return null;
  const { mobility, movement } = physicalTests;
  const sum =
    mobility.shoulder_flexion +
    mobility.t_spine +
    mobility.hip +
    movement.scapula_control +
    movement.trunk_neck_alignment +
    movement.hip_hinge;
  return (sum / 18) * 100;
}

/**
 * Score psychologie 0-100 depuis le questionnaire.
 *
 * Agrège confiance (1-5, ↑=mieux) + motivation (1-5, ↑=mieux) + (6 − stress)
 * (stress 1-5, ↓=mieux) → somme ∈ [3, 15] → ((somme − 3) / 12) × 100.
 * `null` si le questionnaire est absent.
 */
function scorePsychology(
  questionnaire: MesocycleInput['assessment']['questionnaire'],
): number | null {
  if (!questionnaire) return null;
  const { confidence, motivation, stress } = questionnaire.psychology;
  const sum = confidence + motivation + (6 - stress);
  return ((sum - 3) / 12) * 100;
}

/**
 * Scoring des 6 seaux du Bilan Muscu — convertit l'évaluation + les KPI en
 * scores 0-100 (ou null si la donnée manque).
 *
 * Mapping (cf. design §5) :
 * - `lower_strength` ← `imtp`
 * - `lower_power`    ← moyenne(`vertical_jump`, `broad_jump`)
 * - `upper_strength` ← `weighted_pullup`
 * - `upper_power`    ← `medball_vertical_throw`
 * - `mobility`       ← `physical_tests` (bilan coach)
 * - `psychology`     ← `questionnaire.psychology`
 */
export function scoreBuckets(
  assessment: MesocycleInput['assessment'],
  kpiMeasurements: StrengthKpiMeasurement[],
  athlete: MesocycleInput['athlete'],
): BucketScores {
  const latest = latestByKpi(kpiMeasurements);

  const verticalJump = scoreKpi('vertical_jump', latest, athlete);
  const broadJump = scoreKpi('broad_jump', latest, athlete);

  return {
    lower_strength: scoreKpi('imtp', latest, athlete),
    lower_power: meanScore([verticalJump, broadJump]),
    upper_strength: scoreKpi('weighted_pullup', latest, athlete),
    upper_power: scoreKpi('medball_vertical_throw', latest, athlete),
    mobility: scoreMobility(assessment.physical_tests),
    psychology: scorePsychology(assessment.questionnaire),
  };
}

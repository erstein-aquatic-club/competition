/**
 * mobilityEvolution — pure helper building the per-axis chronological series
 * of mobility/movement scores out of a swimmer's bilan history (§347).
 *
 * Reuses `normalizePhysicalTests` so old number-shape bilans (< §346) appear
 * with left === right, and v2 bilans expose their real G/D asymmetry. Each
 * point also carries the `effective` score (weak side = min(left,right)),
 * which is the value the engine prioritises.
 *
 * No fetch — fed from `listAssessments(athleteId)` data already on screen.
 */
import type { StrengthAssessment } from "@/lib/api/types";
import { normalizePhysicalTests, effectiveAxisScore } from "./physicalTests";

/** The 6 axes plotted: 3 mobility + 3 movement. */
export type MobilityEvolutionAxisKey =
  | "shoulder_flexion"
  | "t_spine"
  | "hip"
  | "scapula_control"
  | "trunk_neck_alignment"
  | "hip_hinge";

interface AxisDef {
  key: MobilityEvolutionAxisKey;
  group: "mobility" | "movement";
  /** French label for the axis selector. */
  label: string;
}

/** Static axis catalogue (order = display order). Labels mirror assessmentScores. */
export const MOBILITY_EVOLUTION_AXES: readonly AxisDef[] = [
  { key: "shoulder_flexion", group: "mobility", label: "Flexion d'épaule" },
  { key: "t_spine", group: "mobility", label: "Mobilité thoracique" },
  { key: "hip", group: "mobility", label: "Mobilité de hanche" },
  { key: "scapula_control", group: "movement", label: "Contrôle scapulaire" },
  { key: "trunk_neck_alignment", group: "movement", label: "Alignement tronc / nuque" },
  { key: "hip_hinge", group: "movement", label: "Charnière de hanche" },
] as const;

/** One plotted point for an axis. */
export interface MobilityEvolutionPoint {
  /** ISO date — physical_tests.filled_at when present, else created_at. */
  date: string;
  left: number;
  right: number;
  /** Weak side (min G/D) — the score the engine prioritises. */
  effective: number;
}

export type MobilityEvolution = Record<
  MobilityEvolutionAxisKey,
  MobilityEvolutionPoint[]
>;

function emptyEvolution(): MobilityEvolution {
  return {
    shoulder_flexion: [],
    t_spine: [],
    hip: [],
    scapula_control: [],
    trunk_neck_alignment: [],
    hip_hinge: [],
  };
}

/**
 * Build the per-axis ascending-by-date series from a list of assessments.
 * Assessments whose `physical_tests` is null are skipped.
 */
export function buildMobilityEvolution(
  assessments: StrengthAssessment[],
): MobilityEvolution {
  const out = emptyEvolution();

  for (const assessment of assessments) {
    const normalized = normalizePhysicalTests(assessment.physical_tests ?? null);
    if (!normalized) continue;

    const date = normalized.filled_at?.trim()
      ? normalized.filled_at
      : assessment.created_at;

    for (const axisDef of MOBILITY_EVOLUTION_AXES) {
      const group = normalized[axisDef.group] as Record<
        string,
        { left: number; right: number }
      >;
      const axis = group[axisDef.key];
      if (!axis) continue;
      out[axisDef.key].push({
        date,
        left: axis.left,
        right: axis.right,
        effective: effectiveAxisScore(axis),
      });
    }
  }

  // Sort each axis series ascending by date.
  for (const axisDef of MOBILITY_EVOLUTION_AXES) {
    out[axisDef.key].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return out;
}

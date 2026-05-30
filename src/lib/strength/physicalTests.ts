import type { AxisScoreRaw, MobilityAxisScore, StrengthPhysicalTests, StrengthPhysicalTestsNormalized } from '@/lib/api/types';

/** Score effectif d'un axe = côté le plus faible (corrige le déficit unilatéral). */
export function effectiveAxisScore(axis: MobilityAxisScore): number {
  return Math.min(axis.left, axis.right);
}

function normalizeAxis(raw: AxisScoreRaw): MobilityAxisScore {
  if (typeof raw === 'number') return { left: raw, right: raw, note: undefined };
  return { left: raw.left, right: raw.right, note: raw.note };
}

/** Upcaste la forme stockée (v1 number par axe OU v2 objet) en forme canonique. */
export function normalizePhysicalTests(raw: StrengthPhysicalTests | null): StrengthPhysicalTestsNormalized | null {
  if (!raw) return null;
  return {
    mobility: {
      shoulder_flexion: normalizeAxis(raw.mobility.shoulder_flexion),
      t_spine: normalizeAxis(raw.mobility.t_spine),
      hip: normalizeAxis(raw.mobility.hip),
    },
    movement: {
      scapula_control: normalizeAxis(raw.movement.scapula_control),
      trunk_neck_alignment: normalizeAxis(raw.movement.trunk_neck_alignment),
      hip_hinge: normalizeAxis(raw.movement.hip_hinge),
    },
    note: raw.note,
    filled_at: raw.filled_at,
  };
}

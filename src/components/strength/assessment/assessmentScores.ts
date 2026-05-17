/**
 * assessmentScores — static definition of the 6 movement-quality scores
 * the coach records to complete a "Bilan Muscu" (§287, Chantier B, Phase 8).
 *
 * Each score is an integer 0-3 (0 = dysfonctionnel … 3 = optimal) and maps
 * onto the `StrengthPhysicalTests` JSONB shape: two groups (mobility,
 * movement) of three scores each. Keeping the labels here — not inline in
 * the screen — keeps the form a flat data-driven loop.
 */
import type { StrengthPhysicalTests } from "@/lib/api/types";

/** Group of `StrengthPhysicalTests`. */
export type AssessmentScoreGroup = "mobility" | "movement";

/** Key of one score within its group. */
export type MobilityScoreKey = keyof StrengthPhysicalTests["mobility"];
export type MovementScoreKey = keyof StrengthPhysicalTests["movement"];

export interface AssessmentScoreItem {
  group: AssessmentScoreGroup;
  /** Key within the group object. */
  key: MobilityScoreKey | MovementScoreKey;
  /** French label shown above the 0-3 selector. */
  label: string;
  /** Short helper line — what the coach is observing. */
  hint: string;
  /** Caption under score 0. */
  labelLow: string;
  /** Caption under score 3. */
  labelHigh: string;
}

/** The 3 mobility scores. */
export const MOBILITY_SCORES: AssessmentScoreItem[] = [
  {
    group: "mobility",
    key: "shoulder_flexion",
    label: "Flexion d'épaule",
    hint: "Amplitude bras au-dessus de la tête, dos plaqué au mur.",
    labelLow: "Très limitée",
    labelHigh: "Complète",
  },
  {
    group: "mobility",
    key: "t_spine",
    label: "Mobilité thoracique",
    hint: "Rotation du haut du dos sans compenser par les lombaires.",
    labelLow: "Raide",
    labelHigh: "Libre",
  },
  {
    group: "mobility",
    key: "hip",
    label: "Mobilité de hanche",
    hint: "Amplitude de flexion / rotation de hanche en squat profond.",
    labelLow: "Bloquée",
    labelHigh: "Ample",
  },
];

/** The 3 movement-quality scores. */
export const MOVEMENT_SCORES: AssessmentScoreItem[] = [
  {
    group: "movement",
    key: "scapula_control",
    label: "Contrôle scapulaire",
    hint: "Gainage des omoplates en tirage / gainage bras tendus.",
    labelLow: "Anarchique",
    labelHigh: "Maîtrisé",
  },
  {
    group: "movement",
    key: "trunk_neck_alignment",
    label: "Alignement tronc / nuque",
    hint: "Tronc et nuque alignés, sans cassure lombaire ni cervicale.",
    labelLow: "Désaligné",
    labelHigh: "Aligné",
  },
  {
    group: "movement",
    key: "hip_hinge",
    label: "Charnière de hanche",
    hint: "Mouvement de hip hinge propre, dos neutre, hanches en arrière.",
    labelLow: "Dysfonctionnel",
    labelHigh: "Optimal",
  },
];

/** The 0-3 scale legend, shown once at the top of the scoring section. */
export const SCORE_LEGEND: { value: number; label: string }[] = [
  { value: 0, label: "Dysfonctionnel" },
  { value: 1, label: "Insuffisant" },
  { value: 2, label: "Correct" },
  { value: 3, label: "Optimal" },
];

/** Sentinel for a score not yet picked (ScaleField treats < min as unset). */
export const SCORE_UNSET = -1;

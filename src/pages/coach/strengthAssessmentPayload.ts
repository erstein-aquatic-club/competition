/**
 * strengthAssessmentPayload — état du formulaire de bilan physique coach et
 * construction du payload `StrengthPhysicalTests` v2 (§346).
 *
 * Depuis §346, cinq axes sont saisis en bilatéral (Gauche / Droite) avec une
 * note libre optionnelle ; `trunk_neck_alignment` reste un score unique
 * (écrit `left === right`). Une note de synthèse globale alimente le champ
 * `note` racine de `physical_tests`.
 *
 * Le builder est une fonction PURE (pas de React) pour être testé directement
 * et garder l'écran déclaratif.
 */
import type { StrengthPhysicalTests, MobilityAxisScore } from "@/lib/api/types";
import {
  MOBILITY_SCORES,
  MOVEMENT_SCORES,
  SCORE_UNSET,
  type MobilityScoreKey,
  type MovementScoreKey,
} from "@/components/strength/assessment/assessmentScores";

/** Tous les axes (mobilité + mouvement). */
type ScoreKey = MobilityScoreKey | MovementScoreKey;

/** Axes saisis en bilatéral G/D + note (§346). */
export const BILATERAL_KEYS: ReadonlySet<ScoreKey> = new Set<ScoreKey>([
  "shoulder_flexion",
  "t_spine",
  "hip",
  "scapula_control",
  "hip_hinge",
]);

/** Axe à score unique (Gauche === Droite à l'écriture). */
export const SINGLE_KEY: ScoreKey = "trunk_neck_alignment";

/** État d'un axe dans le formulaire. `left`/`right` à SCORE_UNSET = non noté. */
export interface AxisFormState {
  left: number;
  right: number;
  note: string;
}

/** État plat du formulaire : un `AxisFormState` par axe + note de synthèse. */
export interface ScoreState {
  axes: Record<ScoreKey, AxisFormState>;
  /** Note de synthèse globale du bilan physique. */
  note: string;
}

const ALL_KEYS: ScoreKey[] = [
  ...MOBILITY_SCORES.map((s) => s.key),
  ...MOVEMENT_SCORES.map((s) => s.key),
];

export const emptyScores = (): ScoreState => ({
  axes: Object.fromEntries(
    ALL_KEYS.map((k) => [k, { left: SCORE_UNSET, right: SCORE_UNSET, note: "" }]),
  ) as Record<ScoreKey, AxisFormState>,
  note: "",
});

/** Vrai si l'axe est complètement noté (les deux côtés pour un G/D ; le côté
 *  gauche pour un axe unique — droite est miroir). */
export function isAxisScored(key: ScoreKey, st: AxisFormState): boolean {
  if (BILATERAL_KEYS.has(key)) return st.left >= 0 && st.right >= 0;
  return st.left >= 0;
}

/** Vrai si TOUS les axes requis sont notés (condition d'envoi). */
export function allAxesScored(state: ScoreState): boolean {
  return ALL_KEYS.every((k) => isAxisScored(k, state.axes[k]));
}

/** Nombre d'axes entièrement notés / total (pour l'indicateur d'envoi). */
export function scoredAxisCount(state: ScoreState): {
  done: number;
  total: number;
} {
  return {
    done: ALL_KEYS.filter((k) => isAxisScored(k, state.axes[k])).length,
    total: ALL_KEYS.length,
  };
}

function axisPayload(key: ScoreKey, st: AxisFormState): MobilityAxisScore {
  const note = st.note.trim();
  if (key === SINGLE_KEY) {
    // Axe unique : on écrit left === right (la droite n'est jamais saisie).
    return { left: st.left, right: st.left, note: note || undefined };
  }
  return { left: st.left, right: st.right, note: note || undefined };
}

/**
 * Construit le payload v2 `StrengthPhysicalTests`.
 * @param filledAt ISO timestamp (injecté pour rester testable / déterministe).
 */
export function buildPhysicalTestsPayload(
  state: ScoreState,
  filledAt: string,
): StrengthPhysicalTests {
  const synthesis = state.note.trim();
  return {
    mobility: {
      shoulder_flexion: axisPayload("shoulder_flexion", state.axes.shoulder_flexion),
      t_spine: axisPayload("t_spine", state.axes.t_spine),
      hip: axisPayload("hip", state.axes.hip),
    },
    movement: {
      scapula_control: axisPayload("scapula_control", state.axes.scapula_control),
      trunk_neck_alignment: axisPayload(
        "trunk_neck_alignment",
        state.axes.trunk_neck_alignment,
      ),
      hip_hinge: axisPayload("hip_hinge", state.axes.hip_hinge),
    },
    note: synthesis || undefined,
    filled_at: filledAt,
  };
}

/** Préremplit l'état depuis un bilan normalisé (édition / reprise). */
export function scoreStateFromNormalized(
  norm: import("@/lib/api/types").StrengthPhysicalTestsNormalized | null,
): ScoreState {
  const base = emptyScores();
  if (!norm) return base;
  const fill = (key: ScoreKey, axis: MobilityAxisScore) => {
    base.axes[key] = {
      left: axis.left,
      right: axis.right,
      note: axis.note ?? "",
    };
  };
  fill("shoulder_flexion", norm.mobility.shoulder_flexion);
  fill("t_spine", norm.mobility.t_spine);
  fill("hip", norm.mobility.hip);
  fill("scapula_control", norm.movement.scapula_control);
  fill("trunk_neck_alignment", norm.movement.trunk_neck_alignment);
  fill("hip_hinge", norm.movement.hip_hinge);
  base.note = norm.note ?? "";
  return base;
}

/**
 * bilanProgress — état du « fil conducteur » du bilan muscu coach (§302).
 *
 * Donne, pour les 3 étapes (questionnaire / KPIs / bilan physique), un état
 * `done` | `current` | `todo` dérivé du statut de l'assessment et de la
 * présence de mesures KPI. Les KPIs sont **indépendants** du statut (ils
 * peuvent être saisis à tout moment) : ils n'ont donc pas d'état `current`.
 */
import type { StrengthAssessment } from "@/lib/api/types";

export type StepState = "done" | "current" | "todo";

export interface BilanProgressState {
  questionnaire: StepState;
  kpis: StepState;
  physical: StepState;
}

type Status = StrengthAssessment["status"] | null | undefined;

export function computeBilanProgress(
  status: Status,
  hasKpis: boolean,
): BilanProgressState {
  const questionnaire: StepState =
    status === "questionnaire_pending"
      ? "current"
      : status === "bilan_pending" || status === "completed"
        ? "done"
        : "todo";

  const physical: StepState =
    status === "completed"
      ? "done"
      : status === "bilan_pending"
        ? "current"
        : "todo";

  // Les KPIs sont indépendants du statut de l'assessment.
  const kpis: StepState = hasKpis ? "done" : "todo";

  return { questionnaire, kpis, physical };
}

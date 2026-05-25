import { useLocation } from "wouter";
import { computeBilanProgress } from "@/lib/strength/bilanProgress";
import type { BilanStep } from "@/components/strength/assessment/BilanProgress";
import type { StrengthAssessment } from "@/lib/api/types";

type Status = StrengthAssessment["status"] | null | undefined;

/**
 * Builds the 4-step bilan progress strip for coach screens.
 *
 * @param athleteId     Athlete being assessed (null → empty array).
 * @param status        Latest assessment status.
 * @param hasKpis       True if at least one KPI measurement exists.
 * @param hasActiveMesocycle  True if a mesocycle is currently active.
 * @param currentKey    Key of the screen currently shown — suppresses its own
 *                      onTap so the coach doesn't navigate to where they already are.
 */
export function useBilanSteps(
  athleteId: number | null,
  status: Status,
  hasKpis: boolean,
  hasActiveMesocycle: boolean,
  currentKey?: "questionnaire" | "kpis" | "physical" | "generation",
): BilanStep[] {
  const [, navigate] = useLocation();
  const progress = computeBilanProgress(status, hasKpis, hasActiveMesocycle);

  if (athleteId == null) return [];

  return [
    {
      key: "questionnaire",
      label: "Questionnaire",
      state: progress.questionnaire,
      // Tappable only when the questionnaire is the active next step (lets the
      // coach navigate there to fill it with the swimmer).
      onTap:
        currentKey !== "questionnaire" && progress.questionnaire === "current"
          ? () => navigate(`/coach/questionnaire/${athleteId}`)
          : undefined,
    },
    {
      key: "kpis",
      label: "KPIs",
      state: progress.kpis,
      // Always re-measurable — suppress only if already on the KPI screen.
      onTap:
        currentKey !== "kpis"
          ? () => navigate(`/coach/kpi-wizard/${athleteId}`)
          : undefined,
    },
    {
      key: "physical",
      label: "Bilan physique",
      state: progress.physical,
      onTap:
        currentKey !== "physical"
          ? () => navigate(`/coach/strength-assessment/${athleteId}`)
          : undefined,
    },
    {
      key: "generation",
      label: "Génération",
      state: progress.generation,
      // Non-interactive while still todo; tappable once bilan is completed.
      onTap:
        currentKey !== "generation" && progress.generation !== "todo"
          ? () => navigate(`/coach/mesocycle-generate/${athleteId}`)
          : undefined,
    },
  ];
}

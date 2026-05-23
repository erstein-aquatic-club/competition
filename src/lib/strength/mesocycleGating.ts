/**
 * mesocycleGating — détermine si un nageur peut générer un mésocycle (§299 W1).
 *
 * Le verrou est abaissé à `bilan_pending` (questionnaire soumis, notation coach
 * non encore réalisée). Le coach peut enrichir le plan après coup — le moteur
 * tolère déjà `physical_tests = null`.
 */
import type { StrengthAssessment } from "@/lib/api/types";

type Status = StrengthAssessment["status"] | null | undefined;

/**
 * Retourne `true` si le nageur est autorisé à lancer la génération du mésocycle.
 *
 * - `"bilan_pending"` → questionnaire soumis, bilan physique coach en attente.
 *   Le moteur tourne en mode confiance réduite (physical_tests = null).
 * - `"completed"` → bilan complet, données optimales.
 * - Tout autre statut (null, undefined, "questionnaire_pending") → false.
 */
export function canGenerateMesocycle(status: Status): boolean {
  return status === "bilan_pending" || status === "completed";
}

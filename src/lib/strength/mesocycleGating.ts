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

/**
 * Garde double-apply (#5, audit 2026-05-26). L'apply matérialise un mésocycle
 * via une RPC transactionnelle ; si elle **réussit côté serveur** mais que le
 * **client time-out** (réseau coupé après commit), un retour en erreur pourrait
 * pousser l'utilisateur à **réessayer** → un 2ᵉ apply qui supersede le méso
 * fraîchement créé et en empile un autre (la surface converge via §308, mais on
 * accumule des mésos superseded inutiles).
 *
 * Après une erreur d'apply, on **re-lit le mésocycle actif** : s'il a été créé
 * **pendant ou après** le début de la tentative, c'est que l'apply a en fait
 * abouti → on traite comme un succès (rediriger vers le plan) au lieu d'inviter
 * à recommencer. Comparaison en temps absolu (`created_at` serveur vs instant de
 * départ client) : tolérante au petit écart d'horloge à l'échelle des secondes.
 *
 * @param attemptStartedAtMs  `Date.now()` capturé au lancement de l'apply.
 * @param activeMesocycleCreatedAtIso  `created_at` du méso actif re-lu, ou null.
 * @returns `true` si l'apply a vraisemblablement abouti malgré l'erreur.
 */
export function applyLikelySucceededDespiteError(
  attemptStartedAtMs: number,
  activeMesocycleCreatedAtIso: string | null | undefined,
): boolean {
  if (!activeMesocycleCreatedAtIso) return false;
  const createdMs = Date.parse(activeMesocycleCreatedAtIso);
  if (Number.isNaN(createdMs)) return false;
  return createdMs >= attemptStartedAtMs;
}

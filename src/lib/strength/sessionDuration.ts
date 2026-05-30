import type { StrengthSessionItem } from "@/lib/api/types";

/**
 * Temps d'exécution forfaitaire d'une série (hors repos), en secondes.
 * Choix produit (§331) : 1 min par série, simple et lisible pour le nageur.
 */
export const EXEC_SECONDS_PER_SET = 60;

/**
 * Estime la durée totale d'une séance de muscu, en secondes.
 *
 * Modèle (§331) : pour chaque exercice, on compte `sets × (EXEC_SECONDS_PER_SET + repos)`,
 * soit **un repos par série** — le repos après la dernière série couvre la
 * transition vers l'exercice suivant. Tous les items comptent (échauffement/mobilité
 * inclus = temps réellement passé). `rest_seconds` = repos entre séries (`rest_series_s`).
 *
 * Garde-fous : un exercice avec `sets` ≤ 0 ou non fini compte 0 ; un `rest_seconds`
 * négatif ou non fini est traité comme 0.
 */
export function estimateStrengthSessionDurationSeconds(items: StrengthSessionItem[]): number {
  return items.reduce((total, item) => {
    const sets = Number(item.sets);
    if (!Number.isFinite(sets) || sets <= 0) return total;
    const rest = Number(item.rest_seconds);
    const restSeconds = Number.isFinite(rest) && rest > 0 ? rest : 0;
    return total + sets * (EXEC_SECONDS_PER_SET + restSeconds);
  }, 0);
}

/**
 * Estime la durée **restante** d'une séance en cours, en secondes, avec le MÊME
 * modèle que `estimateStrengthSessionDurationSeconds` (1 min exec + `rest_seconds`
 * PROPRE à chaque exercice). Garantit que l'écran inter-séries est cohérent avec
 * l'aperçu : `remaining ≤ total`, décroît de façon monotone, et n'explose jamais
 * en changeant d'exercice (le repos n'est plus un scalaire global appliqué à tous).
 *
 * @param items          tous les items de la séance, dans l'ordre.
 * @param currentStep    index 1-based de l'exercice en cours.
 * @param currentSetIndex index 1-based de la série en cours / à venir (les
 *                        `currentSetIndex - 1` premières séries comptent comme faites).
 */
export function estimateRemainingStrengthSessionDurationSeconds(
  items: StrengthSessionItem[],
  currentStep: number,
  currentSetIndex: number,
): number {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const stepIdx =
    Math.min(Math.max(1, Math.floor(currentStep) || 1), items.length) - 1;

  // Exercice en cours : seules les séries non encore faites comptent.
  const current = items[stepIdx];
  let currentRemaining = 0;
  const curSets = Number(current?.sets);
  if (Number.isFinite(curSets) && curSets > 0) {
    const done = Math.min(Math.max(0, Math.floor(currentSetIndex) - 1), curSets);
    const remainingSets = curSets - done;
    const rest = Number(current.rest_seconds);
    const restSeconds = Number.isFinite(rest) && rest > 0 ? rest : 0;
    currentRemaining = remainingSets * (EXEC_SECONDS_PER_SET + restSeconds);
  }

  // Exercices suivants : intégralité, via le modèle canonique (repos par item).
  const future = estimateStrengthSessionDurationSeconds(items.slice(stepIdx + 1));

  return currentRemaining + future;
}

/**
 * Formate une durée (secondes) en libellé court approximatif « ~X min ».
 * Arrondi à la minute la plus proche, plancher à 1 min pour toute durée positive.
 */
export function formatApproxMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} min`;
}

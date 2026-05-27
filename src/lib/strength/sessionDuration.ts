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
 * Formate une durée (secondes) en libellé court approximatif « ~X min ».
 * Arrondi à la minute la plus proche, plancher à 1 min pour toute durée positive.
 */
export function formatApproxMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} min`;
}

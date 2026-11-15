/**
 * Agrège les échecs de PREMIER chargement d'un ensemble de requêtes React Query.
 *
 * Pourquoi : plusieurs écrans muscu (aperçu méso, Mon plan, entrée méso) lisaient
 * `data` avec une valeur par défaut (`= []`, `?? null`) sans regarder l'erreur :
 * un échec réseau devenait « pas de bilan », « aucun plan » ou — pire — un plan
 * généré sur des données partielles. On ne s'appuie que sur `isLoadingError`
 * (échec sans aucune donnée en cache) : un échec de refetch en arrière-plan avec
 * des données déjà présentes ne doit PAS masquer un écran valide.
 */
export interface LoadableQuery {
  isLoadingError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

export interface LoadFailureSummary {
  hasFailure: boolean;
  /** Libellés (côté utilisateur) des données qui n'ont pas pu être chargées. */
  failedLabels: string[];
  /** Libellés joints en français : « a », « a et b », « a, b et c ». */
  failedText: string;
  /** Vrai pendant la relance d'au moins une requête en échec. */
  isRetrying: boolean;
  /** Relance uniquement les requêtes en échec. */
  retry: () => void;
}

function joinFr(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

export function summarizeLoadFailures(
  entries: Array<[label: string, query: LoadableQuery]>,
): LoadFailureSummary {
  const failed = entries.filter(([, query]) => query.isLoadingError);
  const failedLabels = failed.map(([label]) => label);
  return {
    hasFailure: failed.length > 0,
    failedLabels,
    failedText: joinFr(failedLabels),
    isRetrying: failed.some(([, query]) => query.isFetching),
    retry: () => {
      for (const [, query] of failed) void query.refetch();
    },
  };
}

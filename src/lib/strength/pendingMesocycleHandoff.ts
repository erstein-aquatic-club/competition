/**
 * Passage des paramètres de génération/ajustement → aperçu du mésocycle.
 *
 * Audit robustesse muscu (lot 4, constat 9) : les écrans écrivaient en
 * `sessionStorage` et, en cas d'échec (quota, stockage bloqué), le commentaire
 * promettait un repli « via le route state » qui n'existait pas → l'aperçu ne
 * trouvait rien, renvoyait vers la génération : boucle.
 *
 * Copie mémoire PRIORITAIRE (toujours la plus récente pendant la vie de la
 * page) ; `sessionStorage` ne sert qu'à survivre à un rechargement.
 */
export const PENDING_MESOCYCLE_KEY = "eac_pending_mesocycle_params";

let memory: string | null = null;

export function savePendingMesocycleParams(payload: unknown): void {
  const raw = JSON.stringify(payload);
  memory = raw;
  try {
    window.sessionStorage.setItem(PENDING_MESOCYCLE_KEY, raw);
  } catch {
    // Écriture impossible : purge l'éventuel payload périmé (best-effort) pour
    // qu'un rechargement ne ressuscite pas d'anciens paramètres.
    try {
      window.sessionStorage.removeItem(PENDING_MESOCYCLE_KEY);
    } catch {
      /* stockage totalement indisponible : la copie mémoire suffit */
    }
  }
}

export function readPendingMesocycleRaw(): string | null {
  if (memory != null) return memory;
  try {
    return window.sessionStorage.getItem(PENDING_MESOCYCLE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingMesocycleParams(): void {
  memory = null;
  try {
    window.sessionStorage.removeItem(PENDING_MESOCYCLE_KEY);
  } catch {
    /* ignore : stockage indisponible */
  }
}

/**
 * Nombre de séances muscu encore en attente de synchronisation dans la file
 * hors-ligne (audit robustesse muscu, lot 3). Avant : seul un toast passager
 * signalait la mise en file — `sync_pending` était écrit mais jamais lu, et le
 * nageur ne pouvait pas savoir qu'une séance n'était pas encore envoyée.
 *
 * Une séance = un `run_id` (ses séries + sa clôture comptent pour 1). Un élément
 * muscu sans `run_id` compte à part : mieux vaut sur-signaler que masquer.
 */
const STRENGTH_SYNC_TYPES = new Set(["strength-run-completed", "strength-set-log", "updateRun"]);

export interface QueueItemLike {
  type: string;
  payload: Record<string, unknown>;
}

export function countPendingStrengthSessions(queue: readonly QueueItemLike[]): number {
  const runIds = new Set<number>();
  let withoutRunId = 0;
  for (const it of queue) {
    if (!STRENGTH_SYNC_TYPES.has(it.type)) continue;
    const runId = it.payload?.run_id;
    if (typeof runId === "number" && Number.isFinite(runId)) runIds.add(runId);
    else withoutRunId += 1;
  }
  return runIds.size + withoutRunId;
}

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  logStrengthSet,
  updateStrengthRun,
  saveStrengthRun,
  updateProfile,
  update1RM,
  upsertSwimRecord,
  setPlannedAbsence,
  removePlannedAbsence,
  createTimesheetShift,
  updateTimesheetShift,
  deleteTimesheetShift,
  createTimesheetLocation,
  deleteTimesheetLocation,
  saveSwimSessionAtomic,
  uploadAvatar,
  dataUrlToBlob,
} from "@/lib/api";
import { canUseSupabase } from "@/lib/api/client";
import { getQueue, markRetry, removeQueueItem, QUEUE_UPDATED_EVENT, QUEUE_REAPED_EVENT, isTransientError, type QueuedMutation } from "@/lib/offlineQueue";
import { runSyncOnce } from "@/lib/offlineSync";
import { supabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/lib/auth";
import type { SetLogEntry, UpdateStrengthRunInput } from "@/lib/types";

type QueuedStrengthCompletionPayload = UpdateStrengthRunInput & {
  started_at?: string | null;
  athlete_name?: string | null;
  logs?: SetLogEntry[];
};

type QueuedStrengthSetLogPayload = {
  run_id: number;
  exercise_id: number;
  set_index?: number | null;
  reps?: number | null;
  weight?: number | null;
  difficulty?: number | null;
  athlete_id?: number | string | null;
  athlete_name?: string | null;
};

function isQueuedStrengthCompletion(
  mutation: QueuedMutation,
): mutation is QueuedMutation & { payload: QueuedStrengthCompletionPayload } {
  return mutation.type === "strength-run-completed" || mutation.type === "updateRun";
}

function isQueuedStrengthSetLog(
  mutation: QueuedMutation,
): mutation is QueuedMutation & { payload: QueuedStrengthSetLogPayload } {
  return mutation.type === "strength-set-log";
}

// §250 — Profile / Records mutations replay (Chantier A sub-§C).
// Payloads stored as the exact arguments of the API functions, so replay is a
// 1-line passthrough. Idempotent operations (PATCH/UPSERT) by design — replay
// after intermittent reconnect produces the same end state.

type QueuedProfileUpdatePayload = Parameters<typeof updateProfile>[0];
type QueuedRecord1rmPayload = Parameters<typeof update1RM>[0];
type QueuedSwimRecordPayload = Parameters<typeof upsertSwimRecord>[0];

function isQueuedProfileUpdate(
  mutation: QueuedMutation,
): mutation is QueuedMutation & { payload: QueuedProfileUpdatePayload } {
  return mutation.type === "profile-update";
}

function isQueuedRecord1rm(
  mutation: QueuedMutation,
): mutation is QueuedMutation & { payload: QueuedRecord1rmPayload } {
  return mutation.type === "record-1rm-update";
}

function isQueuedSwimRecord(
  mutation: QueuedMutation,
): mutation is QueuedMutation & { payload: QueuedSwimRecordPayload } {
  return mutation.type === "swim-record-upsert";
}

// §252 — Sub-§C2 : SuiviSemaine + Administratif mutations replay.
// Same pattern as §251 sub-§C : payload stored as the API function args.

type QueuedPlannedAbsencePayload = { date: string; reason?: string | null };
type QueuedRemovePlannedAbsencePayload = { date: string };
type QueuedCreateShiftPayload = Parameters<typeof createTimesheetShift>[0];
type QueuedUpdateShiftPayload = Parameters<typeof updateTimesheetShift>[0];
type QueuedDeleteShiftPayload = Parameters<typeof deleteTimesheetShift>[0];
type QueuedCreateLocationPayload = Parameters<typeof createTimesheetLocation>[0];
type QueuedDeleteLocationPayload = Parameters<typeof deleteTimesheetLocation>[0];

function isQueuedSetPlannedAbsence(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedPlannedAbsencePayload } {
  return m.type === "set-planned-absence";
}
function isQueuedRemovePlannedAbsence(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedRemovePlannedAbsencePayload } {
  return m.type === "remove-planned-absence";
}
function isQueuedCreateShift(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedCreateShiftPayload } {
  return m.type === "create-shift";
}
function isQueuedUpdateShift(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedUpdateShiftPayload } {
  return m.type === "update-shift";
}
function isQueuedDeleteShift(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedDeleteShiftPayload } {
  return m.type === "delete-shift";
}
function isQueuedCreateLocation(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedCreateLocationPayload } {
  return m.type === "create-location";
}
function isQueuedDeleteLocation(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedDeleteLocationPayload } {
  return m.type === "delete-location";
}

// §262 — Swim session atomic save replay. Payload is the exact `saveSwimSessionAtomic`
// argument; the RPC's DELETE-then-INSERT on swim_exercise_logs makes replay
// idempotent. Falls back internally to the legacy 2-step path if the RPC fails.
type QueuedSwimSessionSavePayload = Parameters<typeof saveSwimSessionAtomic>[0];

function isQueuedSwimSessionSave(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedSwimSessionSavePayload } {
  return m.type === "swim-session-save";
}

// §263 — Avatar upload replay. The Blob is serialised as a data URL
// (`"data:image/png;base64,..."`) at enqueue time (Profile.tsx) so it survives
// localStorage. Replay path : `dataUrlToBlob` → `uploadAvatar(...)`. Storage
// upload uses `upsert: true`, so replaying after the original eventually
// succeeded just overwrites the same path with the same bytes — idempotent.
type QueuedAvatarUploadPayload = {
  userId: number;
  dataUrl: string;
  mimeType: string;
  extension: string;
};

function isQueuedAvatarUpload(
  m: QueuedMutation,
): m is QueuedMutation & { payload: QueuedAvatarUploadPayload } {
  return m.type === "avatar-upload";
}

async function getRemoteRunLogCount(runId: number): Promise<number | null> {
  const { data: run, error: runError } = await supabase
    .from("strength_session_runs")
    .select("id")
    .eq("id", runId)
    .maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) return null;

  const { count, error: logsError } = await supabase
    .from("strength_set_logs")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);
  if (logsError) throw new Error(logsError.message);

  return count ?? 0;
}

async function replayStrengthCompletion(payload: QueuedStrengthCompletionPayload) {
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  const runId = Number(payload.run_id);
  const hasRunId = Number.isFinite(runId) && runId > 0;
  const remoteLogCount = hasRunId ? await getRemoteRunLogCount(runId) : null;

  if (remoteLogCount !== null) {
    const missingLogs = logs.slice(remoteLogCount);

    for (const [index, log] of missingLogs.entries()) {
      await logStrengthSet({
        run_id: runId,
        exercise_id: log.exercise_id,
        set_index: log.set_index ?? log.set_number ?? remoteLogCount + index,
        reps: log.reps ?? null,
        weight: log.weight ?? null,
        rpe: log.rpe ?? null,
        notes: log.notes ?? null,
        difficulty: log.difficulty ?? null,
        athlete_id: payload.athlete_id ?? null,
        athlete_name: payload.athlete_name ?? null,
      });
    }

    await updateStrengthRun({
      ...payload,
      run_id: runId,
      logs: undefined,
    });
    return;
  }

  await saveStrengthRun({
    ...payload,
    run_id: null,
    status: "completed",
    logs,
  });
}

export function OfflineMutationSync() {
  const isOnline = useOnlineStatus();
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const runSync = useCallback(async () => {
    if (!isOnline || !user || !canUseSupabase()) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    await runSyncOnce(async () => {
      let syncedCount = 0;
      let poisonedCount = 0;
      let unsupportedCount = 0;
      const unsupportedTypes = new Set<string>();
      let lastError: unknown = null;

      for (const mutation of queue) {
        // Dispatch by type. Each branch is responsible for its own retry /
        // remove logic; unrecognised types are dropped so the queue does not
        // grow indefinitely from forgotten mutation kinds.
        try {
          if (isQueuedStrengthCompletion(mutation)) {
            await replayStrengthCompletion(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedStrengthSetLog(mutation)) {
            await logStrengthSet(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedProfileUpdate(mutation)) {
            await updateProfile(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedRecord1rm(mutation)) {
            await update1RM(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedSwimRecord(mutation)) {
            await upsertSwimRecord(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          // §252 sub-§C2 — SuiviSemaine + Administratif replay branches.
          if (isQueuedSetPlannedAbsence(mutation)) {
            await setPlannedAbsence(mutation.payload.date, mutation.payload.reason ?? null);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedRemovePlannedAbsence(mutation)) {
            await removePlannedAbsence(mutation.payload.date);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedCreateShift(mutation)) {
            await createTimesheetShift(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedUpdateShift(mutation)) {
            await updateTimesheetShift(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedDeleteShift(mutation)) {
            await deleteTimesheetShift(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedCreateLocation(mutation)) {
            await createTimesheetLocation(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          if (isQueuedDeleteLocation(mutation)) {
            await deleteTimesheetLocation(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          // §262 — Swim session atomic save replay.
          if (isQueuedSwimSessionSave(mutation)) {
            await saveSwimSessionAtomic(mutation.payload);
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          // §263 — Avatar upload replay (data URL → Blob → uploadAvatar).
          if (isQueuedAvatarUpload(mutation)) {
            const { userId, dataUrl, mimeType, extension } = mutation.payload;
            const blob = dataUrlToBlob(dataUrl);
            await uploadAvatar({ userId, blob, mimeType, extension });
            removeQueueItem(mutation.id);
            syncedCount += 1;
            continue;
          }
          // Unrecognised type: typically means the queue was written by a
          // newer build and the swimmer reverted to an older PWA. Track it
          // so we can surface a single user-visible warning instead of the
          // previous silent console.warn — that path lost data without any
          // signal to the swimmer.
          console.warn("[offline-sync] Unsupported queued mutation:", mutation.type);
          unsupportedTypes.add(mutation.type);
          unsupportedCount += 1;
          removeQueueItem(mutation.id);
        } catch (itemError) {
          lastError = itemError;
          console.error(
            `[offline-sync] Replay failed for ${mutation.id} (${mutation.type}):`,
            itemError,
          );
          if (isTransientError(itemError)) {
            // Don't penalize the item — Supabase blip, retry next online tick
            continue;
          }
          const dropped = markRetry(mutation.id);
          if (dropped) poisonedCount += 1;
        }
      }

      if (syncedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["strength_history"] });
        queryClient.invalidateQueries({ queryKey: ["strength_run_in_progress"] });
        queryClient.invalidateQueries({ queryKey: ["assignments"] });
        queryClient.invalidateQueries({ queryKey: ["1rm"] });
        queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
        // §250 — invalidate Profile / Records queries that may have been
        // updated via the offline queue, so the UI reflects the synced state.
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["swim-records"] });
        // §252 sub-§C2 — SuiviSemaine absences + Administratif timesheet.
        queryClient.invalidateQueries({ queryKey: ["my-absences"] });
        queryClient.invalidateQueries({ queryKey: ["swimmer-sessions-week"] });
        queryClient.invalidateQueries({ queryKey: ["timesheet-shifts"] });
        queryClient.invalidateQueries({ queryKey: ["timesheet-locations"] });
        // §262 — invalidate swim session logs queries after atomic save replay.
        queryClient.invalidateQueries({ queryKey: ["swim-exercise-logs-by-catalog"] });
        queryClient.invalidateQueries({ queryKey: ["swim-exercise-logs-history"] });
        // §263 — invalidate hall-of-fame already covered above; profile query
        // re-invalidated here so the new avatar URL surfaces immediately.
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        toast({
          title: "Données synchronisées",
          description: `${syncedCount} mise(s) à jour hors ligne ont été enregistrée(s).`,
        });
      }

      if (poisonedCount > 0) {
        toast({
          title: "Synchronisation partielle",
          description: `${poisonedCount} séance(s) n'ont pas pu être synchronisées après plusieurs tentatives et ont été abandonnées.`,
          variant: "destructive",
        });
      } else if (lastError && syncedCount === 0) {
        toast({
          title: "Synchronisation en attente",
          description: lastError instanceof Error
            ? lastError.message
            : "Impossible de synchroniser les données hors ligne pour le moment.",
          variant: "destructive",
        });
      }

      if (unsupportedCount > 0) {
        // Single toast batched for all unsupported types in this drain.
        // Helps support track down "data lost after PWA downgrade" reports
        // and tells the swimmer something happened — previous silent drop
        // was the worst-of-both: data lost AND no signal.
        toast({
          title: "Données obsolètes ignorées",
          description: `${unsupportedCount} mutation(s) d'un format inconnu (${Array.from(unsupportedTypes).join(", ")}) ont été abandonnées. Mets l'app à jour si le problème persiste.`,
          variant: "destructive",
        });
      }
    });
  }, [isOnline, queryClient, toast, user]);

  // Replay on network/auth state changes (back online, login)
  useEffect(() => {
    void runSync();
  }, [runSync]);

  // Replay immediately when an item is enqueued while already online
  useEffect(() => {
    const handleQueueUpdated = () => { void runSync(); };
    window.addEventListener(QUEUE_UPDATED_EVENT, handleQueueUpdated);
    return () => window.removeEventListener(QUEUE_UPDATED_EVENT, handleQueueUpdated);
  }, [runSync]);

  // Tell the swimmer when items aged out / hit the retry cap and were
  // dropped from the queue. Without this, a session offline-queued before
  // a long trip without network could be silently lost after 7 days
  // (TTL) with no signal — the only trace was a console.warn invisible
  // to the user.
  useEffect(() => {
    const handleReaped = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      if (count <= 0) return;
      toast({
        title: "Données hors-ligne abandonnées",
        description: `${count} mutation(s) trop ancienne(s) ou ayant échoué trop de fois ont été abandonnées. Si tu attendais une synchronisation, ouvre l'app plus régulièrement quand tu retrouves le réseau.`,
        variant: "destructive",
      });
    };
    window.addEventListener(QUEUE_REAPED_EVENT, handleReaped);
    return () => window.removeEventListener(QUEUE_REAPED_EVENT, handleReaped);
  }, [toast]);

  return null;
}

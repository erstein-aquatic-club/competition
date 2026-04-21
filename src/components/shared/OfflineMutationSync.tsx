import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { canUseSupabase } from "@/lib/api/client";
import { getQueue, markRetry, removeQueueItem, QUEUE_UPDATED_EVENT, type QueuedMutation } from "@/lib/offlineQueue";
import { supabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/lib/auth";
import type { SetLogEntry, UpdateStrengthRunInput } from "@/lib/types";

type QueuedStrengthCompletionPayload = UpdateStrengthRunInput & {
  started_at?: string | null;
  athlete_name?: string | null;
  logs?: SetLogEntry[];
};

function isQueuedStrengthCompletion(
  mutation: QueuedMutation,
): mutation is QueuedMutation & { payload: QueuedStrengthCompletionPayload } {
  return mutation.type === "strength-run-completed" || mutation.type === "updateRun";
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
      await api.logStrengthSet({
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

    await api.updateStrengthRun({
      ...payload,
      run_id: runId,
      logs: undefined,
    });
    return;
  }

  await api.saveStrengthRun({
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
  const isSyncingRef = useRef(false);

  const runSync = useCallback(async () => {
    if (!isOnline || !user || !canUseSupabase() || isSyncingRef.current) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    isSyncingRef.current = true;
    let syncedCount = 0;
    let poisonedCount = 0;
    let lastError: unknown = null;

    try {
      for (const mutation of queue) {
        if (!isQueuedStrengthCompletion(mutation)) {
          console.warn("[offline-sync] Unsupported queued mutation:", mutation.type);
          removeQueueItem(mutation.id);
          continue;
        }

        try {
          await replayStrengthCompletion(mutation.payload);
          removeQueueItem(mutation.id);
          syncedCount += 1;
        } catch (itemError) {
          lastError = itemError;
          console.error(
            `[offline-sync] Replay failed for ${mutation.id} (${mutation.type}):`,
            itemError,
          );
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
        toast({
          title: "Données synchronisées",
          description: `${syncedCount} séance(s) hors ligne ont été enregistrée(s).`,
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
    } finally {
      isSyncingRef.current = false;
    }
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

  return null;
}

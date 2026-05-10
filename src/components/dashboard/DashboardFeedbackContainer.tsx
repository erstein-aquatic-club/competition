import React, { useCallback, useState } from "react";
import { haptic } from "@/lib/haptic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteSession,
  syncSession,
  saveSwimExerciseLogs,
  updateSession,
  setPlannedAbsence,
  removePlannedAbsence,
  notifications_mark_read_by_filter,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Session, Assignment, PlannedAbsence } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { FeedbackDrawer } from "./FeedbackDrawer";
import { useFeedbackDraft } from "@/hooks/dashboard/useFeedbackDraft";
import type { PlannedSession } from "@/hooks/dashboard/internal";
import type { ResolvedPlanEntry } from "@/hooks/useStrengthPlanByISO";
import type { SaveState } from "@/components/shared/BottomActionBar";

const INDICATORS = [
  { key: "difficulty" as const },
  { key: "fatigue_end" as const },
  { key: "performance" as const },
  { key: "engagement" as const },
];

function parseSessionId(sessionId: string) {
  const parts = String(sessionId).split("__");
  const rawSlot = parts[1] || "";
  const slotKey = (rawSlot === "AM" || rawSlot === "PM") ? rawSlot : "";
  return { iso: parts[0], slotKey: slotKey as "AM" | "PM" | "", swimmerSlotId: rawSlot.length > 2 ? rawSlot : undefined };
}

function clampToStep(value: number, step: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

interface SessionStatus {
  status: "present" | "absent" | "not_expected";
  expected: boolean;
  expectedByDefault: boolean;
}

interface DashboardFeedbackContainerProps {
  // Drawer state (Dashboard owns)
  drawerOpen: boolean;
  activeSessionId: string | null;
  detailsOpen: boolean;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setDetailsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseDay: () => void;
  onOpenSession: (sessionId: string) => void;

  // Data (Dashboard derives from useDashboardState + queries)
  selectedDate: Date;
  selectedISO: string;
  sessionsForSelectedDay: PlannedSession[];
  otherGroupSessions: PlannedSession[];
  assignments: Assignment[] | undefined;
  selectedDayStatus: { completed: number; total: number; slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean; slotTime?: string }> };
  dayKm: string;
  isPending: boolean;
  logsBySessionId: Record<string, Session>;
  getLogForSession: (sessionId: string) => Session | undefined;
  getSessionStatus: (session: PlannedSession, date: Date) => SessionStatus;
  isAbsent: boolean;
  absenceReason: string | null;
  strengthSessionsForSelectedDay: ResolvedPlanEntry[];
  onOpenStrengthSession: (slotId: string) => void;

  // User context
  user: string | null;
  userId: number | null;

  // From useDashboardState — state mutators handed down
  setAttendanceOverrideBySessionId: React.Dispatch<React.SetStateAction<Record<string, "absent" | "present">>>;
  stableDurationMin: number;
}

/**
 * §216 — Conteneur memo qui héberge le write-path du dashboard nageur :
 *   - draft de feedback (useFeedbackDraft) — keystrokes locaux
 *   - 5 mutations (delete/sync/update/setAbsence/removeAbsence)
 *   - saveState + alternativeOverride
 *   - les handlers markAbsent/markPresent/clearOverride/saveFeedback
 *
 * Découple les re-renders d'écriture de l'orchestrateur Dashboard et du
 * calendrier (DashboardCalendar) qui ne doivent pas re-rendre par keystroke.
 */
export const DashboardFeedbackContainer = React.memo(function DashboardFeedbackContainer({
  drawerOpen,
  activeSessionId,
  detailsOpen,
  setActiveSessionId,
  setDetailsOpen,
  setDrawerOpen,
  onCloseDay,
  onOpenSession,
  selectedDate,
  selectedISO,
  sessionsForSelectedDay,
  otherGroupSessions,
  assignments,
  selectedDayStatus,
  dayKm,
  isPending,
  logsBySessionId,
  getLogForSession,
  getSessionStatus,
  isAbsent,
  absenceReason,
  strengthSessionsForSelectedDay,
  onOpenStrengthSession,
  user,
  userId,
  setAttendanceOverrideBySessionId,
  stableDurationMin,
}: DashboardFeedbackContainerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, startTransition] = React.useTransition();

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [alternativeOverride, setAlternativeOverride] = useState<{
    sessionId: string;
    assignmentId: number;
    title: string;
    km: number | null;
  } | null>(null);

  const { draftState, setDraftState } = useFeedbackDraft({
    activeSessionId,
    sessionsForSelectedDay,
    otherGroupSessions,
    assignments,
    getLogForSession,
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: number) => deleteSession(sessionId),
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      toast({ title: "Séance supprimée", description: "La saisie a été supprimée." });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de supprimer la séance.", variant: "destructive" });
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: Omit<Session, "id" | "created_at"> & { _exerciseLogs?: import("@/lib/api").SwimExerciseLogInput[] }) => {
      const { _exerciseLogs, ...sessionData } = data;
      const result = await syncSession({ ...sessionData, athlete_name: user!, athlete_id: userId ?? undefined });
      // Save exercise logs if any
      if (_exerciseLogs && _exerciseLogs.length > 0 && result.sessionId) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          const authUid = authData.session?.user?.id;
          if (authUid) {
            await saveSwimExerciseLogs(result.sessionId, authUid, _exerciseLogs);
          }
        } catch (e) {
          console.warn("[EAC] Failed to save exercise logs:", e);
        }
      }
      // §235 — ressenti enregistré : on marque lues les rappels « Séance terminée ? »
      // que le cron envoie en fin de séance. Non-bloquant.
      if (userId) {
        try {
          await notifications_mark_read_by_filter({
            userId,
            type: "assignment",
            titleContains: "Séance terminée",
          });
        } catch (err) {
          console.warn("[EAC] Failed to mark session-feedback notifications as read:", err);
        }
      }
      return result;
    },
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-home"] });
      toast({ title: "Séance enregistrée", description: "Vos données ont été synchronisées." });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      setTimeout(() => {
        setDrawerOpen(false);
        setActiveSessionId(null);
        setDetailsOpen(false);
        setAlternativeOverride(null);
      }, 1200);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'enregistrer la séance.", variant: "destructive" });
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Session & { _exerciseLogs?: import("@/lib/api").SwimExerciseLogInput[] }) => {
      const { _exerciseLogs, ...sessionData } = data;
      const result = await updateSession(sessionData);
      // Save exercise logs if any
      if (_exerciseLogs && sessionData.id) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          const authUid = authData.session?.user?.id;
          if (authUid) {
            await saveSwimExerciseLogs(sessionData.id, authUid, _exerciseLogs);
          }
        } catch (e) {
          console.error("[EAC] Failed to save exercise logs:", e);
          throw e; // Re-throw to show error to user
        }
      }
      // §235 — idem mutation principale : auto-mark des rappels « Séance terminée ? ».
      if (userId) {
        try {
          await notifications_mark_read_by_filter({
            userId,
            type: "assignment",
            titleContains: "Séance terminée",
          });
        } catch (err) {
          console.warn("[EAC] Failed to mark session-feedback notifications as read:", err);
        }
      }
      return result;
    },
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-home"] });
      toast({ title: "Séance mise à jour", description: "Votre saisie a été mise à jour." });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      setTimeout(() => {
        setDrawerOpen(false);
        setActiveSessionId(null);
        setDetailsOpen(false);
        setAlternativeOverride(null);
      }, 1200);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour la séance.", variant: "destructive" });
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const absenceMutation = useMutation({
    mutationFn: ({ date, reason }: { date: string; reason?: string }) =>
      setPlannedAbsence(date, reason),
    onMutate: async ({ date, reason }) => {
      await queryClient.cancelQueries({ queryKey: ["my-planned-absences"] });
      const previous = queryClient.getQueryData<PlannedAbsence[]>(["my-planned-absences"]);
      queryClient.setQueryData<PlannedAbsence[]>(["my-planned-absences"], (old) => [
        ...(old ?? []),
        { date, reason: reason ?? null } as PlannedAbsence,
      ]);
      return { previous };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-planned-absences"] });
      void queryClient.invalidateQueries({ queryKey: ["swimmer-sessions-week"] });
      toast({ title: "Jour marqué indisponible" });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["my-planned-absences"], context.previous);
      toast({ title: "Erreur", description: "Impossible de marquer ce jour indisponible.", variant: "destructive" });
    },
  });

  const removeAbsenceMutation = useMutation({
    mutationFn: (date: string) => removePlannedAbsence(date),
    onMutate: async (date) => {
      await queryClient.cancelQueries({ queryKey: ["my-planned-absences"] });
      const previous = queryClient.getQueryData<PlannedAbsence[]>(["my-planned-absences"]);
      queryClient.setQueryData<PlannedAbsence[]>(["my-planned-absences"], (old) =>
        (old ?? []).filter((a) => a.date !== date),
      );
      return { previous };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-planned-absences"] });
      void queryClient.invalidateQueries({ queryKey: ["swimmer-sessions-week"] });
      toast({ title: "Disponibilité restaurée" });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["my-planned-absences"], context.previous);
      toast({ title: "Erreur", description: "Impossible de restaurer la disponibilité.", variant: "destructive" });
    },
  });

  const markAbsent = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setAttendanceOverrideBySessionId((prev) => ({ ...prev, [sessionId]: "absent" }));
      });

      const existing = getLogForSession(sessionId);
      if (existing?.id) deleteMutation.mutate(Number(existing.id));
    },
    [deleteMutation, getLogForSession, startTransition, setAttendanceOverrideBySessionId]
  );

  const markPresent = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setAttendanceOverrideBySessionId((prev) => ({ ...prev, [sessionId]: "present" }));
      });
    },
    [startTransition, setAttendanceOverrideBySessionId]
  );

  const clearOverride = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setAttendanceOverrideBySessionId((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      });
    },
    [startTransition, setAttendanceOverrideBySessionId]
  );

  const saveFeedback = useCallback(() => {
    if (!activeSessionId) return;
    if (!user) return;

    const allFilled = INDICATORS.every((i) => Number.isInteger(draftState[i.key]));
    if (!allFilled) return;

    const { iso, slotKey: parsedSlotKey } = parseSessionId(activeSessionId);
    // For new swimmer-slot IDs, look up the active session to get the actual slotKey (AM/PM)
    const activeSession = sessionsForSelectedDay.find((s) => s.id === activeSessionId)
      ?? otherGroupSessions.find((s) => s.id === activeSessionId);
    const effectiveSlotKey = parsedSlotKey || activeSession?.slotKey || "AM";
    const slotLabel = effectiveSlotKey === "PM" ? "Soir" : "Matin";

    const distance = clampToStep(Number(draftState.distanceMeters ?? 0), 100);
    const duration = clampToStep(Number(stableDurationMin), 15);

    const strokeDistances: Record<string, number> = {};
    for (const [key, val] of Object.entries(draftState.strokes)) {
      const n = Number(val);
      if (n > 0) strokeDistances[key] = n;
    }

    const payload = {
      date: iso,
      slot: slotLabel,
      distance,
      duration,
      effort: Number(draftState.difficulty),
      feeling: Number(draftState.fatigue_end),
      performance: Number(draftState.performance),
      engagement: Number(draftState.engagement),
      comments: String(draftState.comment || "").slice(0, 400),
      athlete_name: user!,
      athlete_id: userId ?? undefined,
      stroke_distances: Object.keys(strokeDistances).length > 0 ? strokeDistances : null,
      assignment_id: alternativeOverride?.sessionId === activeSessionId
        ? alternativeOverride.assignmentId
        : activeSession?.assignmentId ?? null,
    };

    const existing = getLogForSession(activeSessionId);

    // For updates, preserve the original assignment_id from the saved log
    // (unless swimmer explicitly picked an alternative)
    if (existing?.id && existing.assignment_id != null && !alternativeOverride) {
      payload.assignment_id = existing.assignment_id;
    }

    startTransition(() => {
      setAttendanceOverrideBySessionId((prev) => ({ ...prev, [activeSessionId]: "present" }));
    });

    if (existing?.id) {
      updateMutation.mutate({
        ...payload,
        id: existing.id,
        created_at: existing.created_at ?? new Date().toISOString(),
        _exerciseLogs: draftState.exerciseLogs.length > 0 ? draftState.exerciseLogs : []
      });
    } else {
      mutation.mutate({ ...payload, _exerciseLogs: draftState.exerciseLogs.length > 0 ? draftState.exerciseLogs : undefined });
    }
    // Drawer / session close is handled by mutation.onSuccess (with a 1.2s
    // delay so the success toast lands). Closing here would also fire on
    // mutation error → the swimmer would lose the drawer context with only
    // an error toast as feedback.
  }, [activeSessionId, user, userId, draftState, stableDurationMin, sessionsForSelectedDay, otherGroupSessions, getLogForSession, startTransition, updateMutation, mutation, setAttendanceOverrideBySessionId, alternativeOverride]);

  return (
    <FeedbackDrawer
      open={drawerOpen}
      selectedDate={selectedDate}
      sessionsForSelectedDay={sessionsForSelectedDay}
      otherGroupSessions={otherGroupSessions}
      selectedDayStatus={selectedDayStatus}
      dayKm={dayKm}
      activeSessionId={activeSessionId}
      detailsOpen={detailsOpen}
      draftState={draftState}
      saveState={saveState}
      isPending={isPending}
      logsBySessionId={logsBySessionId}
      getLogForSession={getLogForSession}
      onClose={onCloseDay}
      onOpenSession={onOpenSession}
      onCloseSession={() => {
        setActiveSessionId(null);
        setDetailsOpen(false);
      }}
      onToggleDetails={() => setDetailsOpen((v) => !v)}
      onMarkAbsent={markAbsent}
      onMarkPresent={markPresent}
      onClearOverride={clearOverride}
      onSaveFeedback={saveFeedback}
      onDeleteFeedback={(sessionId) => {
        const existing = getLogForSession(sessionId);
        if (existing?.id) {
          deleteMutation.mutate(Number(existing.id));
          setActiveSessionId(null);
          setDetailsOpen(false);
          setTimeout(() => {
            setDrawerOpen(false);
          }, 400);
        }
      }}
      onDraftStateChange={setDraftState}
      getSessionStatus={getSessionStatus}
      isAbsent={isAbsent}
      absenceReason={absenceReason}
      onMarkDayAbsent={(reason) => absenceMutation.mutate({ date: selectedISO, reason })}
      onRemoveDayAbsence={() => removeAbsenceMutation.mutate(selectedISO)}
      onSwitchAlternative={(sessionId, assignmentId, title, km) => {
        setAlternativeOverride({ sessionId, assignmentId, title, km });
        onOpenSession(sessionId);
      }}
      alternativeOverrideTitle={
        alternativeOverride?.sessionId === activeSessionId
          ? alternativeOverride.title
          : null
      }
      strengthSessionsForSelectedDay={strengthSessionsForSelectedDay}
      onOpenStrengthSession={onOpenStrengthSession}
    />
  );
});

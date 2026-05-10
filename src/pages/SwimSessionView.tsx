import { useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, AlertCircle, Share2, Save, Loader2, Plus, Trash2, FileDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SwimSessionTimeline } from "@/components/swim/SwimSessionTimeline";
import { ExerciseLogInline } from "@/components/swim/ExerciseLogInline";
import {
  Assignment,
  SwimSessionItem,
  getAssignments,
  getSessions,
  getSwimExerciseLogs,
  saveSwimSessionAtomic,
  assignments_delete,
} from "@/lib/api";
import type { SwimExerciseLog, SwimExerciseLogInput } from "@/lib/api";
import { tryWithOfflineQueue, isOfflineQueuedResult } from "@/lib/offlineQueue";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { generateShareToken, getSwimSessionById } from "@/lib/api/swim";
import { supabase } from "@/lib/supabase";
import { ShareMenu } from "@/components/shared/ShareMenu";

const statusLabels: Record<string, string> = {
  assigned: "Assignée",
  pending: "Assignée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

const formatAssignedDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : format(parsed, "dd MMM", { locale: fr });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLogsMap(logs: SwimExerciseLog[]): Map<number, SwimExerciseLogInput> {
  const map = new Map<number, SwimExerciseLogInput>();
  for (const log of logs) {
    if (log.source_item_id == null) continue;
    map.set(log.source_item_id, {
      exercise_label: log.exercise_label,
      source_item_id: log.source_item_id,
      split_times: log.split_times,
      tempo: log.tempo,
      stroke_count: log.stroke_count,
      notes: log.notes,
    });
  }
  return map;
}

function inferSlot(assignedDate?: string | null): string {
  if (!assignedDate) return "Matin";
  const d = new Date(assignedDate);
  return d.getHours() >= 14 ? "Soir" : "Matin";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SwimSessionView() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Edit mode state
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [localLogs, setLocalLogs] = useState<Map<number, SwimExerciseLogInput> | null>(null);
  const [dirty, setDirty] = useState(false);

  // Manual mode state (no assignment)
  const [manualExercises, setManualExercises] = useState<
    { id: number; label: string; reps: number; log: SwimExerciseLogInput }[]
  >([]);
  const [manualLabel, setManualLabel] = useState("");
  const [manualReps, setManualReps] = useState(1);
  const [manualExpandedId, setManualExpandedId] = useState<number | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  const assignmentId = useMemo(() => {
    // Read from window.location.hash because the hash-based router
    // strips query params from the location value returned by useLocation()
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return null;
    const params = new URLSearchParams(hash.slice(qIdx));
    const id = params.get("assignmentId");
    const parsed = id ? Number(id) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const { data: assignments, isLoading, error, refetch } = useQuery({
    queryKey: ["assignments", user],
    queryFn: () => getAssignments(user!, userId),
    enabled: !!user,
  });

  type SwimAssignment = Assignment & { session_type: "swim"; items?: SwimSessionItem[] };
  const swimAssignments = assignments?.filter(
    (assignment): assignment is SwimAssignment => assignment.session_type === "swim",
  ) || [];
  const assignment = assignmentId
    ? swimAssignments.find((item) => item.id === assignmentId)
    : undefined;

  const sessionCatalogId = assignment?.session_id;

  // Load existing exercise logs
  const { data: existingLogs } = useQuery({
    queryKey: ["swim-exercise-logs-by-catalog", sessionCatalogId, userId],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getSession();
      const authUid = authData.session?.user?.id;
      if (!authUid) return [];
      const sessions = await getSessions(user!, userId);
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length === 0) return [];
      const allLogs: SwimExerciseLog[] = [];
      for (const sid of sessionIds.slice(0, 10)) {
        const logs = await getSwimExerciseLogs(sid);
        allLogs.push(...logs.filter((l) => l.user_id === authUid));
      }
      const itemIds = new Set(
        (assignment?.items ?? []).map((i) => i.id).filter(Boolean) as number[],
      );
      return allLogs.filter(
        (l) => l.source_item_id != null && itemIds.has(l.source_item_id),
      );
    },
    enabled: !!sessionCatalogId && !!userId && !!user,
  });

  // Merged logs map: local edits override DB data
  const logsMap = useMemo(() => {
    if (localLogs) return localLogs;
    if (!existingLogs) return new Map<number, SwimExerciseLogInput>();
    return buildLogsMap(existingLogs);
  }, [localLogs, existingLogs]);

  const handleToggleExpand = useCallback((itemId: number) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  const handleLogChange = useCallback(
    (itemId: number, log: SwimExerciseLogInput) => {
      setLocalLogs((prev) => {
        const next = new Map(prev ?? logsMap);
        next.set(itemId, log);
        return next;
      });
      setDirty(true);
    },
    [logsMap],
  );

  // -- Manual mode handlers ---------------------------------------------------

  const addManualExercise = useCallback(() => {
    const label = manualLabel.trim();
    if (!label) return;
    const id = Date.now();
    setManualExercises((prev) => [
      ...prev,
      {
        id,
        label,
        reps: manualReps,
        log: { exercise_label: label, split_times: [], stroke_count: [], tempo: null, notes: null },
      },
    ]);
    setManualLabel("");
    setManualReps(1);
    setManualExpandedId(id);
    setDirty(true);
  }, [manualLabel, manualReps]);

  const removeManualExercise = useCallback((id: number) => {
    setManualExercises((prev) => prev.filter((e) => e.id !== id));
    setDirty(true);
  }, []);

  const updateManualLog = useCallback((id: number, log: SwimExerciseLogInput) => {
    setManualExercises((prev) =>
      prev.map((e) => (e.id === id ? { ...e, log } : e)),
    );
    setDirty(true);
  }, []);

  // §262 — Atomic save via RPC `save_swim_session_atomic` (1 round-trip,
  // transactional). Wrapped in `tryWithOfflineQueue` so the whole session save
  // survives offline / transient network failures (§251 pattern). Replays at
  // OfflineMutationSync.
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié");

      const date = assignment?.assigned_date
        ? new Date(assignment.assigned_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const slot = inferSlot(assignment?.assigned_date);

      // Collect logs from assignment mode or manual mode.
      const allLogs: SwimExerciseLogInput[] = [];

      if (assignment) {
        for (const [, log] of logsMap) {
          const hasSplits = (log.split_times ?? []).some((s) => s.time_seconds > 0);
          const hasStrokes = (log.stroke_count ?? []).some((s) => s.count > 0);
          const hasData = hasSplits || hasStrokes || log.tempo != null || (log.notes?.trim());
          if (hasData) allLogs.push(log);
        }
      } else {
        for (const ex of manualExercises) {
          const log = ex.log;
          const hasSplits = (log.split_times ?? []).some((s) => s.time_seconds > 0);
          const hasStrokes = (log.stroke_count ?? []).some((s) => s.count > 0);
          const hasData = hasSplits || hasStrokes || log.tempo != null || (log.notes?.trim());
          if (hasData) allLogs.push({ ...log, exercise_label: ex.label });
        }
      }

      if (allLogs.length === 0) throw new Error("Aucune donnée à sauvegarder");

      const payload = {
        athleteName: user,
        athleteId: userId,
        date,
        slot,
        logs: allLogs,
      };

      return tryWithOfflineQueue(
        "swim-session-save",
        payload,
        () => saveSwimSessionAtomic(payload),
      );
    },
    onSuccess: (result) => {
      setDirty(false);
      if (!assignment) setManualExercises([]);
      queryClient.invalidateQueries({ queryKey: ["swim-exercise-logs-by-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["swim-exercise-logs-history"] });
      if (isOfflineQueuedResult(result)) {
        toast({
          title: "Sauvegarde en attente",
          description: "Sera synchronisée au retour en ligne.",
        });
      } else {
        toast({ title: "Notes techniques sauvegardées" });
      }
    },
    onError: (err) => {
      toast({
        title: "Erreur",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number) => assignments_delete(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast({ title: "Séance retirée", description: "La séance a été retirée de votre feed." });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de retirer la séance.", variant: "destructive" });
    },
  });

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (!assignment) return;
    setExportingPdf(true);
    try {
      const session = await queryClient.fetchQuery({
        queryKey: ["swim-session-preview", assignment.session_id],
        queryFn: () => getSwimSessionById(assignment.session_id),
        staleTime: 5 * 60 * 1000,
      });
      if (!session) throw new Error("Séance introuvable");
      const dateOnly = (assignment.assigned_date ?? "").slice(0, 10);
      const slotLabel =
        assignment.assigned_slot === "morning"
          ? "Matin"
          : assignment.assigned_slot === "evening"
            ? "Soir"
            : null;
      const dateSlug = dateOnly.replaceAll("-", "");
      const { exportSessionPdf } = await import("@/lib/export-session-pdf");
      await exportSessionPdf(session, {
        date: dateOnly,
        timeRange: slotLabel,
        filenameSlug: `seance-${dateSlug}`,
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de générer le PDF.",
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  }, [assignment, queryClient, toast]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            aria-label="Retour à l'accueil"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Séance natation</div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Détails</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {assignment ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              aria-label="Télécharger la séance en PDF"
            >
              {exportingPdf ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileDown className="h-5 w-5" />
              )}
            </Button>
          ) : null}
          {assignment ? (
            <ShareMenu
              onOpen={async () => {
                const token = await generateShareToken(assignment.session_id);
                const url = `${window.location.origin}${window.location.pathname}#/s/${token}`;
                return { url, title: assignment.title };
              }}
              trigger={
                <Button variant="ghost" size="icon" aria-label="Partager la séance">
                  <Share2 className="h-5 w-5" />
                </Button>
              }
            />
          ) : null}
          {assignment ? (
            <Badge variant="secondary" className="text-xs">
              {statusLabels[assignment.status] ?? "Assignée"}
            </Badge>
          ) : null}
        </div>
      </div>

      <Card className="border border-border shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-tight">
              {assignment?.title ?? "Détails techniques libres"}
            </div>
            {!assignment && !isLoading ? (
              <p className="text-sm text-muted-foreground">Saisissez vos exercices et détails techniques manuellement.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline" className="text-xs">
              {assignment ? formatAssignedDate(assignment.assigned_date) : format(new Date(), "dd MMM", { locale: fr })}
            </Badge>
            {assignment ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRemoveConfirmOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Retirer de mon feed
              </Button>
            ) : null}
          </div>
          <Separator />

          {/* Instruction text */}
          {!isLoading ? (
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {assignment
                ? "Tapez sur un exercice pour ajouter vos temps et détails techniques."
                : "Ajoutez vos exercices manuellement et renseignez vos détails techniques."}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-4" aria-live="polite" aria-busy="true">
              <div className="sr-only">Chargement de la séance...</div>
              <Skeleton className="h-6 w-48" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`skeleton-${i}`} className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          ) : assignment ? (
            <SwimSessionTimeline
              title={assignment.title}
              description={assignment.description}
              items={assignment.items}
              showHeader={true}
              exerciseLogs={logsMap}
              expandedItemId={expandedItemId}
              onToggleExpand={handleToggleExpand}
              onLogChange={handleLogChange}
            />
          ) : (
            <div className="space-y-4">
              {/* Add exercise form */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Exercice</label>
                  <input
                    type="text"
                    placeholder="ex: 6x50m crawl"
                    value={manualLabel}
                    onChange={(e) => setManualLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addManualExercise(); }}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="w-16 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Reps</label>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={manualReps}
                    onChange={(e) => setManualReps(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={addManualExercise}
                  disabled={!manualLabel.trim()}
                  className="h-11 gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </div>

              {/* Manual exercises list */}
              {manualExercises.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-muted/70 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  Ajoutez un exercice ci-dessus pour commencer.
                </div>
              ) : (
                <div className="space-y-2">
                  {manualExercises.map((ex) => {
                    const isExpanded = manualExpandedId === ex.id;
                    const fakeItem: SwimSessionItem = {
                      label: ex.label,
                      raw_payload: { exercise_repetitions: ex.reps },
                    };
                    return (
                      <div key={ex.id} className="rounded-xl border border-border overflow-hidden">
                        <div
                          className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/40"
                          onClick={() => setManualExpandedId(isExpanded ? null : ex.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{ex.label}</span>
                            <span className="text-xs text-muted-foreground">{ex.reps} rep{ex.reps > 1 ? "s" : ""}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeManualExercise(ex.id); }}
                            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {isExpanded && (
                          <ExerciseLogInline
                            item={fakeItem}
                            log={ex.log}
                            onChange={(log) => updateManualLog(ex.id, log)}
                            onCollapse={() => setManualExpandedId(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky save button */}
      {dirty && (
        <div className="fixed left-0 right-0 flex justify-center z-50 px-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2 shadow-lg"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      )}

      {/* §198 QW2 — AlertDialog Radix au lieu de window.confirm (UX iOS-aligned). */}
      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette séance de votre feed ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous pourrez toujours la retrouver via votre coach si besoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (assignment) deleteAssignmentMutation.mutate(assignment.id);
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

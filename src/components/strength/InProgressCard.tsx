import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  StrengthCycleType,
  StrengthSessionTemplate,
  Assignment,
  deleteStrengthRun as deleteStrengthRunApi,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { orderStrengthItems } from "@/components/strength/utils";
import { SaveState } from "@/components/shared/BottomActionBar";
import type { LocalStrengthRun } from "@/lib/types";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

interface InProgressCardProps {
  inProgressRun: LocalStrengthRun;
  inProgressAssignment: Assignment | null;
  inProgressSession: StrengthSessionTemplate | null;
  canResumeInProgress: boolean;
  user: string | null;
  athleteKey: number | string | null;
  setSaveState: (state: SaveState) => void;
  onResumeInProgress: (params: {
    assignment: Assignment | null;
    session: StrengthSessionTemplate | null;
    runId: number;
    logs: any[];
    progressPct: number;
  }) => void;
}

export function InProgressCard({
  inProgressRun,
  inProgressAssignment,
  inProgressSession,
  canResumeInProgress,
  user,
  athleteKey,
  setSaveState,
  onResumeInProgress,
}: InProgressCardProps) {
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteRunId, setPendingDeleteRunId] = useState<number | null>(null);

  const inProgressRunCompleted =
    inProgressRun.status === "completed" || (inProgressRun.progress_pct ?? 0) >= 100;

  const deleteStrengthRun = useMutation({
    mutationFn: (runId: number) => deleteStrengthRunApi(runId),
    onMutate: () => {
      setSaveState("saving");
    },
    onSuccess: (data) => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      queryClient.invalidateQueries({ queryKey: ["strength_run_in_progress", athleteKey] });
      queryClient.invalidateQueries({ queryKey: ["strength_history"] });
      queryClient.invalidateQueries({ queryKey: ["assignments", user, "strength"] });
      const fallbackMessage =
        data?.source === "local"
          ? "Suppression locale : le serveur n'est pas disponible."
          : undefined;
      toast("Séance supprimée", { description: fallbackMessage });
    },
    onError: () => {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      toast.error("Erreur", { description: "Impossible de supprimer la séance en cours." });
    },
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="rounded-xl bg-primary text-primary-foreground p-3.5 shadow-sm"
      >
        {/* Header line */}
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2 shrink-0">
            {!inProgressRunCompleted && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <span className="text-[13px] font-bold truncate flex-1">
            {inProgressAssignment?.title ?? inProgressSession?.title ?? "Séance en cours"}
          </span>
          <span className="text-[11px] text-white/60 shrink-0">
            {format(new Date(inProgressRun.started_at || new Date()), "dd MMM", { locale: fr })}
          </span>
        </div>

        {/* Progress bar — compact */}
        <div className="mb-3">
          <div className="h-1 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${inProgressRun.progress_pct ?? 0}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-[10px] text-white/50 font-semibold mt-1 tabular-nums">
            {Math.round(inProgressRun.progress_pct ?? 0)}% complété
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 h-10 rounded-xl bg-white text-primary font-bold text-[13px] hover:bg-white/90 shadow-none"
            disabled={!canResumeInProgress}
            onClick={() => {
              const source = inProgressAssignment ?? inProgressSession;
              if (!source) return;
              const sessionItems = (inProgressAssignment?.items ?? inProgressSession?.items) ?? [];
              const strengthItems = sessionItems.filter((item): item is any => 'exercise_id' in item);
              const cycle = normalizeStrengthCycle(
                (inProgressAssignment?.cycle ?? inProgressSession?.cycle) ??
                  strengthItems.find((item) => item.cycle_type)?.cycle_type
              );
              const filteredItems = strengthItems.filter((item) => item.cycle_type === cycle);
              const items = orderStrengthItems(filteredItems.length ? filteredItems : strengthItems);

              onResumeInProgress({
                assignment: inProgressAssignment ?? null,
                session: {
                  ...source,
                  title: source.title,
                  description: source.description ?? null,
                  cycle,
                  items,
                },
                runId: inProgressRun.id,
                logs: inProgressRun.logs ?? [],
                progressPct: inProgressRun.progress_pct ?? 0,
              });
            }}
          >
            {inProgressRunCompleted ? "Voir le résumé" : "Reprendre"}
          </Button>
          {!inProgressRunCompleted && (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
              disabled={deleteStrengthRun.isPending}
              onClick={() => {
                setPendingDeleteRunId(inProgressRun.id);
                setDeleteConfirmOpen(true);
              }}
              aria-label="Supprimer la séance"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les séries déjà enregistrées seront perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteRunId) deleteStrengthRun.mutate(pendingDeleteRunId);
                setDeleteConfirmOpen(false);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getChronoRecords, deleteChronoRecord, updateChronoRecord } from "../../lib/api/chrono-records";
import { createStandaloneSwimLog } from "../../lib/api/swim-logs";
import { supabase } from "../../lib/supabase";
import type { ChronoRecord, ChronoRecordSwimmer, SwimExerciseLogInput } from "../../lib/api/types";
import ChronoSplitEditor from "../../components/chrono/ChronoSplitEditor";
import { Button } from "../../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Trash2, Timer } from "lucide-react";
import { toast } from "sonner";
import CoachBreadcrumb from "../../components/shared/CoachBreadcrumb";

interface Props {
  onBack: () => void;
}

/** Resolve public.users integer ID → auth.users UUID */
async function resolveAuthUid(athleteId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_auth_uid_for_user", {
    p_user_id: athleteId,
  });
  if (error) return null;
  return data as string | null;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function CoachChronoHistoryScreen({ onBack }: Props) {
  const queryClient = useQueryClient();
  const [selectedRecord, setSelectedRecord] = useState<ChronoRecord | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["chrono_records"],
    queryFn: getChronoRecords,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChronoRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
      toast.success("Chrono supprimé");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  // --- Mutation handlers for ChronoSplitEditor ---

  const handleUpdate = async (swimmers: ChronoRecordSwimmer[]) => {
    if (!selectedRecord) return;
    await updateChronoRecord(selectedRecord.id, { swimmers });
    queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
    setSelectedRecord({ ...selectedRecord, swimmers });
  };

  const handleSend = async (swimmerIdx?: number) => {
    if (!selectedRecord) return;
    const swimmers =
      swimmerIdx !== undefined
        ? [selectedRecord.swimmers[swimmerIdx]]
        : selectedRecord.swimmers;

    for (const sw of swimmers) {
      const authUid = await resolveAuthUid(sw.athleteId);
      if (!authUid) {
        toast.error(`UUID introuvable pour ${sw.displayName}`);
        continue;
      }
      // Flatten all reps into split_times
      const splitTimes: { rep: number; time_seconds: number }[] = [];
      let idx = 1;
      for (const rep of sw.splitsByRep) {
        for (const s of rep) {
          splitTimes.push({ rep: idx++, time_seconds: s.cumulativeMs / 1000 });
        }
      }
      const log: SwimExerciseLogInput = {
        exercise_label: "Chrono coach",
        split_times: splitTimes,
        notes: `Série chrono — Ligne ${sw.lane}`,
      };
      await createStandaloneSwimLog(authUid, log);
    }

    // Mark record as sent
    await updateChronoRecord(selectedRecord.id, { status: "sent" });
    queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
    setSelectedRecord({ ...selectedRecord, status: "sent" });
    toast.success(
      `Envoyé à ${swimmers.length} nageur${swimmers.length > 1 ? "s" : ""}`,
    );
  };

  const handleDeleteFromEditor = async () => {
    if (!selectedRecord) return;
    await deleteChronoRecord(selectedRecord.id);
    queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
    setSelectedRecord(null);
    toast.success("Chrono supprimé");
  };

  const breadcrumbSegments = useMemo(
    () => [
      { label: 'Chrono', href: '#/coach?section=chrono' },
      { label: 'Historique' },
    ],
    [],
  );

  // --- Editor view ---

  if (selectedRecord) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRecord(null)}
          >
            ← Retour
          </Button>
          <h2 className="text-lg font-semibold">
            {selectedRecord.label || "Chrono"}
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              selectedRecord.status === "draft"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-green-500/15 text-green-600 dark:text-green-400"
            }`}
          >
            {selectedRecord.status === "draft" ? "Brouillon" : "Envoyé"}
          </span>
        </div>
        <ChronoSplitEditor
          record={selectedRecord}
          onUpdate={handleUpdate}
          onSend={handleSend}
          onDelete={handleDeleteFromEditor}
          readOnly={selectedRecord.status === "sent"}
        />
      </div>
    );
  }

  // --- List view ---

  return (
    <div className="flex flex-col gap-4">
      <CoachBreadcrumb segments={breadcrumbSegments} />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Retour
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Chargement…
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Timer className="h-10 w-10 opacity-40" />
          <p className="text-sm font-medium">Aucun chrono enregistré</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRecord(r)}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted active:scale-[0.98]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {r.label || "Chrono"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === "draft"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-green-500/15 text-green-600 dark:text-green-400"
                    }`}
                  >
                    {r.status === "draft" ? "Brouillon" : "Envoyé"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{relativeDate(r.created_at)}</span>
                  <span>·</span>
                  <span>
                    {r.swimmers.length} nageur
                    {r.swimmers.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              {r.status === "draft" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Supprimer ce chrono ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(r.id)}
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

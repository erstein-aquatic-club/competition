import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getChronoRecords, deleteChronoRecord } from "../../lib/api/chrono-records";
import type { ChronoRecord } from "../../lib/api/types";
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

interface Props {
  onSelect: (record: ChronoRecord) => void;
  onBack: () => void;
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

export default function CoachChronoHistoryScreen({ onSelect, onBack }: Props) {
  const queryClient = useQueryClient();

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

  return (
    <div className="flex flex-col gap-4">
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
              onClick={() => onSelect(r)}
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

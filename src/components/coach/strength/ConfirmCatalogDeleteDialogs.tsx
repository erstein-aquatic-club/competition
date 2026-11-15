import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getExerciseUsage, getStrengthSessionUsage } from "@/lib/api";
import {
  exerciseUsageText,
  isExerciseInUse,
  sessionUsageText,
} from "@/lib/strength/exerciseArchive";

/**
 * §394 (audit muscu 2ᵉ passe, R3/O1) — confirmations de suppression du catalogue.
 *
 * Exercice : supprimer un exo utilisé effaçait en cascade les séries et 1RM de
 * tous les nageurs. On vérifie d'abord ses usages : utilisé → seul l'archivage
 * est proposé ; jamais utilisé → suppression définitive. Usages inconnus
 * (chargement / échec réseau) → aucune action destructrice.
 *
 * Séance : la suppression reste possible mais vide les créneaux de planification
 * et cases de plans qui la référencent — on l'annonce avant.
 */

const destructive = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

function UsageCheckFailed({
  onRetry,
  retrying,
  feminine = false,
}: {
  onRetry: () => void;
  retrying: boolean;
  feminine?: boolean;
}) {
  return (
    <span className="mt-2 flex flex-col items-start gap-2">
      <span>Impossible de vérifier où {feminine ? "elle est utilisée" : "il est utilisé"}. Rien n'est supprimé. Vérifie ta connexion, puis réessaie.</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="rounded-xl">
        <RotateCcw className={cn("mr-1.5 h-4 w-4", retrying && "animate-spin motion-reduce:animate-none")} />
        {retrying ? "Vérification…" : "Réessayer"}
      </Button>
    </span>
  );
}

function Checking() {
  return (
    <span className="mt-2 flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      Vérification des usages…
    </span>
  );
}

interface ConfirmExerciseDeleteDialogProps {
  exercise: { id: number; nom_exercice: string } | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: number) => void;
  onArchive: (id: number) => void;
}

export function ConfirmExerciseDeleteDialog({
  exercise,
  onOpenChange,
  onDelete,
  onArchive,
}: ConfirmExerciseDeleteDialogProps) {
  const usageQ = useQuery({
    queryKey: ["exercise-usage", exercise?.id],
    queryFn: () => getExerciseUsage(exercise!.id),
    enabled: exercise != null,
    staleTime: 0,
  });
  const usage = usageQ.data;
  const inUse = usage != null && isExerciseInUse(usage);
  const name = exercise?.nom_exercice ?? "";

  return (
    <AlertDialog open={exercise != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {inUse ? `Archiver « ${name} » ?` : `Supprimer « ${name} » ?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              {usageQ.isError ? (
                <UsageCheckFailed onRetry={() => void usageQ.refetch()} retrying={usageQ.isFetching} />
              ) : usage == null ? (
                <Checking />
              ) : inUse ? (
                <>
                  <p>
                    Cet exercice est utilisé : {exerciseUsageText(usage)}. Le supprimer effacerait cet
                    historique pour tous les nageurs.
                  </p>
                  <p className="mt-2">
                    Archivé, il n'apparaît plus dans le catalogue, les sélecteurs ni les prochains
                    mésocycles. Les séances existantes, les séries et les 1RM sont conservés. Tu peux
                    le restaurer à tout moment.
                  </p>
                </>
              ) : (
                <p>Il n'est utilisé nulle part. Cette action est définitive.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          {exercise != null && usage != null && !usageQ.isError &&
            (inUse ? (
              <AlertDialogAction onClick={() => onArchive(exercise.id)}>Archiver l'exercice</AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={() => onDelete(exercise.id)} className={destructive}>
                Supprimer l'exercice
              </AlertDialogAction>
            ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ConfirmSessionDeleteDialogProps {
  session: { id: number; title: string } | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: number) => void;
}

export function ConfirmSessionDeleteDialog({ session, onOpenChange, onDelete }: ConfirmSessionDeleteDialogProps) {
  const usageQ = useQuery({
    queryKey: ["strength-session-usage", session?.id],
    queryFn: () => getStrengthSessionUsage(session!.id),
    enabled: session != null,
    staleTime: 0,
  });
  const usage = usageQ.data;
  const usageText = usage ? sessionUsageText(usage) : "";
  const known = usage != null && !usageQ.isError;

  return (
    <AlertDialog open={session != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {session?.title ?? ""} » ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              {usageQ.isError ? (
                <UsageCheckFailed onRetry={() => void usageQ.refetch()} retrying={usageQ.isFetching} feminine />
              ) : usage == null ? (
                <Checking />
              ) : usageText ? (
                <p>
                  Elle est utilisée dans {usageText} : ces jours seront vidés chez les nageurs
                  concernés. Cette action est définitive.
                </p>
              ) : (
                <p>Elle n'est planifiée nulle part. Cette action est définitive.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={!known}
            onClick={() => session && onDelete(session.id)}
            className={destructive}
          >
            Supprimer la séance
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

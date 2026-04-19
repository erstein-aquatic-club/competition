import { User, ShieldCheck } from "lucide-react";
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

export interface PreservedIndividual {
  userId: number;
  displayName: string;
  sessionTitle: string;
}

interface PreservedIndividualsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupSessionTitle: string;
  groupName?: string;
  scheduledDate: string;
  preservedIndividuals: PreservedIndividual[];
  onConfirm: () => void;
  confirmLabel?: string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

export default function PreservedIndividualsDialog({
  open,
  onOpenChange,
  groupSessionTitle,
  groupName,
  scheduledDate,
  preservedIndividuals,
  onConfirm,
  confirmLabel = "Confirmer",
}: PreservedIndividualsDialogProps) {
  if (preservedIndividuals.length === 0) return null;

  const readableDate = formatDate(scheduledDate);
  const count = preservedIndividuals.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800/50">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-base sm:text-lg">
              Séances personnelles préservées
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-muted-foreground">
                Tu assignes <span className="font-medium text-foreground">« {groupSessionTitle} »</span>
                {groupName ? (
                  <> au groupe <span className="font-medium text-foreground">{groupName}</span></>
                ) : null}{" "}
                le <span className="font-medium text-foreground">{readableDate}</span>.
              </p>
              <p className="text-sm text-muted-foreground">
                {count === 1 ? "Le nageur suivant garde" : "Les nageurs suivants gardent"} leur séance personnelle :
              </p>
              <ul
                className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2"
                role="list"
              >
                {preservedIndividuals.map((individual) => (
                  <li
                    key={individual.userId}
                    className="flex items-center gap-2 rounded-sm bg-background px-2 py-1.5 text-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                      <User className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-foreground">{individual.displayName}</span>
                      <span className="text-muted-foreground"> — « {individual.sessionTitle} »</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
